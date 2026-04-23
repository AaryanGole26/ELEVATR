create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('candidate', 'hr')),
  created_at timestamptz default now()
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  hr_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  jd_text text not null,
  tags text[] default '{}',
  threshold int not null check (threshold between 0 and 100),
  created_at timestamptz default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  score int not null check (score between 0 and 100),
  feedback text not null,
  created_at timestamptz default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  candidate_id uuid references public.users(id) on delete set null,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  score int not null check (score between 0 and 100),
  status text not null default 'screened',
  created_at timestamptz default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  interview_link text,
  config jsonb not null default '{}'::jsonb,
  result_json jsonb,
  report_pdf_url text,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
alter table public.pipelines enable row level security;
alter table public.resumes enable row level security;
alter table public.analyses enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
for select using (auth.uid() = id);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
for update using (auth.uid() = id);

drop policy if exists pipelines_hr_manage on public.pipelines;
create policy pipelines_hr_manage on public.pipelines
for all using (auth.uid() = hr_id) with check (auth.uid() = hr_id);

drop policy if exists resumes_owner_or_guest_insert on public.resumes;
create policy resumes_owner_or_guest_insert on public.resumes
for insert with check (auth.uid() = user_id or user_id is null);

drop policy if exists resumes_owner_select on public.resumes;
create policy resumes_owner_select on public.resumes
for select using (auth.uid() = user_id);

drop policy if exists applications_owner_select on public.applications;
create policy applications_owner_select on public.applications
for select using (auth.uid() = candidate_id);

drop policy if exists applications_owner_insert on public.applications;
create policy applications_owner_insert on public.applications
for insert with check (auth.uid() = candidate_id or candidate_id is null);

insert into storage.buckets (id, name, public)
values ('reports', 'reports', true)
on conflict (id) do nothing;