create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;


create table if not exists private.secrets (
  name text primary key check (name in ('ingest', 'mail')),
  hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.mail_log (
  id bigint generated always as identity primary key,
  email_hash text not null check (char_length(email_hash) between 16 and 128),
  created_at timestamptz not null default now()
);

create index if not exists mail_log_hash_idx on private.mail_log (email_hash, created_at desc);
create index if not exists mail_log_created_idx on private.mail_log (created_at);

revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.set_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if secret_name not in ('ingest', 'mail') then
    raise exception 'Unknown secret name';
  end if;
  if char_length(coalesce(secret_value, '')) < 32 then
    raise exception 'Use a secret of at least 32 characters';
  end if;
  insert into private.secrets (name, hash)
  values (secret_name, encode(sha256(convert_to(secret_value, 'UTF8')), 'hex'))
  on conflict (name) do update set hash = excluded.hash, updated_at = now();
end;
$$;

create or replace function private.secret_ok(secret_name text, secret_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.secrets s
    where s.name = secret_name
      and s.hash = encode(sha256(convert_to(coalesce(secret_value, ''), 'UTF8')), 'hex')
  );
$$;

create or replace function private.is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'email'), '') <> ''
    and exists (
      select 1 from auth.users u
      where u.id = (select auth.uid()) and u.email_confirmed_at is not null
    );
$$;

create or replace function private.today_dhaka()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;


create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  experience_years smallint not null default 0 check (experience_years between 0 and 50),
  department text not null default 'CSE' check (char_length(department) <= 30),
  institution text not null default '' check (char_length(institution) <= 160),
  study_status text not null default '' check (char_length(study_status) <= 30),
  grad_year smallint check (grad_year between 1970 and 2045),
  region_scope text not null default 'ALL' check (region_scope in ('ALL', 'BD', 'GLOBAL')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists field text not null default 'any'
  check (field in ('any', 'cse', 'engineering', 'business', 'health', 'science', 'arts'));
alter table public.profiles add column if not exists work_mode text not null default 'any'
  check (work_mode in ('any', 'remote', 'hybrid', 'onsite'));
alter table public.profiles add column if not exists lang text not null default 'en'
  check (lang in ('en', 'bn'));
alter table public.profiles add column if not exists saved_searches jsonb not null default '[]'::jsonb
  check (jsonb_typeof(saved_searches) = 'array' and jsonb_array_length(saved_searches) <= 20 and pg_column_size(saved_searches) <= 6000);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id and (select private.is_verified()));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id and (select private.is_verified()))
  with check ((select auth.uid()) = id and (select private.is_verified()));

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


create table if not exists public.applications (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id text not null check (char_length(opportunity_id) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  org text not null default '' check (char_length(org) <= 100),
  region text not null default 'GLOBAL' check (region in ('BD', 'GLOBAL')),
  category text not null default 'job' check (category in ('job', 'internship', 'scholarship', 'competition', 'program')),
  deadline date,
  url text not null default '' check (url = '' or (url ~ '^https?://' and char_length(url) <= 1000)),
  pay text check (char_length(pay) <= 60),
  funding text check (funding in ('full', 'partial')),
  sample boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.applications add column if not exists status text not null default 'saved'
  check (status in ('saved', 'applied', 'interview', 'offer', 'rejected'));
alter table public.applications add column if not exists notes text not null default ''
  check (char_length(notes) <= 2000);

alter table public.applications drop constraint if exists applications_steps_check;
alter table public.applications add constraint applications_steps_check
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 20 and pg_column_size(steps) <= 3000);

alter table public.applications enable row level security;

drop policy if exists "applications_select_own" on public.applications;
drop policy if exists "applications_insert_own" on public.applications;
drop policy if exists "applications_update_own" on public.applications;
drop policy if exists "applications_delete_own" on public.applications;
create policy "applications_select_own" on public.applications for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "applications_insert_own" on public.applications for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.is_verified()));
create policy "applications_update_own" on public.applications for update to authenticated
  using ((select auth.uid()) = user_id and (select private.is_verified()))
  with check ((select auth.uid()) = user_id and (select private.is_verified()));
create policy "applications_delete_own" on public.applications for delete to authenticated
  using ((select auth.uid()) = user_id and (select private.is_verified()));

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

create or replace function public.limit_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 11));
  if not exists (
    select 1 from public.applications a where a.user_id = new.user_id and a.opportunity_id = new.opportunity_id
  ) and (select count(*) from public.applications a where a.user_id = new.user_id) >= 200 then
    raise exception 'You can track at most 200 applications';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_limit on public.applications;
