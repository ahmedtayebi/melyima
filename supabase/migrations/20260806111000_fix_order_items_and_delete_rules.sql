alter table public.order_items
  add column if not exists color_id uuid,
  add column if not exists size_id uuid;

alter table public.products
  drop constraint if exists products_category_id_fkey,
  add constraint products_category_id_fkey
    foreign key (category_id)
    references public.categories(id)
    on delete set null;

alter table public.product_colors
  drop constraint if exists product_colors_product_id_fkey,
  add constraint product_colors_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete cascade;

alter table public.product_sizes
  drop constraint if exists product_sizes_product_id_fkey,
  add constraint product_sizes_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete cascade;

alter table public.product_color_images
  drop constraint if exists product_color_images_color_id_fkey,
  add constraint product_color_images_color_id_fkey
    foreign key (color_id)
    references public.product_colors(id)
    on delete cascade;

alter table public.product_variants
  drop constraint if exists product_variants_product_id_fkey,
  add constraint product_variants_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete cascade;

alter table public.product_variants
  drop constraint if exists product_variants_color_id_fkey,
  add constraint product_variants_color_id_fkey
    foreign key (color_id)
    references public.product_colors(id)
    on delete cascade;

alter table public.product_variants
  drop constraint if exists product_variants_size_id_fkey,
  add constraint product_variants_size_id_fkey
    foreign key (size_id)
    references public.product_sizes(id)
    on delete cascade;

alter table public.order_items
  drop constraint if exists order_items_order_id_fkey,
  add constraint order_items_order_id_fkey
    foreign key (order_id)
    references public.orders(id)
    on delete cascade;

alter table public.order_items
  drop constraint if exists order_items_product_id_fkey,
  add constraint order_items_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete set null;

alter table public.order_items
  drop constraint if exists order_items_color_id_fkey,
  add constraint order_items_color_id_fkey
    foreign key (color_id)
    references public.product_colors(id)
    on delete set null;

alter table public.order_items
  drop constraint if exists order_items_size_id_fkey,
  add constraint order_items_size_id_fkey
    foreign key (size_id)
    references public.product_sizes(id)
    on delete set null;

alter table public.product_variants
  drop constraint if exists product_variants_color_id_size_id_key;

alter table public.product_variants
  add constraint product_variants_color_id_size_id_key
    unique (color_id, size_id);

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
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  product record;
  v_order_id uuid;
  v_products_total numeric := 0;
  v_order_items jsonb := '[]'::jsonb;
  v_has_variant boolean;
begin
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

  if p_delivery_type = 'home' and (p_address is null or btrim(p_address) = '' or p_commune is null or btrim(p_commune) = '') then
    raise exception 'invalid_address';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_order_items';
  end if;

  for item in
    select *
    from jsonb_to_recordset(p_items) as x(
      product_id uuid,
      color_id uuid,
      size_id uuid,
      quantity integer
    )
  loop
    if item.product_id is null or item.color_id is null or item.size_id is null or item.quantity is null or item.quantity <= 0 or item.quantity > 20 then
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
    into product
    from products p
    join product_colors c
      on c.product_id = p.id
     and c.id = item.color_id
     and c.is_visible = true
    join product_sizes s
      on s.product_id = p.id
     and s.id = item.size_id
     and s.is_visible = true
    where p.id = item.product_id
      and p.is_visible = true;

    if not found then
      raise exception 'product_unavailable';
    end if;

    update product_variants
       set stock = stock - item.quantity
     where product_id = item.product_id
       and color_id = item.color_id
       and size_id = item.size_id
       and stock >= item.quantity;

    if not found then
      select exists (
        select 1
        from product_variants
        where product_id = item.product_id
          and color_id = item.color_id
          and size_id = item.size_id
      ) into v_has_variant;

      if v_has_variant then
        raise exception 'insufficient_stock';
      end if;
    end if;

    v_products_total := v_products_total + (product.price * item.quantity);
    v_order_items := v_order_items || jsonb_build_object(
      'product_id', product.id,
      'color_id', item.color_id,
      'size_id', item.size_id,
      'product_name', product.product_name,
      'color_name', product.color_name,
      'color_hex', product.color_hex,
      'color_image_url', product.color_image_url,
      'size_label', product.size_label,
      'quantity', item.quantity
    );
  end loop;

  insert into orders (
    customer_name,
    phone,
    phone2,
    wilaya,
    wilaya_name,
    delivery_type,
    delivery_price,
    products_total,
    total_price,
    address,
    commune,
    notes,
    status
  )
  values (
    btrim(p_customer_name),
    btrim(p_phone),
    nullif(btrim(coalesce(p_phone2, '')), ''),
    p_wilaya,
    p_wilaya_name,
    p_delivery_type,
    p_delivery_price,
    v_products_total,
    v_products_total + p_delivery_price,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_commune, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'pending'
  )
  returning id into v_order_id;

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
    v_order_id,
    x.product_id,
    x.color_id,
    x.size_id,
    x.product_name,
    x.color_name,
    x.color_hex,
    x.color_image_url,
    x.size_label,
    x.quantity
  from jsonb_to_recordset(v_order_items) as x(
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

  return v_order_id;
end;
$$;

revoke all on function public.create_order_with_stock(
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.create_order_with_stock(
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text,
  text,
  jsonb
) to service_role;
