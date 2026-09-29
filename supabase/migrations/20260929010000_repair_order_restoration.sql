-- Resolve legacy option references and reserve stock in one transaction.
create or replace function public.restore_order_safely(
  p_order_id uuid, p_repairs jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_item record; v_group record; v_row record;
  v_repair jsonb; v_resolved jsonb := '[]'; v_issues jsonb := '[]';
  v_product uuid; v_color uuid; v_size uuid; v_matches uuid[];
  v_reason text; v_stock integer; v_reserved integer := 0; v_repaired integer := 0;
  v_result jsonb;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.deleted_at is null then
    return jsonb_build_object('success', true, 'already_restored', true, 'reserved_items', 0,
      'order', to_jsonb(v_order) || jsonb_build_object('order_items',
        coalesce((select jsonb_agg(to_jsonb(oi)) from order_items oi where order_id = p_order_id), '[]'::jsonb)));
  end if;
  if v_order.status = 'delivered' or v_order.ecotrack_status = 'shipped' or v_order.ecotrack_tracking is not null then
    raise exception 'order_locked';
  end if;
  if p_repairs is null or jsonb_typeof(p_repairs) <> 'array' or jsonb_array_length(p_repairs) > 50 then
    raise exception 'invalid_restore_repairs';
  end if;
  if jsonb_array_length(p_repairs) > 0 and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'order_changed';
  end if;
  if exists(select 1 from jsonb_array_elements(p_repairs) r
    where nullif(r->>'item_id', '') is null or nullif(r->>'product_id', '') is null
      or nullif(r->>'color_id', '') is null or nullif(r->>'size_id', '') is null
      or not exists(select 1 from order_items oi where oi.id = (r->>'item_id')::uuid and oi.order_id = p_order_id))
    or (select count(*) <> count(distinct r->>'item_id') from jsonb_array_elements(p_repairs) r) then
    raise exception 'invalid_restore_repairs';
  end if;
  if not exists(select 1 from order_items where order_id = p_order_id) then
    raise exception 'empty_order';
  end if;

  for v_item in select * from order_items where order_id = p_order_id order by id for update loop
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'invalid_order_items'; end if;
    select value into v_repair from jsonb_array_elements(p_repairs) where value->>'item_id' = v_item.id::text;
    v_product := coalesce((v_repair->>'product_id')::uuid, v_item.product_id);
    v_color := coalesce((v_repair->>'color_id')::uuid, v_item.color_id);
    v_size := coalesce((v_repair->>'size_id')::uuid, v_item.size_id);
    v_reason := null;
    perform 1 from products where id = v_product for key share;
    if not found then
      v_reason := 'missing_product';
    else
      -- Only missing legacy references are matched automatically, never another
      -- product by its name, or an ambiguous set of colors/sizes.
      if v_repair is null and v_color is null then
        select array_agg(id) into v_matches from product_colors where product_id = v_product
          and lower(btrim(name)) = lower(btrim(v_item.color_name));
        if cardinality(v_matches) = 1 then v_color := v_matches[1]; end if;
      end if;
      if v_repair is null and v_size is null then
        select array_agg(id) into v_matches from product_sizes where product_id = v_product
          and lower(btrim(label)) = lower(btrim(v_item.size_label));
        if cardinality(v_matches) = 1 then v_size := v_matches[1]; end if;
      end if;
      perform 1 from product_colors where id = v_color and product_id = v_product for key share;
      if not found then v_reason := 'missing_color'; end if;
      perform 1 from product_sizes where id = v_size and product_id = v_product for key share;
      if not found then v_reason := coalesce(v_reason, 'missing_size'); end if;
    end if;
    if v_reason is not null then
      v_issues := v_issues || jsonb_build_object('item_id', v_item.id, 'reason', v_reason,
        'product_name', v_item.product_name, 'color_name', v_item.color_name, 'size_label', v_item.size_label,
        'quantity', v_item.quantity, 'product_id', v_product, 'color_id', v_color, 'size_id', v_size);
    else
      v_resolved := v_resolved || jsonb_build_object('item_id', v_item.id, 'product_id', v_product,
        'color_id', v_color, 'size_id', v_size, 'quantity', v_item.quantity);
    end if;
  end loop;
  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('success', false, 'code', 'restore_needs_repair', 'issues', v_issues,
      'expected_updated_at', v_order.updated_at);
  end if;

  -- Sum duplicate combinations, then lock in a stable order. Locks are shared
  -- with inventory edits, including combinations that have no variant row.
  for v_group in select x.product_id, x.color_id, x.size_id, sum(x.quantity) as quantity
    from jsonb_to_recordset(v_resolved) as x(product_id uuid, color_id uuid, size_id uuid, quantity integer)
    group by x.product_id, x.color_id, x.size_id order by x.color_id, x.size_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_group.color_id::text || ':' || v_group.size_id::text, 0));
    select stock into v_stock from product_variants where product_id = v_group.product_id
      and color_id = v_group.color_id and size_id = v_group.size_id for update;
    if found and (v_stock is null or v_stock < v_group.quantity) then
      for v_row in select * from jsonb_to_recordset(v_resolved)
        as x(item_id uuid, product_id uuid, color_id uuid, size_id uuid, quantity integer)
        where color_id = v_group.color_id and size_id = v_group.size_id loop
        select * into v_item from order_items where id = v_row.item_id;
        v_issues := v_issues || jsonb_build_object('item_id', v_row.item_id, 'reason', 'insufficient_stock',
          'product_name', v_item.product_name, 'color_name', v_item.color_name, 'size_label', v_item.size_label,
          'quantity', v_row.quantity, 'required_stock', v_group.quantity, 'available_stock', coalesce(v_stock, 0),
          'product_id', v_row.product_id, 'color_id', v_row.color_id, 'size_id', v_row.size_id);
      end loop;
    end if;
  end loop;
  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('success', false, 'code', 'insufficient_stock', 'issues', v_issues,
      'expected_updated_at', v_order.updated_at);
  end if;

  for v_row in select * from jsonb_to_recordset(v_resolved)
    as x(item_id uuid, product_id uuid, color_id uuid, size_id uuid, quantity integer) loop
    update order_items oi set product_id = v_row.product_id, color_id = v_row.color_id, size_id = v_row.size_id,
      product_name = case when oi.product_id is distinct from v_row.product_id then p.name else oi.product_name end,
      color_name = case when oi.color_id is distinct from v_row.color_id then c.name else oi.color_name end,
      color_hex = case when oi.color_id is distinct from v_row.color_id then c.hex_code else oi.color_hex end,
      color_image_url = case when oi.color_id is distinct from v_row.color_id then c.image_url else oi.color_image_url end,
      size_label = case when oi.size_id is distinct from v_row.size_id then s.label else oi.size_label end
    from products p, product_colors c, product_sizes s
    where oi.id = v_row.item_id and p.id = v_row.product_id and c.id = v_row.color_id and s.id = v_row.size_id
      and (oi.product_id is distinct from v_row.product_id or oi.color_id is distinct from v_row.color_id or oi.size_id is distinct from v_row.size_id);
    if found then v_repaired := v_repaired + 1; end if;
  end loop;
  for v_group in select x.product_id, x.color_id, x.size_id, sum(x.quantity) as quantity
    from jsonb_to_recordset(v_resolved) as x(product_id uuid, color_id uuid, size_id uuid, quantity integer)
    group by x.product_id, x.color_id, x.size_id order by x.color_id, x.size_id loop
    update product_variants set stock = stock - v_group.quantity, updated_at = now()
      where product_id = v_group.product_id and color_id = v_group.color_id and size_id = v_group.size_id;
    if found then v_reserved := v_reserved + 1; end if;
  end loop;
  update orders set deleted_at = null, deleted_from_status = null, status = 'pending',
    ecotrack_tracking = null, ecotrack_status = 'none', updated_at = now() where id = p_order_id;
  select to_jsonb(o) || jsonb_build_object('order_items',
    (select jsonb_agg(to_jsonb(oi) order by oi.id) from order_items oi where order_id = p_order_id))
    into v_result from orders o where id = p_order_id;
  return jsonb_build_object('success', true, 'reserved_items', v_reserved, 'repaired_items', v_repaired, 'order', v_result);
