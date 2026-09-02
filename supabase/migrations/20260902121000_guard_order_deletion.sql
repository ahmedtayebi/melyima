create unique index if not exists orders_ecotrack_tracking_key
  on public.orders (ecotrack_tracking)
  where ecotrack_tracking is not null;

create or replace function public.delete_order_with_stock(
  p_order_id uuid,
  p_expected_tracking text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text;
begin
  select ecotrack_tracking
    into v_tracking
    from orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_tracking is distinct from p_expected_tracking then
    raise exception 'order_changed';
  end if;

  return public.delete_order_with_stock(p_order_id);
end;
$$;

revoke all on function public.delete_order_with_stock(uuid, text) from public;
grant execute on function public.delete_order_with_stock(uuid, text) to service_role;
