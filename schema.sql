-- Siap Lari: skema di project Supabase yang sama dengan Dompetku.
-- Semua tabel berawalan sl_ supaya tidak tercampur dengan tabel Dompetku.
-- Setiap baris milik satu pengguna; hanya pemiliknya yang bisa membaca dan mengubah.
-- Jalankan sekali di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman dijalankan ulang.

-- ========== Profil (untuk hitungan TRIMP) ==========
create table if not exists public.sl_profile (
  user_id    uuid primary key references auth.users on delete cascade default auth.uid(),
  hr_max     smallint not null default 190 check (hr_max between 120 and 230),
  hr_rest    smallint check (hr_rest between 30 and 100),          -- kosong = otomatis dari check-in
  sex        text not null default 'L' check (sex in ('L','P')),    -- faktor TRIMP Banister
  updated_at timestamptz not null default now()
);

-- ========== Lari ==========
create table if not exists public.sl_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  started_at  timestamptz not null,                                -- dibulatkan ke menit (kunci anti-dobel)
  title       text check (char_length(title) <= 120),
  duration_s  integer not null check (duration_s between 60 and 172800),
  distance_m  integer check (distance_m between 0 and 500000),
  avg_hr      smallint check (avg_hr between 40 and 230),
  max_hr      smallint check (max_hr between 40 and 240),
  ascent_m    integer check (ascent_m between 0 and 20000),
  rpe         smallint check (rpe between 1 and 10),
  treadmill   boolean not null default false,
  source      text not null default 'manual' check (source in ('manual','csv','fit')),
  created_at  timestamptz not null default now(),
  unique (user_id, started_at)
);
create index if not exists sl_runs_user_time on public.sl_runs (user_id, started_at desc);

-- ========== Check-in pagi ==========
create table if not exists public.sl_checkins (
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  day          date not null,
  rhr          smallint check (rhr between 30 and 120),             -- detak jantung istirahat
  rmssd        numeric(5,1) check (rmssd between 1 and 300),        -- HRV
  sdnn         numeric(5,1) check (sdnn between 1 and 400),
  body_battery smallint check (body_battery between 0 and 100),
  sleep_h      numeric(3,1) check (sleep_h between 0 and 16),
  soreness     smallint check (soreness between 1 and 5),           -- 1 tidak pegal .. 5 sangat pegal
  mood         smallint check (mood between 1 and 5),               -- 1 buruk .. 5 sangat baik
  note         text check (char_length(note) <= 300),
  source       text not null default 'manual' check (source in ('manual','impor','campuran')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);

-- ========== Row Level Security: hanya pemilik ==========
alter table public.sl_profile  enable row level security;
alter table public.sl_runs     enable row level security;
alter table public.sl_checkins enable row level security;

revoke all on public.sl_profile, public.sl_runs, public.sl_checkins from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.sl_profile, public.sl_runs, public.sl_checkins to authenticated;

drop policy if exists sl_profile_own on public.sl_profile;
create policy sl_profile_own on public.sl_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sl_runs_own on public.sl_runs;
create policy sl_runs_own on public.sl_runs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sl_checkins_own on public.sl_checkins;
create policy sl_checkins_own on public.sl_checkins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
