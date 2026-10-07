-- Mira Cognitive OS private persistence schema.
-- Deployment template only. Apply to a dedicated Mira project after explicit infrastructure approval.
-- This schema is intentionally not exposed through Supabase Data API.

create schema if not exists mira_core;

revoke all on schema mira_core from public, anon, authenticated;
alter default privileges in schema mira_core revoke all on tables from public, anon, authenticated;
alter default privileges in schema mira_core revoke all on sequences from public, anon, authenticated;
alter default privileges in schema mira_core revoke execute on functions from public, anon, authenticated;

create table if not exists mira_core.state (
  kind text not null,
  id text not null,
  payload jsonb not null,
  status text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create index if not exists state_kind_status_updated_idx
  on mira_core.state (kind, status, updated_at desc);

create table if not exists mira_core.event (
  sequence bigint generated always as identity primary key,
  stream_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists event_stream_sequence_idx
  on mira_core.event (stream_id, sequence);

create table if not exists mira_core.lease (
  resource_id text primary key,
  owner_id text not null,
  fencing_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lease_expires_idx
  on mira_core.lease (expires_at);

comment on schema mira_core is
  'Private server-side state for Mira Cognitive OS. Do not expose via PostgREST/Data API.';
