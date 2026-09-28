-- Catalog writes are available only through the authenticated admin API.
create or replace function public.touch_catalog_product()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger if exists zz_touch_catalog_product on public.products;
create trigger zz_touch_catalog_product before update on public.products
for each row execute function public.touch_catalog_product();

create or replace function public.set_variant_stock_checked(
  p_product_id uuid, p_color_id uuid, p_size_id uuid,
  p_expected_stock integer, p_stock integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_stock integer; v_result jsonb;
begin
  if p_stock < 0 or p_expected_stock < 0 then raise exception 'invalid_stock'; end if;
  -- Serialize administrators even when an unlimited variant has no row yet.
  perform pg_advisory_xact_lock(hashtextextended(p_color_id::text || ':' || p_size_id::text, 0));
  if not exists(select 1 from product_colors where id = p_color_id and product_id = p_product_id)
     or not exists(select 1 from product_sizes where id = p_size_id and product_id = p_product_id) then
    raise exception 'product_unavailable';
  end if;
  select stock into v_stock from product_variants
   where product_id = p_product_id and color_id = p_color_id and size_id = p_size_id for update;
  if v_stock is distinct from p_expected_stock then raise exception 'stock_conflict'; end if;
  if p_stock is null then
    delete from product_variants where product_id = p_product_id and color_id = p_color_id and size_id = p_size_id;
    return null;
  end if;
  insert into product_variants(product_id, color_id, size_id, stock)
  values(p_product_id, p_color_id, p_size_id, p_stock)
  on conflict(color_id, size_id) do update set stock = excluded.stock
  returning to_jsonb(product_variants.*) into v_result;
  return v_result;
end;
$$;

create or replace function public.save_catalog_product(
  p_product jsonb, p_colors jsonb, p_sizes jsonb, p_stock_changes jsonb,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p_product->>'id')::uuid;
  v_updated_at timestamptz;
  v_color jsonb; v_size jsonb; v_change jsonb;
begin
  if v_id is null or nullif(btrim(p_product->>'name'), '') is null
    or (p_product->>'price')::numeric <= 0
    or jsonb_typeof(p_colors) <> 'array' or jsonb_array_length(p_colors) = 0
    or jsonb_typeof(p_sizes) <> 'array' or jsonb_typeof(p_stock_changes) <> 'array' then
    raise exception 'invalid_product';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  select updated_at into v_updated_at from products where id = v_id for no key update;
  if (found and p_expected_updated_at is null)
     or (not found and p_expected_updated_at is not null)
     or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'product_conflict';
  end if;
  insert into products(id, name, price, original_price, description, is_visible, category_id)
  values(v_id, btrim(p_product->>'name'), (p_product->>'price')::numeric,
    (p_product->>'original_price')::numeric, p_product->>'description',
    (p_product->>'is_visible')::boolean, (p_product->>'category_id')::uuid)
  on conflict(id) do update set name = excluded.name, price = excluded.price,
    original_price = excluded.original_price, description = excluded.description,
    is_visible = excluded.is_visible, category_id = excluded.category_id;

  -- All relationships belong to this product; never adopt another product's IDs.
  for v_color in select value from jsonb_array_elements(p_colors) loop
    if exists(select 1 from product_colors where id = (v_color->>'id')::uuid and product_id <> v_id) then
      raise exception 'invalid_product';
    end if;
    insert into product_colors(id, product_id, name, hex_code, is_visible, sort_order, image_url)
    values((v_color->>'id')::uuid, v_id, btrim(v_color->>'name'), v_color->>'hex_code',
      (v_color->>'is_visible')::boolean, (v_color->>'sort_order')::integer,
      (select value->>'image_url' from jsonb_array_elements(v_color->'images') order by (value->>'sort_order')::integer limit 1))
    on conflict(id) do update set name = excluded.name, hex_code = excluded.hex_code,
      is_visible = excluded.is_visible, sort_order = excluded.sort_order, image_url = excluded.image_url;
    delete from product_color_images where color_id = (v_color->>'id')::uuid;
    insert into product_color_images(color_id, image_url, sort_order)
      select (v_color->>'id')::uuid, x.image_url, x.sort_order
      from jsonb_to_recordset(v_color->'images') as x(image_url text, sort_order integer);
  end loop;
  for v_size in select value from jsonb_array_elements(p_sizes) loop
    if exists(select 1 from product_sizes where id = (v_size->>'id')::uuid and product_id <> v_id) then
      raise exception 'invalid_product';
    end if;
    insert into product_sizes(id, product_id, label, is_visible, sort_order)
    values((v_size->>'id')::uuid, v_id, btrim(v_size->>'label'),
      (v_size->>'is_visible')::boolean, (v_size->>'sort_order')::integer)
    on conflict(id) do update set label = excluded.label, is_visible = excluded.is_visible, sort_order = excluded.sort_order;
  end loop;
  delete from product_colors where product_id = v_id
    and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_colors));
  delete from product_sizes where product_id = v_id
    and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_sizes));
  -- Only changed cells are written. A null stock removes the row (unlimited).
  for v_change in select value from jsonb_array_elements(p_stock_changes)
    order by value->>'color_id', value->>'size_id' loop
    perform set_variant_stock_checked(v_id, (v_change->>'color_id')::uuid,
      (v_change->>'size_id')::uuid, (v_change->>'expected_stock')::integer, (v_change->>'stock')::integer);
  end loop;
  return (select jsonb_build_object('id', id, 'updated_at', updated_at) from products where id = v_id);
end;
$$;

revoke all on function public.set_variant_stock_checked(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.save_catalog_product(jsonb, jsonb, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.set_variant_stock_checked(uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.save_catalog_product(jsonb, jsonb, jsonb, jsonb, timestamptz) to service_role;
