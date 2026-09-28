-- This mutex spans HTTP calls to Ecotrack; a transaction-only row lock cannot.
-- No automatic expiry: a slow/timed-out worker must not overlap a second worker.
create table public.order_operation_locks (
  order_id uuid primary key,
  token uuid not null,
  started_at timestamptz not null default clock_timestamp()
);
alter table public.order_operation_locks enable row level security;
revoke all on public.order_operation_locks from public, anon, authenticated;
grant all on public.order_operation_locks to service_role;

create or replace function public.try_lock_order_operation(p_order_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into order_operation_locks(order_id, token) values(p_order_id, p_token)
    on conflict(order_id) do nothing;
  return found;
end;
$$;
create or replace function public.release_order_operation(p_order_id uuid, p_token uuid)
returns void language sql security definer set search_path = public as $$
  delete from order_operation_locks where order_id = p_order_id and token = p_token;
$$;
revoke all on function public.try_lock_order_operation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_order_operation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_lock_order_operation(uuid, uuid) to service_role;
grant execute on function public.release_order_operation(uuid, uuid) to service_role;

-- Every mutation invalidates a previously read snapshot, including sync writes.
create or replace function public.touch_order_version()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger if exists zz_touch_order_version on public.orders;
create trigger zz_touch_order_version before update on public.orders
for each row execute function public.touch_order_version();

-- Apply a remote snapshot only if nothing local changed while it was fetched.
-- The same mutex used by HTTP mutations makes this safe against edit/ship/delete.
create or replace function public.apply_ecotrack_snapshots(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb; v_token uuid := gen_random_uuid(); v_id uuid; v_changed uuid; v_ids jsonb := '[]';
begin
  for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    if item->>'status' not in ('confirmed', 'delivered', 'cancelled')
      or item->>'ecotrack_status' not in ('draft', 'shipped')
      or nullif(item->>'tracking', '') is null
      or nullif(item->>'expected_updated_at', '') is null then
      raise exception 'invalid_sync_snapshot';
    end if;
    v_id := (item->>'id')::uuid;
    insert into order_operation_locks(order_id, token) values(v_id, v_token)
      on conflict(order_id) do nothing;
    if not found then continue; end if;
    update orders set status = item->>'status', ecotrack_status = item->>'ecotrack_status',
      ecotrack_tracking = item->>'tracking'
    where id = v_id and deleted_at is null
      and updated_at = (item->>'expected_updated_at')::timestamptz
      and ecotrack_tracking is not distinct from (item->>'expected_tracking')
      and status <> 'cancelled'
      and not (status = 'delivered' and item->>'status' = 'confirmed')
    returning id into v_changed;
    if found then v_ids := v_ids || to_jsonb(v_changed); end if;
    delete from order_operation_locks where order_id = v_id and token = v_token;
  end loop;
  return v_ids;
end;
$$;
revoke all on function public.apply_ecotrack_snapshots(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ecotrack_snapshots(jsonb) to service_role;
