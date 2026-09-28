-- Keep the existing stock update in the same transaction as the agreed total.
-- NULL preserves automatic pricing for callers that do not supply a total.
create or replace function public.update_order_with_stock(
  p_order_id uuid,
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
  p_total_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_totals jsonb;
begin
  if p_total_price is not null and (
    p_total_price::text in ('NaN', 'Infinity', '-Infinity')
    or p_total_price < 0
    or p_total_price < p_delivery_price
    or p_total_price > 90071992547409.91
    or p_total_price <> round(p_total_price, 2)
  ) then
    raise exception 'invalid_total_price';
  end if;

  -- The existing function locks the order, checks its status and updates stock.
  v_totals := public.update_order_with_stock(
    p_order_id, p_customer_name, p_phone, p_phone2,
    p_wilaya, p_wilaya_name, p_delivery_type, p_delivery_price,
    p_address, p_commune, p_notes, p_items
  );

  if p_total_price is null then
    return v_totals;
  end if;

  -- Keep the revenue breakdown consistent with the amount charged to the customer.
  update orders
     set total_price = p_total_price,
         products_total = p_total_price - p_delivery_price
   where id = p_order_id;

  return jsonb_build_object(
    'products_total', p_total_price - p_delivery_price,
    'delivery_price', p_delivery_price,
    'total_price', p_total_price
  );
end;
$$;

revoke all on function public.update_order_with_stock(
  uuid, text, text, text, text, text, text, numeric, text, text, text, jsonb, numeric
) from public;

grant execute on function public.update_order_with_stock(
  uuid, text, text, text, text, text, text, numeric, text, text, text, jsonb, numeric
) to service_role;
