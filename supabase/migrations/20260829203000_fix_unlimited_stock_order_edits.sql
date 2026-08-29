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
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_old_item record;
  v_item record;
  v_product record;
  v_has_variant boolean;
  v_products_total numeric := 0;
  v_order_items jsonb := '[]'::jsonb;
begin
  select id, status, deleted_at, ecotrack_status
    into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.deleted_at is not null then
    raise exception 'order_deleted';
  end if;

  if v_order.status <> 'pending' or v_order.ecotrack_status = 'shipped' then
    raise exception 'order_locked';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'invalid_customer';
  end if;

  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'invalid_phone';
  end if;

  if p_delivery_type not in ('home', 'office') then
    raise exception 'invalid_delivery_type';
  end if;

  if p_delivery_price is null or p_delivery_price < 0 then
    raise exception 'invalid_delivery_price';
  end if;

  if p_commune is null or btrim(p_commune) = '' then
    raise exception 'invalid_commune';
  end if;

  if p_delivery_type = 'home' and (p_address is null or btrim(p_address) = '') then
    raise exception 'invalid_address';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_order_items';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as duplicate_item(
        product_id uuid,
        color_id uuid,
        size_id uuid,
        quantity integer
      )
     group by product_id, color_id, size_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_order_items';
  end if;

  for v_old_item in
    select product_id, color_id, size_id, quantity
      from order_items
     where order_id = p_order_id
  loop
    if v_old_item.product_id is not null and v_old_item.color_id is not null and v_old_item.size_id is not null then
      update product_variants
         set stock = stock + v_old_item.quantity,
             updated_at = now()
       where product_id = v_old_item.product_id
         and color_id = v_old_item.color_id
         and size_id = v_old_item.size_id;
    end if;
  end loop;

  for v_item in
    select *
      from jsonb_to_recordset(p_items) as requested_item(
        product_id uuid,
        color_id uuid,
        size_id uuid,
        quantity integer
      )
  loop
    if v_item.product_id is null
      or v_item.color_id is null
      or v_item.size_id is null
      or v_item.quantity is null
      or v_item.quantity <= 0
      or v_item.quantity > 20 then
      raise exception 'invalid_order_items';
    end if;

    select
      p.id,
      p.name as product_name,
      p.price,
      c.name as color_name,
      c.hex_code as color_hex,
      coalesce(
        (
          select pci.image_url
            from product_color_images pci
           where pci.color_id = c.id
           order by pci.sort_order asc
           limit 1
        ),
        c.image_url
      ) as color_image_url,
      s.label as size_label
      into v_product
      from products p
      join product_colors c
        on c.product_id = p.id
       and c.id = v_item.color_id
      join product_sizes s
        on s.product_id = p.id
       and s.id = v_item.size_id
     where p.id = v_item.product_id;

    if not found then
      raise exception 'product_unavailable';
    end if;

    update product_variants
       set stock = stock - v_item.quantity,
           updated_at = now()
     where product_id = v_item.product_id
       and color_id = v_item.color_id
       and size_id = v_item.size_id
       and stock >= v_item.quantity;

    if not found then
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

      -- Missing variant rows are the legacy representation of unlimited stock.
    end if;

    v_products_total := v_products_total + (v_product.price * v_item.quantity);
    v_order_items := v_order_items || jsonb_build_object(
      'product_id', v_product.id,
      'color_id', v_item.color_id,
      'size_id', v_item.size_id,
      'product_name', v_product.product_name,
      'color_name', v_product.color_name,
      'color_hex', v_product.color_hex,
      'color_image_url', v_product.color_image_url,
      'size_label', v_product.size_label,
      'quantity', v_item.quantity
    );
  end loop;

  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id,
    product_id,
    color_id,
    size_id,
    product_name,
    color_name,
    color_hex,
    color_image_url,
    size_label,
    quantity
  )
  select
    p_order_id,
    item.product_id,
    item.color_id,
    item.size_id,
    item.product_name,
    item.color_name,
    item.color_hex,
    item.color_image_url,
    item.size_label,
    item.quantity
    from jsonb_to_recordset(v_order_items) as item(
      product_id uuid,
      color_id uuid,
      size_id uuid,
      product_name text,
      color_name text,
      color_hex text,
      color_image_url text,
      size_label text,
      quantity integer
    );

  update orders
     set customer_name = btrim(p_customer_name),
         phone = btrim(p_phone),
         phone2 = nullif(btrim(coalesce(p_phone2, '')), ''),
         wilaya = p_wilaya,
         wilaya_name = p_wilaya_name,
         delivery_type = p_delivery_type,
         delivery_price = p_delivery_price,
         products_total = v_products_total,
         total_price = v_products_total + p_delivery_price,
         address = nullif(btrim(coalesce(p_address, '')), ''),
         commune = nullif(btrim(coalesce(p_commune, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), ''),
         status = 'pending',
         ecotrack_tracking = null,
         ecotrack_status = 'none',
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'products_total', v_products_total,
    'delivery_price', p_delivery_price,
    'total_price', v_products_total + p_delivery_price
  );
end;
$$;

revoke all on function public.update_order_with_stock(
  uuid, text, text, text, text, text, text, numeric, text, text, text, jsonb
) from public;

grant execute on function public.update_order_with_stock(
  uuid, text, text, text, text, text, text, numeric, text, text, text, jsonb
) to service_role;

