-- Align core schema.
-- Storage design: raw observations (binary track files in Storage), the immutable
-- analysis payload (compressed JSONB), narrow metric rows for trends, and generated
-- prose live in separate tables. No per-frame rows are ever stored in Postgres.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  role text not null default 'player' check (role in ('player', 'coach')),
  handedness text not null default 'right' check (handedness in ('right', 'left')),
  height_cm smallint check (height_cm between 100 and 230),
  age_band text check (age_band in ('u13', '13_15', '16_18', 'adult', 'masters')),
  skill_level text check (skill_level in ('beginner', 'club', 'academy', 'elite')),
  is_minor boolean not null default false,
  guardian_email text check (guardian_email is null or guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  raw_video_retention_days smallint not null default 14 check (raw_video_retention_days between 0 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Consent history (append-only) ----------
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('video_processing', 'cloud_storage', 'coach_sharing', 'model_training', 'guardian')),
  granted boolean not null,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index consents_latest on public.consents (user_id, kind, created_at desc);

-- ---------- Coach relationships ----------
create table public.coach_invites (
  code text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  coach_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index coach_invites_coach on public.coach_invites (coach_id);

create table public.coach_links (
  coach_id uuid not null references auth.users (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, player_id),
  check (coach_id <> player_id)
);
create index coach_links_player on public.coach_links (player_id);

-- ---------- Analyses (one row per delivery, queryable summary) ----------
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  requested_shot text not null default 'front_foot_defence',
  tier text not null check (tier in ('quick', 'session3d', 'lab')),
  mode text not null check (mode in ('video', 'posture_screen')),
  status text not null check (status in ('valid', 'invalid_for_requested_analysis', 'uncertain_shot', 'capture_failed')),
  status_reason text not null,
  observed_label text,
  observed_prob real check (observed_prob between 0 and 1),
  capture_confidence real not null check (capture_confidence between 0 and 1),
  technique_index smallint check (technique_index between 0 and 100),
  engine_version text not null,
  metric_version text not null,
  registry_hash text not null,
  input_hash text not null,
  result_hash text not null,
  demo boolean not null default false,
  title text check (char_length(title) <= 120),
  notes text check (char_length(notes) <= 4000),
  tags text[] not null default '{}',
  representative boolean not null default false,
  constraint score_only_when_valid check (technique_index is null or status = 'valid')
);
create index analyses_owner_recent on public.analyses (owner_id, recorded_at desc);
create index analyses_tags on public.analyses using gin (tags);

-- ---------- Immutable analysis payload ----------
create table public.analysis_payloads (
  analysis_id uuid primary key references public.analyses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.analysis_payloads alter column payload set compression lz4;
create index analysis_payloads_owner on public.analysis_payloads (owner_id);

-- ---------- Raw observation pointer (track file lives in Storage) ----------
create table public.observations (
  analysis_id uuid primary key references public.analyses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  encoding text not null default 'align-tracks-v1',
  bytes integer not null check (bytes > 0 and bytes <= 2097152),
  sha256 text not null,
  frame_count integer not null,
  fps real,
  created_at timestamptz not null default now()
);
create index observations_owner on public.observations (owner_id);

-- ---------- Narrow metric rows for trends ----------
create table public.metric_values (
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  metric_id text not null,
  status text not null check (status in ('measured', 'estimated', 'not_measured')),
  value real,
  uncertainty real,
  confidence real,
  in_range boolean,
  recorded_at timestamptz not null,
  primary key (analysis_id, metric_id)
);
create index metric_values_trend on public.metric_values (owner_id, metric_id, recorded_at);

-- ---------- Generated prose (separate from measurements) ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  generator text not null,
  audience text not null check (audience in ('player', 'coach', 'parent', 'analyst')),
  body jsonb not null,
  violations integer not null default 0,
  created_at timestamptz not null default now()
);
create index reports_analysis on public.reports (analysis_id);
create index reports_owner on public.reports (owner_id);

-- ---------- Versioned personal baselines ----------
create table public.baselines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version integer not null,
  stats jsonb not null,
  analysis_ids uuid[] not null,
  active boolean not null default true,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (owner_id, version)
);

-- ---------- Coach/athlete annotations (never overwrite the model result) ----------
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('note', 'shot_override', 'event_override', 'dismiss_finding', 'drill_assignment')),
  frame integer,
  body jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index annotations_analysis on public.annotations (analysis_id);
create index annotations_author on public.annotations (author_id);

-- ---------- Media objects with retention ----------
create table public.media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid references public.analyses (id) on delete cascade,
  bucket text not null check (bucket in ('tracks', 'evidence', 'raw-video')),
  path text not null unique,
  bytes integer not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index media_objects_owner on public.media_objects (owner_id);
create index media_objects_analysis on public.media_objects (analysis_id);
create index media_objects_expiry on public.media_objects (expires_at) where expires_at is not null;

-- ---------- Audit trail (shares, consent changes, deletions) ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  subject_owner uuid,
  action text not null,
  subject_type text not null,
  subject_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_subject_owner on public.audit_log (subject_owner, created_at desc);
create index audit_log_actor on public.audit_log (actor_id, created_at desc);

-- ---------- Engine registry snapshots (public, content-addressed) ----------
create table public.registry_versions (
  hash text primary key,
  engine_version text not null,
  metric_version text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);
