import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getProfile, type SpotifyUser } from "@/lib/spotify";

let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment."
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function requireSpotifyUser(req: Request): Promise<SpotifyUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new AuthError("Missing Spotify access token.", 401);
  }
  try {
    return await getProfile(token);
  } catch {
    throw new AuthError("Invalid or expired Spotify token.", 401);
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function ensureProfile(user: SpotifyUser) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").upsert(
    {
      spotify_user_id: user.id,
      display_name: user.display_name,
      updated_at: now,
    },
    { onConflict: "spotify_user_id" }
  );
  if (error) throw new Error(error.message);
}
