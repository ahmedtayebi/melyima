-- Deleting catalog entries in the admin UI now archives them. Orders, images,
-- option IDs and stock remain intact, including for products with no orders.
begin;
alter table public.products add column if not exists archived_at timestamptz;
alter table public.product_colors add column if not exists archived_at timestamptz;
alter table public.product_sizes add column if not exists archived_at timestamptz;

-- Existing storefront and checkout visibility checks also exclude archived rows.
alter table public.products drop constraint if exists products_archive_hidden;
alter table public.products add constraint products_archive_hidden check (archived_at is null or is_visible = false);
alter table public.product_colors drop constraint if exists product_colors_archive_hidden;
alter table public.product_colors add constraint product_colors_archive_hidden check (archived_at is null or is_visible = false);
alter table public.product_sizes drop constraint if exists product_sizes_archive_hidden;
alter table public.product_sizes add constraint product_sizes_archive_hidden check (archived_at is null or is_visible = false);

create or replace function public.set_catalog_product_archived(
  p_product_id uuid, p_archived boolean, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_product products%rowtype;
begin
  if p_archived is null then raise exception 'invalid_product'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 0));
  select * into v_product from products where id = p_product_id for update;
  if not found then raise exception 'product_unavailable'; end if;
  if (v_product.archived_at is not null) = p_archived then
    return jsonb_build_object('id',v_product.id,'archived_at',v_product.archived_at,
      'updated_at',v_product.updated_at,'is_visible',v_product.is_visible);
  end if;
  if v_product.updated_at is distinct from p_expected_updated_at then raise exception 'product_conflict'; end if;
  update products set archived_at = case when p_archived then clock_timestamp() else null end,
    is_visible = false where id = p_product_id returning * into v_product;
  return jsonb_build_object('id',v_product.id,'archived_at',v_product.archived_at,
    'updated_at',v_product.updated_at,'is_visible',v_product.is_visible);
end;
$$;
revoke all on function public.set_catalog_product_archived(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.set_catalog_product_archived(uuid,boolean,timestamptz) to service_role;

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
    or jsonb_typeof(p_colors) <> 'array' or (jsonb_array_length(p_colors) = 0 and p_expected_updated_at is null)
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
  if exists(select 1 from products where id = v_id and archived_at is not null) then
    raise exception 'product_archived';
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
    if exists(select 1 from product_colors where id = (v_color->>'id')::uuid and archived_at is not null)
       and not coalesce((v_color->>'restore')::boolean, false) then raise exception 'product_option_archived'; end if;
    insert into product_colors(id, product_id, name, hex_code, is_visible, sort_order, image_url)
    values((v_color->>'id')::uuid, v_id, btrim(v_color->>'name'), v_color->>'hex_code',
      (v_color->>'is_visible')::boolean, (v_color->>'sort_order')::integer,
      (select value->>'image_url' from jsonb_array_elements(v_color->'images') order by (value->>'sort_order')::integer limit 1))
    on conflict(id) do update set name = excluded.name, hex_code = excluded.hex_code,
      is_visible = excluded.is_visible, sort_order = excluded.sort_order, image_url = excluded.image_url, archived_at = null;
    delete from product_color_images where color_id = (v_color->>'id')::uuid;
    insert into product_color_images(color_id, image_url, sort_order)
      select (v_color->>'id')::uuid, x.image_url, x.sort_order
      from jsonb_to_recordset(v_color->'images') as x(image_url text, sort_order integer);
  end loop;
  for v_size in select value from jsonb_array_elements(p_sizes) loop
    if exists(select 1 from product_sizes where id = (v_size->>'id')::uuid and product_id <> v_id) then
      raise exception 'invalid_product';
    end if;
    if exists(select 1 from product_sizes where id = (v_size->>'id')::uuid and archived_at is not null)
       and not coalesce((v_size->>'restore')::boolean, false) then raise exception 'product_option_archived'; end if;
    insert into product_sizes(id, product_id, label, is_visible, sort_order)
    values((v_size->>'id')::uuid, v_id, btrim(v_size->>'label'),
      (v_size->>'is_visible')::boolean, (v_size->>'sort_order')::integer)
    on conflict(id) do update set label = excluded.label, is_visible = excluded.is_visible, sort_order = excluded.sort_order, archived_at = null;
  end loop;
  update product_colors set archived_at = clock_timestamp(), is_visible = false
    where product_id = v_id and archived_at is null
    and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_colors));
  update product_sizes set archived_at = clock_timestamp(), is_visible = false
    where product_id = v_id and archived_at is null
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

-- Replace the old history-only delete guard, including installations that applied
-- 20261031120000_allow_catalog_deletion.sql. Stale clients must not hard-delete data.
create or replace function public.guard_order_option_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'catalog_archive_required';
end;
$$;
drop trigger if exists guard_order_product_deletion on public.products;
create trigger guard_order_product_deletion before delete on public.products
for each row execute function public.guard_order_option_deletion();
drop trigger if exists guard_order_color_deletion on public.product_colors;
create trigger guard_order_color_deletion before delete on public.product_colors
for each row execute function public.guard_order_option_deletion();
drop trigger if exists guard_order_size_deletion on public.product_sizes;
create trigger guard_order_size_deletion before delete on public.product_sizes
for each row execute function public.guard_order_option_deletion();
commit;
