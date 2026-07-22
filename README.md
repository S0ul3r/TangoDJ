# TangoDJ — Milonga DJ Assistant

Desktop-first Next.js app for organizing **tango / vals / milonga / cortina** libraries into tandas and milonga night queues. Playback uses **Spotify Connect** (the Spotify desktop/mobile app) or local audio files. Library, tandas, and events sync through **Supabase**, with an offline localStorage cache as backup.

Repo: [github.com/S0ul3r/TangoDJ](https://github.com/S0ul3r/TangoDJ)

## Stack

- Next.js 16 + React 19 + TypeScript + Tailwind v4
- Spotify OAuth PKCE + Connect Web API
- Supabase Postgres (service-role writes via Next API routes)
- File System Access API for local files (Chrome / Edge)

## Setup

### 1. Install

```bash
cd TangoDJ
npm install
cp .env.example .env.local
```

### 2. Spotify app

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add redirect URI: `http://127.0.0.1:3000/callback`  
   (Use **127.0.0.1**, not `localhost` — different origins break PKCE.)
4. Put the Client ID in `.env.local`:

```env
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id
NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
```

5. Open the app at **http://127.0.0.1:3000**

### 3. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Add to `.env.local`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

API routes validate the caller’s Spotify access token, then read/write with the service role scoped to that Spotify user id. Without Supabase, the UI still works from the **localStorage cache** (sync warning in the header).

### 4. Run

```bash
npm run dev
```

Production build locally:

```bash
npm run build
npm run start
```

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Landing + Spotify login |
| `/library` | Genre shelves, Spotify playlist import, search, local files |
| `/tandas` | Create/edit tandas + genre-strict suggestions |
| `/events` | Night queue, rule validation, auto-generate, save |
| `/dj` | DJ console: device picker, play/pause/skip, queue |
| `/remote` | Phone remote for Connect control |

## Library

### Spotify

1. Select a genre tab (**Tango / Vals / Milonga / Cortina**)
2. Import a playlist you **own or collaborate on**, or search and add single tracks
3. Edit tracks: change genre, set orchestra tag, select / move / delete

Development Mode apps can only read playlist **contents** for playlists you own or collaborate on.

### Local files (Chrome / Edge)

**Into the active genre** (flat folder or loose MP3s — e.g. cortina soundboard files):

- **Add local file(s)** — pick one or more audio files
- **Import folder into [genre]** — scan a folder of mp3/m4a/wav/flac/ogg into the selected tab

**Structured library** (optional — top-right button):

```
MyTango/
  Tango/
  Vals/
  Milonga/
  Cortina/
```

Audio files stay on disk; only metadata/paths sync. Permissions are stored in IndexedDB.

### Orchestra field

Optional tag for the orchestra/ensemble (Di Sarli, Pugliese, …). Used for tanda suggestions — not required for playback.

## Tandas & recommendations

Create named tandas (typically 4 tango / 3 vals or milonga). After selecting seed tracks, **Suggest more [genre]** ranks unused library tracks by orchestra/artist affinity, then Spotify search with genre keywords. Suggestions never cross genres (vals → vals only, etc.).

## Events & sequencing

Night queues follow El Recodo–style rules (`src/lib/domain/sequencing.ts`):

- Every tanda should be followed by a cortina
- Never two “fast” tandas (`vals` / `milonga`) back-to-back
- Prefer ~2 tango tandas between each fast tanda

You can validate, auto-generate from your tanda pool, save named events, and load them into the DJ view.

## Playback

- **Primary:** Spotify Connect — open the Spotify app, pick the device, set quality to **Very High** / HiFi in Spotify settings
- **Secondary:** Local HTML5 audio for imported files
- Mixed queues are allowed; engines switch per track
- If Connect fails, the controller tries a **same-genre local fallback** (title/artist match when possible)
- Library/tandas/events stay in a **localStorage cache** if Supabase is unavailable

## Spotify scopes

`user-read-private`, `user-read-email`, `user-library-read`, `playlist-read-private`, `playlist-read-collaborative`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`

(`streaming` is not required for Connect control.)

## Hosting (optional)

To use the app from any PC, deploy to [Vercel](https://vercel.com) or [Render](https://render.com), set the same env vars there, and add your production callback in Spotify Dashboard, e.g. `https://your-app.vercel.app/callback`. Local MP3s still stay on the machine that imports them; Connect still plays through the Spotify app on the DJ device.

## Project layout

```
src/
  app/           # routes + API + icons
  components/    # AppShell, DevicePicker
  context/       # Spotify, Library, Playback
  hooks/         # auth fetch, playlists, Connect devices
  lib/
    auth.ts
    spotify.ts
    domain/      # tanda, sequencing, recommendations
    playback/    # queueController, Connect, localAudio
    supabase/
    localFiles.ts
    cache.ts
supabase/schema.sql
```
