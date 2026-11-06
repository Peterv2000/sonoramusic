-- ══════════════════════════════════════════════════════════════════════════
-- Sonora Music · esquema para Supabase/PostgreSQL (plan Free)
--
-- Ejecuta este archivo en Supabase → SQL Editor.
--
-- El API de Sonora mantiene el mismo contrato (`/api/v1/tracks`,
-- `/api/v1/categories`, `/api/v1/home/feed`). Estas tablas son el almacén
-- global que sustituye a los JSON de `server/data/` cuando se configura
-- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en Render.
--
-- Seguridad:
--   · categories/tracks → lectura pública (la web y la APK no necesitan login).
--   · historial, licencias y telemetría → solo service_role (el servidor).
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Catálogo global ───────────────────────────────────────────────────────

create table if not exists public.categories (
  id          text primary key,
  label       text not null,
  tag         text,
  tag_en      text,
  color       text default '#ff0033',
  icon        text default 'sparkles',
  cover       text,
  genres      text[] not null default '{}',
  queries     text[] not null default '{}',
  active      boolean not null default true,
  sort        integer not null default 100,
  updated_at  timestamptz not null default now()
);

create table if not exists public.tracks (
  id            text primary key,
  yt            text unique not null,
  title         text not null,
  artist        text not null default 'Sonora Music',
  album         text default 'Sonora',
  genre         text default 'Sonora',
  category_id   text references public.categories(id) on delete set null,
  moods         text[] not null default '{}',
  dur           integer not null default 0,
  year          integer,
  views         bigint not null default 0,
  thumb         text,
  stream_url    text,
  source        text not null default 'sonora',
  external      boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tracks_category_idx on public.tracks (category_id) where active;
create index if not exists tracks_genre_idx on public.tracks (lower(genre)) where active;
create index if not exists tracks_views_idx on public.tracks (views desc) where active;
create index if not exists tracks_title_trgm_idx on public.tracks using gin (title gin_trgm_ops);
-- Si la extensión pg_trgm no está disponible, elimina la línea anterior:
-- create extension if not exists pg_trgm;

-- ── Historial de escucha (recomendaciones y rotación) ─────────────────────

create table if not exists public.user_listening_history (
  id           bigserial primary key,
  user_id      text not null,
  track_id     text,
  yt           text,
  title        text,
  artist       text,
  genre        text,
  category_id  text,
  moods        text[] not null default '{}',
  played_at    timestamptz not null default now()
);

create index if not exists history_user_time_idx
  on public.user_listening_history (user_id, played_at desc);
create index if not exists history_genre_idx
  on public.user_listening_history (lower(genre));

-- ── Licencias por empresa / tenant ────────────────────────────────────────

create table if not exists public.company_licenses (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  contact_email text,
  plan          text not null default 'free',
  seats         integer not null default 1,
  status        text not null default 'active'
                check (status in ('active', 'trial', 'suspended', 'expired')),
  valid_until   timestamptz,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists licenses_status_idx on public.company_licenses (status, valid_until);

-- ── Telemetría del QA Robot ───────────────────────────────────────────────

create table if not exists public.telemetry_errors (
  id          text primary key,
  created_at  timestamptz not null default now(),
  type        text not null,
  severity    text not null,
  message     text,
  code        text,
  track_id    text,
  title       text,
  artist      text,
  source      text,
  latency_ms  integer default 0,
  platform    text,
  app_version text,
  context     jsonb
);

create index if not exists telemetry_created_idx on public.telemetry_errors (created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.categories enable row level security;
alter table public.tracks enable row level security;
alter table public.user_listening_history enable row level security;
alter table public.company_licenses enable row level security;
alter table public.telemetry_errors enable row level security;

-- Lectura pública solo del catálogo activo.
drop policy if exists "catalog read" on public.categories;
create policy "catalog read" on public.categories
  for select using (active = true and auth.role() = 'anon');

drop policy if exists "tracks read" on public.tracks;
create policy "tracks read" on public.tracks
  for select using (active = true and auth.role() = 'anon');

-- El servidor (service_role) escribe el catálogo, el historial y la telemetría.
drop policy if exists "service writes categories" on public.categories;
create policy "service writes categories" on public.categories
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service writes tracks" on public.tracks;
create policy "service writes tracks" on public.tracks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service history" on public.user_listening_history;
create policy "service history" on public.user_listening_history
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service licenses" on public.company_licenses;
create policy "service licenses" on public.company_licenses
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service telemetry" on public.telemetry_errors;
create policy "service telemetry" on public.telemetry_errors
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
