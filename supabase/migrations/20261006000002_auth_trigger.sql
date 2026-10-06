-- Migration: 20261006000002_auth_trigger.sql
-- Description: Automatically create a profile row in public.profiles when a new user signs up in auth.users

-- 1. Create the trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  raw_name text;
  raw_contact text;
  raw_role text;
begin
  -- Extract user metadata passed from supabase.auth.signUp({ options: { data: { ... } } })
  raw_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(coalesce(new.email, 'مستخدم'), '@', 1),
    'مستخدم'
  );

  raw_contact := coalesce(
    nullif(trim(new.raw_user_meta_data->>'contact'), ''),
    new.email,
    ''
  );

  raw_role := coalesce(
    nullif(trim(new.raw_user_meta_data->>'role'), ''),
    'student'
  );

  -- Insert profile row
  insert into public.profiles (id, name, contact, role, created_at, updated_at)
  values (
    new.id,
    raw_name,
    raw_contact,
    raw_role,
    now(),
    now()
  )
  on conflict (id) do update set
    name = coalesce(nullif(excluded.name, ''), public.profiles.name),
    contact = coalesce(nullif(excluded.contact, ''), public.profiles.contact),
    role = coalesce(nullif(excluded.role, ''), public.profiles.role),
    updated_at = now();

  return new;
end;
$$;

-- 2. Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Verify and reinforce RLS policies on public.profiles
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- 4. Backfill any existing users in auth.users who do not yet have a profile in public.profiles
insert into public.profiles (id, name, contact, role, created_at, updated_at)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(coalesce(u.email, 'مستخدم'), '@', 1), 'مستخدم'),
  coalesce(nullif(trim(u.raw_user_meta_data->>'contact'), ''), u.email, ''),
  coalesce(nullif(trim(u.raw_user_meta_data->>'role'), ''), 'student'),
  u.created_at,
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