end;
$$;
revoke all on function public.restore_order_safely(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_order_safely(uuid, jsonb, timestamptz) to service_role;

-- Old callers must also use the transactional path, without the HTTP fallback.
create or replace function public.restore_order_with_stock(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  v_result := restore_order_safely(p_order_id);
  if not (v_result->>'success')::boolean then raise exception '%', v_result->>'code'; end if;
  if coalesce((v_result->>'already_restored')::boolean, false) then raise exception 'order_not_deleted'; end if;
  return (v_result->>'reserved_items')::integer;
end;
$$;
revoke all on function public.restore_order_with_stock(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_with_stock(uuid) to service_role;

-- Preserve references for active AND archived orders. Hiding an option remains
-- available; deleting it must not silently turn historical references into NULL.
create or replace function public.guard_order_option_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_table_name = 'product_sizes' and exists(select 1 from order_items where size_id = old.id))
     or (tg_table_name = 'product_colors' and exists(select 1 from order_items where color_id = old.id))
     or (tg_table_name = 'products' and exists(select 1 from order_items where product_id = old.id)) then
    raise exception 'order_option_in_use';
  end if;
  return old;
end;
$$;
create trigger guard_order_size_deletion before delete on public.product_sizes
for each row execute function public.guard_order_option_deletion();
create trigger guard_order_color_deletion before delete on public.product_colors
for each row execute function public.guard_order_option_deletion();
create trigger guard_order_product_deletion before delete on public.products
for each row execute function public.guard_order_option_deletion();
