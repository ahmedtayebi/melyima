create or replace function public.restore_order_with_stock(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_has_product boolean;
  v_has_color boolean;
  v_has_size boolean;
  v_has_variant boolean;
  v_reserved integer := 0;
begin
  select id, deleted_at
    into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.deleted_at is null then
    raise exception 'order_not_deleted';
  end if;

  for v_item in
    select product_id, color_id, size_id, quantity
      from order_items
     where order_id = p_order_id
  loop
    if v_item.product_id is null or v_item.color_id is null or v_item.size_id is null then
      raise exception 'product_unavailable';
    end if;

    select exists (
      select 1 from products where id = v_item.product_id
    ) into v_has_product;
    select exists (
      select 1
        from product_colors
       where id = v_item.color_id
         and product_id = v_item.product_id
    ) into v_has_color;
    select exists (
      select 1
        from product_sizes
       where id = v_item.size_id
         and product_id = v_item.product_id
    ) into v_has_size;

    if not v_has_product or not v_has_color or not v_has_size then
      raise exception 'product_unavailable';
    end if;

    update product_variants
       set stock = stock - v_item.quantity,
           updated_at = now()
     where product_id = v_item.product_id
       and color_id = v_item.color_id
       and size_id = v_item.size_id
       and stock >= v_item.quantity;

    if found then
      v_reserved := v_reserved + 1;
    else
      select exists (
        select 1
          from product_variants
         where product_id = v_item.product_id
           and color_id = v_item.color_id
           and size_id = v_item.size_id
      ) into v_has_variant;

      if v_has_variant then
        raise exception 'insufficient_stock:%:%:%',
          v_item.product_id, v_item.color_id, v_item.size_id;
      end if;

      -- A missing variant row is the legacy representation of unlimited stock.
    end if;
  end loop;

  update orders
     set deleted_at = null,
         deleted_from_status = null,
         status = 'pending',
         ecotrack_tracking = null,
         ecotrack_status = 'none',
         updated_at = now()
   where id = p_order_id;

  return v_reserved;
end;
$$;

revoke all on function public.restore_order_with_stock(uuid) from public;
grant execute on function public.restore_order_with_stock(uuid) to service_role;
