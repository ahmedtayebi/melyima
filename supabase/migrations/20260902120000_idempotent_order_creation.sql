alter table public.orders
  add column if not exists client_request_id uuid;

create unique index if not exists orders_client_request_id_key
  on public.orders (client_request_id)
  where client_request_id is not null;

create or replace function public.create_order_with_stock(
  p_customer_name text,
  p_phone text,
  p_phone2 text,
  p_wilaya text,
  p_wilaya_name text,
  p_delivery_type text,
  p_delivery_price numeric,
  p_address text,
  p_commune text,
  p_notes text,
  p_items jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_request_id is null then
    raise exception 'invalid_request_id';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select id
    into v_order_id
    from orders
   where client_request_id = p_request_id;

  if found then
    return jsonb_build_object('order_id', v_order_id, 'created', false);
  end if;

  v_order_id := public.create_order_with_stock(
    p_customer_name,
    p_phone,
    p_phone2,
    p_wilaya,
    p_wilaya_name,
    p_delivery_type,
    p_delivery_price,
    p_address,
    p_commune,
    p_notes,
    p_items
  );

  update orders
     set client_request_id = p_request_id
   where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'created', true);
end;
$$;

revoke all on function public.create_order_with_stock(
  text, text, text, text, text, text, numeric, text, text, text, jsonb, uuid
) from public;

grant execute on function public.create_order_with_stock(
  text, text, text, text, text, text, numeric, text, text, text, jsonb, uuid
) to service_role;
