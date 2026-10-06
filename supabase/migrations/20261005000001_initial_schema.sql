-- Supabase Schema for Adwam
-- Enable uuid-ossp if needed
create extension if not exists "uuid-ossp";

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  contact text not null,
  role text not null check (role in ('student', 'teacher')) default 'student',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- 2. Memorization Plans
create table if not exists public.memorization_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_page integer not null default 1,
  current_position integer not null default 1,
  pages_per_day integer not null default 1,
  total_pages integer not null default 604,
  completed_pages integer not null default 0,
  completed_ayahs integer not null default 0,
  missed_days integer not null default 0,
  streak integer not null default 0,
  duration_days integer not null default 604,
  goal_mode text not null default 'pace',
  goal text not null default 'pace',
  start_type text not null default 'beginning',
  active_days jsonb not null default '[]'::jsonb,
  target_date text,
  goal_date text,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.memorization_plans enable row level security;
create policy "Users can manage their own plans" on public.memorization_plans
  for all using (auth.uid() = user_id);

-- 3. Plan Days / Activities
create table if not exists public.plan_days (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.memorization_plans(id) on delete cascade,
  date text not null,
  kind text not null,
  page_from integer not null,
  page_to integer not null,
  ayah_from integer,
  ayah_to integer,
  surah_names jsonb default '[]'::jsonb,
  planned_pages integer not null default 1,
  completed_pages integer not null default 0,
  assessment text,
  status text not null default 'completed',
  source text not null default 'inside_app',
  duration_minutes integer,
  reason text,
  created_at timestamptz default now()
);

alter table public.plan_days enable row level security;
create policy "Users can manage their own plan days" on public.plan_days
  for all using (auth.uid() = user_id);

-- 4. Mastery Snapshots
create table if not exists public.mastery_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page integer not null,
  assessment text not null,
  score integer not null,
  date text not null,
  source_activity_id text,
  created_at timestamptz default now()
);

alter table public.mastery_snapshots enable row level security;
create policy "Users can manage their own mastery snapshots" on public.mastery_snapshots
  for all using (auth.uid() = user_id);

-- 5. Review Assignments
create table if not exists public.review_assignments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  page integer not null,
  ayah integer not null,
  reason text not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  next_review text not null,
  repetitions integer not null default 0,
  created_at timestamptz default now()
);

alter table public.review_assignments enable row level security;
create policy "Users can manage their own review assignments" on public.review_assignments
  for all using (auth.uid() = user_id);

-- 6. Recitation Attempts
create table if not exists public.recitation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page integer not null,
  surah_number integer,
  ayah_number integer,
  expected_text text not null,
  transcript text not null,
  match_rate numeric(5,2),
  differences jsonb default '[]'::jsonb,
  audio_url text,
  created_at timestamptz default now()
);

alter table public.recitation_attempts enable row level security;
create policy "Users can manage their own recitation attempts" on public.recitation_attempts
  for all using (auth.uid() = user_id);

-- 7. Streaks
create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_active_date text,
  updated_at timestamptz default now()
);

alter table public.streaks enable row level security;
create policy "Users can manage their own streaks" on public.streaks
  for all using (auth.uid() = user_id);

-- 8. Grace Days
create table if not exists public.grace_days (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used integer default 0,
  allowance integer default 1,
  active_until text,
  updated_at timestamptz default now()
);

alter table public.grace_days enable row level security;
create policy "Users can manage their own grace days" on public.grace_days
  for all using (auth.uid() = user_id);

-- 9. User Settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text default 'ar',
  theme text default 'sand',
  reciter_id text default 'alafasy',
  updated_at timestamptz default now()
);

alter table public.user_settings enable row level security;
create policy "Users can manage their own settings" on public.user_settings
  for all using (auth.uid() = user_id);

-- Storage bucket for recitations
insert into storage.buckets (id, name, public)
values ('recitations', 'recitations', true)
on conflict (id) do nothing;

create policy "Users can upload their recitation audio"
  on storage.objects for insert
  with check (bucket_id = 'recitations' and auth.uid() is not null);

create policy "Recitation audio is accessible by owner or public"
  on storage.objects for select
  using (bucket_id = 'recitations');
