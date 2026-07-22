-- TangoDJ Supabase schema
-- Run in Supabase SQL editor for your project.

create table if not exists profiles (
  spotify_user_id text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tracks (
  id uuid primary key,
  spotify_user_id text not null references profiles (spotify_user_id) on delete cascade,
  source text not null check (source in ('spotify', 'local')),
  genre text not null check (genre in ('tango', 'vals', 'milonga', 'cortina')),
  name text not null,
  artists text not null default '',
  orchestra text,
  year int,
  singer text,
  duration_ms int,
  spotify_uri text,
  spotify_id text,
  album_art_url text,
  local_rel_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracks_user_idx on tracks (spotify_user_id);
create index if not exists tracks_genre_idx on tracks (spotify_user_id, genre);

create table if not exists tandas (
  id uuid primary key,
  spotify_user_id text not null references profiles (spotify_user_id) on delete cascade,
  name text not null,
  genre text not null check (genre in ('tango', 'vals', 'milonga')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tanda_tracks (
  tanda_id uuid not null references tandas (id) on delete cascade,
  track_id uuid not null references tracks (id) on delete cascade,
  position int not null,
  primary key (tanda_id, position)
);

create table if not exists events (
  id uuid primary key,
  spotify_user_id text not null references profiles (spotify_user_id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists event_items (
  id uuid primary key,
  event_id uuid not null references events (id) on delete cascade,
  position int not null,
  item_type text not null check (item_type in ('tanda', 'cortina')),
  tanda_id uuid references tandas (id) on delete set null,
  track_id uuid references tracks (id) on delete set null,
  unique (event_id, position)
);

create index if not exists events_user_idx on events (spotify_user_id);

-- RLS enabled but MVP writes go through service-role API routes that
-- validate the caller's Spotify access token server-side.
alter table profiles enable row level security;
alter table tracks enable row level security;
alter table tandas enable row level security;
alter table tanda_tracks enable row level security;
alter table events enable row level security;
alter table event_items enable row level security;
