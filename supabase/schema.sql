-- CampusConnect database setup. Run this in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'student' check (role in ('student', 'organizer')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text not null default '';

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  category text not null default 'Campus event',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  capacity integer not null default 50 check (capacity > 0),
  created_at timestamptz not null default now(),
  constraint event_end_after_start check (ends_at > starts_at)
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_registration_per_student unique (event_id, student_id)
);

create index if not exists events_starts_at_idx on public.events(starts_at);
create index if not exists events_organizer_id_idx on public.events(organizer_id);
create index if not exists registrations_student_id_idx on public.registrations(student_id);
create index if not exists registrations_event_id_idx on public.registrations(event_id);

create or replace function public.create_campusconnect_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'role' = 'organizer' then 'organizer' else 'student' end
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_campusconnect on auth.users;
create trigger on_auth_user_created_campusconnect
  after insert on auth.users
  for each row execute procedure public.create_campusconnect_profile();

create or replace function public.register_for_event(target_event_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  attendee_count integer;
  registration_id uuid;
begin
  if auth.uid() is null then raise exception 'Please log in to register.'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student'
  ) then raise exception 'Only student accounts can register for events.'; end if;
  select * into event_row from public.events where id = target_event_id for update;
  if not found then raise exception 'Event not found.'; end if;
  if event_row.starts_at <= now() then raise exception 'Registration is closed for this event.'; end if;
  select count(*) into attendee_count from public.registrations where event_id = target_event_id;
  if attendee_count >= event_row.capacity then raise exception 'This event is full.'; end if;
  insert into public.registrations (event_id, student_id)
  values (target_event_id, auth.uid())
  on conflict (event_id, student_id) do nothing
  returning id into registration_id;
  if registration_id is null then raise exception 'You are already registered for this event.'; end if;
  return jsonb_build_object('id', registration_id, 'event_id', target_event_id);
end;
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "Profiles are viewable by their owner" on public.profiles;
create policy "Profiles are viewable by their owner" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Organizers can view attendees for their events" on public.profiles;
create policy "Organizers can view attendees for their events" on public.profiles
  for select to authenticated using (exists (
    select 1 from public.registrations r join public.events e on e.id = r.event_id
    where r.student_id = profiles.id and e.organizer_id = (select auth.uid())
  ));
drop policy if exists "Users can update their own display name" on public.profiles;
create policy "Users can update their own display name" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Events are public to read" on public.events;
create policy "Events are public to read" on public.events
  for select to anon, authenticated using (true);
drop policy if exists "Organizers can create their events" on public.events;
create policy "Organizers can create their events" on public.events
  for insert to authenticated with check (
    organizer_id = (select auth.uid()) and exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'organizer'
    )
  );
drop policy if exists "Organizers can update their events" on public.events;
create policy "Organizers can update their events" on public.events
  for update to authenticated using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));
drop policy if exists "Organizers can delete their events" on public.events;
create policy "Organizers can delete their events" on public.events
  for delete to authenticated using (organizer_id = (select auth.uid()));

drop policy if exists "Students see own registrations and event organizers see attendees" on public.registrations;
create policy "Students see own registrations and event organizers see attendees" on public.registrations
  for select to authenticated using (
    student_id = (select auth.uid()) or exists (
      select 1 from public.events e where e.id = event_id and e.organizer_id = (select auth.uid())
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.events to anon, authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.registrations to authenticated;
grant insert, update, delete on public.events to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;

-- Count registrations is safe to expose publicly; attendee identities remain protected by RLS.
create or replace function public.public_event_counts()
returns table (event_id uuid, registration_count bigint)
language sql
stable
security definer set search_path = ''
as $$
  select e.id, count(r.id)
  from public.events e
  left join public.registrations r on r.event_id = e.id
  group by e.id;
$$;
grant execute on function public.public_event_counts() to anon, authenticated;