create trigger applications_limit before insert on public.applications
  for each row execute function public.limit_applications();


create table if not exists public.opportunities (
  id text primary key check (char_length(id) <= 40),
  title text not null check (char_length(title) <= 200),
  org text check (char_length(org) <= 100),
  url text not null check (url ~ '^https?://' and char_length(url) <= 1000),
  source text not null check (char_length(source) <= 120),
  category text not null check (category in ('job', 'internship', 'scholarship', 'competition', 'program')),
  region text not null check (region in ('BD', 'GLOBAL')),
  funding text check (funding in ('full', 'partial')),
  deadline date,
  pay text check (char_length(pay) <= 60),
  summary text check (char_length(summary) <= 400),
  published date,
  exp_min smallint check (exp_min between 0 and 40),
  exp_max smallint check (exp_max between 0 and 50),
  level text check (level in ('entry', 'mid', 'senior')),
  found date not null default current_date,
  checked date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.opportunities add column if not exists job_type text
  check (job_type in ('full-time', 'part-time', 'contract', 'freelance'));
alter table public.opportunities add column if not exists work_mode text
  check (work_mode in ('remote', 'hybrid', 'onsite'));
alter table public.opportunities add column if not exists country text check (char_length(country) <= 60);
alter table public.opportunities add column if not exists education text
  check (education in ('school', 'diploma', 'bachelor', 'master', 'phd'));
alter table public.opportunities add column if not exists field text
  check (field in ('cse', 'engineering', 'business', 'health', 'science', 'arts'));
alter table public.opportunities add column if not exists org_type text
  check (org_type in ('government', 'multinational', 'ngo', 'startup', 'university'));
alter table public.opportunities add column if not exists pay_min numeric(14, 2) check (pay_min >= 0);
alter table public.opportunities add column if not exists pay_max numeric(14, 2) check (pay_max >= 0);
alter table public.opportunities add column if not exists pay_currency text check (char_length(pay_currency) <= 5);
alter table public.opportunities add column if not exists verified boolean not null default false;
alter table public.opportunities add column if not exists checked_by text not null default 'rules'
  check (checked_by in ('rules', 'ai'));
alter table public.opportunities add column if not exists evidence jsonb
  check (evidence is null or (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 12000));

create index if not exists opportunities_deadline_idx on public.opportunities (deadline);
create index if not exists opportunities_category_region_idx on public.opportunities (category, region);

alter table public.opportunities enable row level security;

drop policy if exists "opportunities_read_open" on public.opportunities;
create policy "opportunities_read_open" on public.opportunities for select to anon, authenticated
  using (deadline is null or deadline >= (select private.today_dhaka()));

drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch before update on public.opportunities
  for each row execute function public.touch_updated_at();

revoke insert, update, delete, truncate on public.opportunities from anon, authenticated;


create table if not exists public.reports (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id text not null check (char_length(opportunity_id) between 1 and 40),
  reason text not null check (reason in ('scam', 'fee', 'expired', 'duplicate', 'wrong', 'other')),
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create index if not exists reports_opportunity_idx on public.reports (opportunity_id);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own" on public.reports;
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_select_own" on public.reports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reports_insert_own" on public.reports for insert to authenticated
  with check ((select auth.uid()) = user_id and (select private.is_verified()));

revoke update, delete, truncate on public.reports from anon, authenticated;
revoke insert on public.reports from anon;

create or replace function public.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 12));
  if (select count(*) from public.reports r where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'You can report at most 20 listings a day';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_limit on public.reports;
create trigger reports_limit before insert on public.reports
  for each row execute function public.limit_reports();


create or replace function public.ingest_opportunities(secret text, items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  if not private.secret_ok('ingest', secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 300 then
    raise exception 'Send an array of at most 300 listings';
  end if;
  insert into public.opportunities as o (
    id, title, org, url, source, category, region, funding, deadline, pay, summary, published,
    exp_min, exp_max, level, job_type, work_mode, country, education, field, org_type,
    pay_min, pay_max, pay_currency, verified, checked_by, evidence, found, checked
  )
  select
    r.id, left(r.title, 200), left(r.org, 100), r.url, left(r.source, 120), r.category, r.region, r.funding,
    r.deadline, left(r.pay, 60), left(r.summary, 400), r.published,
    r.exp_min, r.exp_max, r.level, r.job_type, r.work_mode, left(r.country, 60), r.education, r.field, r.org_type,
    r.pay_min, r.pay_max, left(r.pay_currency, 5), coalesce(r.verified, false),
    case when r.checked_by = 'ai' then 'ai' else 'rules' end,
    case when jsonb_typeof(r.evidence) = 'object' and pg_column_size(r.evidence) <= 12000 then r.evidence else null end,
    coalesce(r.found, private.today_dhaka()), coalesce(r.checked, private.today_dhaka())
  from jsonb_to_recordset(items) as r(
    id text, title text, org text, url text, source text, category text, region text, funding text,
    deadline date, pay text, summary text, published date,
    exp_min smallint, exp_max smallint, level text, job_type text, work_mode text, country text,
    education text, field text, org_type text, pay_min numeric, pay_max numeric, pay_currency text,
    verified boolean, checked_by text, evidence jsonb, found date, checked date
  )
  where r.id is not null and r.title is not null and r.url ~ '^https?://' and r.source is not null
    and not exists (
      select 1 from public.reports p where p.opportunity_id = r.id group by p.opportunity_id having count(*) >= 3
    )
  on conflict (id) do update set
    title = excluded.title, org = excluded.org, url = excluded.url, source = excluded.source,
    category = excluded.category, region = excluded.region, funding = excluded.funding,
    deadline = excluded.deadline, pay = excluded.pay, summary = excluded.summary, published = excluded.published,
    exp_min = excluded.exp_min, exp_max = excluded.exp_max, level = excluded.level,
    job_type = excluded.job_type, work_mode = excluded.work_mode, country = excluded.country,
    education = excluded.education, field = excluded.field, org_type = excluded.org_type,
    pay_min = excluded.pay_min, pay_max = excluded.pay_max, pay_currency = excluded.pay_currency,
    verified = excluded.verified, checked = excluded.checked,
    checked_by = case when excluded.checked_by = 'ai' or o.checked_by <> 'ai' then excluded.checked_by else o.checked_by end,
    evidence = case when excluded.checked_by = 'ai' or o.checked_by <> 'ai' then excluded.evidence else o.evidence end;
  get diagnostics saved = row_count;
  return saved;
end;
$$;

create or replace function public.prune_opportunities(secret text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.secret_ok('ingest', secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.opportunities o
  where o.deadline < private.today_dhaka()
    or (o.deadline is null and o.checked < private.today_dhaka() - 21)
    or o.id in (select p.opportunity_id from public.reports p group by p.opportunity_id having count(*) >= 3);
  get diagnostics removed = row_count;
  delete from public.reports p where p.created_at < now() - interval '180 days';
  return removed;
end;
$$;

create or replace function public.reported_opportunities(secret text)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.secret_ok('ingest', secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.opportunity_id from public.reports p group by p.opportunity_id having count(*) >= 3;
end;
$$;

create or replace function public.mail_gate(secret text, email_hash text, daily_cap integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  in_minute integer;
  in_hour integer;
  in_day integer;
begin
  if not private.secret_ok('mail', secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(coalesce(email_hash, '')) not between 16 and 128 then
    raise exception 'bad hash';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mail_gate', 13));
  delete from private.mail_log m where m.created_at < now() - interval '2 days';
  select
    count(*) filter (where m.created_at > now() - interval '60 seconds'),
    count(*) filter (where m.created_at > now() - interval '1 hour')
  into in_minute, in_hour
  from private.mail_log m
  where m.email_hash = mail_gate.email_hash;
  if in_minute >= 1 then
    return 'wait';
  end if;
  if in_hour >= 5 then
    return 'hourly';
  end if;
  select count(*) into in_day from private.mail_log m where m.created_at > now() - interval '24 hours';
  if in_day >= least(greatest(coalesce(daily_cap, 400), 1), 480) then
    return 'daily';
  end if;
  insert into private.mail_log (email_hash) values (mail_gate.email_hash);
  return 'ok';
end;
$$;


create table if not exists private.engine_cache (
  kind text not null check (kind in ('search', 'extract')),
  cache_key text not null check (char_length(cache_key) = 64),
  payload jsonb not null check (pg_column_size(payload) <= 300000),
  created_at timestamptz not null default now(),
  primary key (kind, cache_key)
);

create table if not exists private.engine_counters (
  bucket text not null check (char_length(bucket) between 3 and 120),
  window_start timestamp not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create table if not exists private.engine_state (
  provider text primary key check (char_length(provider) between 2 and 40),
  cooldown_until timestamptz not null,
  reason text not null default '' check (char_length(reason) <= 60),
  updated_at timestamptz not null default now()
);

revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.engine_secret_ok(secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.secret_ok('mail', secret) or private.secret_ok('ingest', secret);
$$;

create or replace function private.engine_window(kind text)
returns timestamp
language sql
stable
set search_path = ''
as $$
  select case kind
    when 'hour' then date_trunc('hour', now() at time zone 'UTC')
    when 'day' then date_trunc('day', now() at time zone 'UTC')
    when 'month' then date_trunc('month', now() at time zone 'UTC')
    when 'total' then timestamp '2000-01-01'
  end;
$$;

create or replace function public.engine_take(secret text, items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  win timestamp;
  used integer;
begin
  if not private.engine_secret_ok(secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 8 then
    raise exception 'bad items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('engine_take', 15));
  for it in select value from jsonb_array_elements(items) loop
    win := private.engine_window(it ->> 'window');
    if win is null or char_length(coalesce(it ->> 'bucket', '')) not between 3 and 120
      or jsonb_typeof(it -> 'limit') <> 'number' then
      raise exception 'bad item';
    end if;
    select c.count into used from private.engine_counters c
      where c.bucket = it ->> 'bucket' and c.window_start = win;
    if coalesce(used, 0) >= (it ->> 'limit')::integer then
      return jsonb_build_object('ok', false, 'blocked', it ->> 'bucket');
    end if;
  end loop;
  for it in select value from jsonb_array_elements(items) loop
    insert into private.engine_counters as c (bucket, window_start, count)
    values (it ->> 'bucket', private.engine_window(it ->> 'window'), 1)
    on conflict (bucket, window_start) do update set count = c.count + 1;
  end loop;
  if random() < 0.02 then
    delete from private.engine_counters c
      where c.window_start > timestamp '2000-01-01' and c.window_start < (now() at time zone 'UTC') - interval '70 days';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.engine_cache_get(secret text, kind text, cache_key text, max_age_seconds integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.engine_secret_ok(secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (
    select c.payload from private.engine_cache c
    where c.kind = engine_cache_get.kind and c.cache_key = engine_cache_get.cache_key
      and c.created_at > now() - make_interval(secs => least(greatest(max_age_seconds, 0), 2592000))
  );
end;
$$;

create or replace function public.engine_cache_put(secret text, kind text, cache_key text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.engine_secret_ok(secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into private.engine_cache as c (kind, cache_key, payload)
  values (engine_cache_put.kind, engine_cache_put.cache_key, engine_cache_put.payload)
  on conflict (kind, cache_key) do update set payload = excluded.payload, created_at = now();
  if random() < 0.02 then
    delete from private.engine_cache c where c.created_at < now() - interval '30 days';
  end if;
end;
$$;

create or replace function public.engine_state_get(secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.engine_secret_ok(secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(s.provider, jsonb_build_object('until', s.cooldown_until, 'reason', s.reason))
    from private.engine_state s where s.cooldown_until > now()
  ), '{}'::jsonb);
end;
$$;

create or replace function public.engine_state_set(secret text, provider text, seconds integer, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.engine_secret_ok(secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into private.engine_state as s (provider, cooldown_until, reason)
  values (left(engine_state_set.provider, 40), now() + make_interval(secs => least(greatest(seconds, 1), 3024000)), left(coalesce(engine_state_set.reason, ''), 60))
  on conflict (provider) do update set cooldown_until = excluded.cooldown_until, reason = excluded.reason, updated_at = now();
end;
$$;

create or replace view private.engine_usage as
  select bucket, window_start, count from private.engine_counters
  where window_start >= date_trunc('month', now() at time zone 'UTC') or window_start = timestamp '2000-01-01'
  order by window_start desc, bucket;


revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

grant execute on function public.ingest_opportunities(text, jsonb) to anon;
grant execute on function public.prune_opportunities(text) to anon;
grant execute on function public.reported_opportunities(text) to anon;
grant execute on function public.mail_gate(text, text, integer) to anon;
grant execute on function public.engine_take(text, jsonb) to anon;
grant execute on function public.engine_cache_get(text, text, text, integer) to anon;
grant execute on function public.engine_cache_put(text, text, text, jsonb) to anon;
grant execute on function public.engine_state_get(text) to anon;
grant execute on function public.engine_state_set(text, text, integer, text) to anon;
grant execute on function private.is_verified() to authenticated;
grant execute on function private.today_dhaka() to anon, authenticated;
