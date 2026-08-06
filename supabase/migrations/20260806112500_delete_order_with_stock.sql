create or replace function public.delete_order_with_stock(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_updated integer := 0;
  v_restored integer := 0;
begin
  select id, status
    into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status <> 'delivered' then
    for v_item in
      select product_id, color_id, size_id, quantity
        from order_items
       where order_id = p_order_id
    loop
      if v_item.product_id is not null and v_item.color_id is not null and v_item.size_id is not null then
        update product_variants
           set stock = stock + v_item.quantity,
               updated_at = now()
         where product_id = v_item.product_id
           and color_id = v_item.color_id
           and size_id = v_item.size_id;

        get diagnostics v_updated = row_count;
        if v_updated > 0 then
          v_restored := v_restored + 1;
        end if;
      end if;
    end loop;
  end if;

  delete from order_items where order_id = p_order_id;
  delete from orders where id = p_order_id;

  return v_restored;
end;
$$;

revoke all on function public.delete_order_with_stock(uuid) from public;
grant execute on function public.delete_order_with_stock(uuid) to service_role;
