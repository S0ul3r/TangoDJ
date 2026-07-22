# TangoDJ — Milonga DJ Assistant

Desktop-first Next.js app for organizing tango / vals / milonga / cortina libraries into tandas and milonga night queues. Playback goes through **Spotify Connect** (the Spotify desktop/mobile app) or local **MP3** files. Library, tandas, and events sync via **Supabase**.

## Stack

- Next.js 16 + React 19 + TypeScript + Tailwind v4
- Spotify OAuth PKCE + Connect Web API
- Supabase Postgres (service-role writes via Next API routes)
- File System Access API for local folders (Chrome / Edge)

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
   (Use **127.0.0.1**, not `localhost` — they are different origins for PKCE storage.)
4. Put the Client ID in `.env.local`:

```env
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id
NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
```

5. Open the app at **http://127.0.0.1:3000** (same host as the redirect).

### 3. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Add to `.env.local`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

API routes validate the caller’s Spotify access token (`GET /v1/me`), then read/write with the service role scoped to that Spotify user id. Without Supabase, the UI still works from a **localStorage cache** (you’ll see a sync warning).

### 4. Run

```bash
npm run dev
```

## Local music folder layout

On desktop Chrome/Edge, use **Library → Link local music folder**. Expected structure:

```
MyTango/
  Tango/
  Vals/
  Milonga/
  Cortina/
```

MP3s (also m4a/wav/flac/ogg) under those genre folders are scanned. Only relative paths and metadata sync to Supabase — audio files stay on disk. Folder permission is stored in IndexedDB via `FileSystemHandle`.

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Landing + Spotify login |
| `/library` | Genre shelves, **playlist import**, Spotify search, local folder |
| `/tandas` | Create/edit tandas + **genre-strict recommendations** |
| `/events` | Night queue, validate rules, auto-generate, save |
| `/dj` | Full DJ console: device picker, play/pause/skip, queue |
| `/remote` | Slim phone remote for Connect control |

### Playlist import

On **Library**, pick the genre tab (Tango / Vals / Milonga / Cortina), then either:

- Choose one of your Spotify playlists from the dropdown, or
- Paste an `open.spotify.com/playlist/…` link

All tracks are added to the **currently selected** genre (duplicates skipped).

### Offline / quality notes

- Library, tandas, and events are always written to a **localStorage cache** so the desk works if Supabase is down.
- Spotify Connect playback quality follows the **Spotify desktop app** (set Very High / HiFi there). Downloaded playlist tracks can play from the app while offline; the web UI still needs network for the Connect API commands.
- If Spotify Connect fails mid-set, the queue controller tries a **local file fallback** of the same genre (matching title/artist when possible).

### Recommendations

On **Tandas**, after selecting seed tracks, use **Suggest more [genre]**. Suggestions stay **strictly** within that genre (vals → vals only, etc.), ranking unused library tracks by orchestra/artist affinity, then Spotify search with genre keywords.

## Local music folder layout

Enforced in `src/lib/domain/sequencing.ts` (El Recodo–style):

- Every tanda should be followed by a cortina
- Never two “fast” tandas (`vals` / `milonga`) back-to-back
- Prefer ~2 tango tandas between each fast tanda

## Playback & quality

- **Primary:** Spotify Connect — open the Spotify app, pick it in the device list, set quality to **Very High** / HiFi in the Spotify app settings
- **Secondary:** Local HTML5 `<audio>` for imported files
- Mixed queues are allowed; the controller switches engines per track

## Spotify scopes

`user-read-private`, `user-read-email`, `user-library-read`, `playlist-read-private`, `playlist-read-collaborative`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`

(`streaming` is not required for Connect control.)

## Project layout

```
src/
  app/           # routes + API
  components/    # AppShell, DevicePicker
  context/       # Spotify, Library, Playback
  lib/
    auth.ts
    spotify.ts
    domain/      # tanda + sequencing
    playback/    # queueController, Connect, localAudio
    supabase/
    localFiles.ts
supabase/schema.sql
```

## Deferred (post-MVP)

- Orchestra / song recommendations
- Full PWA offline shell
- Uploading MP3s to the cloud
- Web Playback SDK fallback
