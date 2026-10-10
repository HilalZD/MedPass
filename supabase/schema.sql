-- MedPass database schema (Contract v2).
-- Run this whole file in the Supabase dashboard → SQL Editor → New query → Run.
-- It is safe to run more than once: it only creates what is missing.
--
-- Security model: Row Level Security is ON for every table and there are NO
-- policies, so the browser (anon / authenticated keys) can read or write nothing.
-- Only our Next.js API routes touch these tables, using the service role key
-- on the server, after they have checked the clinician's login.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A hospital or health centre.
create table if not exists facilities (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  district text
);

-- A clinician account. Logins live in Supabase Auth (auth.users); this table
-- says which facility the login belongs to. Rows are added by an admin only
-- (no public sign-up) — that is our "government approved" step.
create table if not exists clinicians (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  facility_id uuid not null references facilities (id),
  full_name   text not null,
  role        text not null
);

-- Allowed roles. Done as a separate drop + add (not inside create table) so that
-- re-running this file also updates the rule on a database that already exists.
alter table clinicians drop constraint if exists clinicians_role_check;
alter table clinicians add constraint clinicians_role_check
  check (role in ('doctor', 'nurse', 'pharmacist', 'admin'));

-- One row per patient. `record` is the full MedPassRecord (lib/types.ts) as JSON.
-- The PIN itself is never stored, only its bcrypt hash.
create table if not exists patients (
  id              text primary key check (id ~ '^MP-[A-Z0-9]{4}-[A-Z0-9]{4}$'), -- MedPass ID
  record          jsonb not null,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,                        -- set after 5 wrong PINs
  card_version    int not null default 1,             -- +1 on every reissue
  created_by      uuid references clinicians (user_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Who did what to which record, and when. The patient can read their own log.
-- clinician_id / facility_id are empty when the patient opens their own record (/me).
create table if not exists access_log (
  id           bigserial primary key,
  patient_id   text not null references patients (id) on delete cascade,
  at           timestamptz not null default now(),
  clinician_id uuid references clinicians (user_id),
  facility_id  uuid references facilities (id),
  action       text not null check (action in ('create', 'view', 'edit', 'reissue', 'failed_pin'))
);

-- Fast "latest entries for this patient" lookups for the access log screen.
create index if not exists access_log_patient_at on access_log (patient_id, at desc);

-- Keep patients.updated_at correct automatically on every update.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patients_updated_at on patients;
create trigger patients_updated_at
  before update on patients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: ON, with no policies = no direct browser access at all.
-- ---------------------------------------------------------------------------

alter table facilities enable row level security;
alter table clinicians enable row level security;
alter table patients   enable row level security;
alter table access_log enable row level security;

-- ---------------------------------------------------------------------------
-- Seed data: 2 demo facilities (fixed ids so the linking step below is easy).
-- ---------------------------------------------------------------------------

insert into facilities (id, name, district) values
  ('11111111-1111-1111-1111-111111111111', 'Tyre Primary Healthcare Centre', 'Tyre'),
  ('22222222-2222-2222-2222-222222222222', 'Beirut Governmental Hospital',   'Beirut')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Linking demo clinicians (run AFTER creating the users, see below).
--
-- 1. Supabase dashboard → Authentication → Users → "Add user" → "Create new user".
--    Enter email + password and tick "Auto Confirm User". Do this for both users.
-- 2. Uncomment this block (it is filled in for the 2 demo users) and run just it.
-- ---------------------------------------------------------------------------

-- insert into clinicians (user_id, facility_id, full_name, role)
-- select id, '11111111-1111-1111-1111-111111111111', 'Nurse Rana Khalil', 'nurse'
-- from auth.users where email = 'nurse@tyre-phc.demo'
-- on conflict (user_id) do update
--   set facility_id = excluded.facility_id, full_name = excluded.full_name, role = excluded.role;
--
-- insert into clinicians (user_id, facility_id, full_name, role)
-- select id, '22222222-2222-2222-2222-222222222222', 'Dr. Karim Nasr', 'doctor'
-- from auth.users where email = 'doctor@beirut-hospital.demo'
-- on conflict (user_id) do update
--   set facility_id = excluded.facility_id, full_name = excluded.full_name, role = excluded.role;
--
-- Check it worked (should show 2 rows with names and facilities):
-- select c.full_name, c.role, u.email, f.name as facility
-- from clinicians c join auth.users u on u.id = c.user_id join facilities f on f.id = c.facility_id;
