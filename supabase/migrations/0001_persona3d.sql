-- Persona3D schema, row-level security and private storage.
-- The API uses the service-role key and always scopes queries to the signed-in
-- user; RLS below additionally protects any direct client (anon key) access.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null default '',
  allow_training boolean not null default false, -- explicit opt-in only
  retention_days integer not null default 30 check (retention_days in (7, 30, 90, 365)),
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  style text not null,
  generation_status text not null default 'draft'
    check (generation_status in ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  model_url text,       -- storage path, never a public URL
  thumbnail_url text,
  texture_url text,
  rig_status text not null default 'none' check (rig_status in ('none', 'pending', 'rigged', 'failed', 'unsupported')),
  provider text,
  settings jsonb,
  customisation jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_user_idx on public.characters (user_id, created_at desc);

create table if not exists public.character_photos (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  angle text not null check (angle in ('front', 'three_quarter_left', 'left', 'three_quarter_right', 'right', 'back')),
  image_url text not null,
  quality_status text not null default '',
  created_at timestamptz not null default now(),
  unique (character_id, angle)
);

create table if not exists public.animations (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  animation_name text not null,
  animation_url text,
  duration real not null default 0,
  source text not null check (source in ('embedded', 'provider', 'procedural')),
  created_at timestamptz not null default now()
);
create index if not exists animations_character_idx on public.animations (character_id);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  provider text not null,
  job_status text not null check (job_status in ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress_stage text,
  stages jsonb not null,
  provider_task_ids jsonb not null default '{}',
  error_message text,
  cancel_requested boolean not null default false,
  usage jsonb not null default '{"calls": 0}',
  meta jsonb not null default '{}',
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists jobs_active_idx on public.generation_jobs (job_status) where job_status in ('queued', 'processing');
create index if not exists jobs_character_idx on public.generation_jobs (character_id, created_at desc);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  export_format text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

-- ── Row-level security ────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.characters enable row level security;
alter table public.character_photos enable row level security;
alter table public.animations enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.exports enable row level security;

create policy "own profile" on public.users for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own characters" on public.characters for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own jobs (read)" on public.generation_jobs for select using (user_id = auth.uid());

create policy "own photos" on public.character_photos for all
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));
create policy "own animations" on public.animations for select
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));
create policy "own exports" on public.exports for select
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

-- ── Private storage ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('persona3d-private', 'persona3d-private', false)
  on conflict (id) do update set public = false;

-- Objects live under users/<uid>/...; a user can only touch their own prefix.
create policy "own files" on storage.objects for all
  using (bucket_id = 'persona3d-private' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'persona3d-private' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
