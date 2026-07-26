-- Migration: section markers + share tokens (run if you already created tables)
-- Safe to re-run with IF NOT EXISTS / exception guards where noted.

alter table events add column if not exists share_token text;
create unique index if not exists events_share_token_uidx on events (share_token)
  where share_token is not null;

alter table event_items add column if not exists marker_kind text;
alter table event_items add column if not exists label text;

-- Widen item_type check to include markers (drop + recreate constraint)
alter table event_items drop constraint if exists event_items_item_type_check;
alter table event_items
  add constraint event_items_item_type_check
  check (item_type in ('tanda', 'cortina', 'marker'));
