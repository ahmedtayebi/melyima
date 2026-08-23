create table if not exists public.job_locks (
  key text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.job_locks enable row level security;

create or replace function public.try_reserve_job_lock(
  p_key text,
  p_cooldown_seconds integer,
  p_force boolean default false
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_locked_until timestamptz;
  v_cooldown interval := make_interval(secs => greatest(p_cooldown_seconds, 1));
begin
  insert into public.job_locks (key, locked_until, updated_at)
  values (p_key, v_now + v_cooldown, v_now)
  on conflict (key) do nothing;

  if found then
    allowed := true;
    retry_after := 0;
    return next;
    return;
  end if;

  update public.job_locks
  set locked_until = v_now + v_cooldown,
      updated_at = v_now
  where key = p_key
    and (p_force or locked_until <= v_now)
  returning locked_until into v_locked_until;

  if found then
    allowed := true;
    retry_after := 0;
    return next;
    return;
  end if;

  select locked_until
  into v_locked_until
  from public.job_locks
  where key = p_key;

  allowed := false;
  retry_after := greatest(1, ceiling(extract(epoch from (v_locked_until - v_now)))::integer);
  return next;
end;
$$;
