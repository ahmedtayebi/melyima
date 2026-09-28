\set ON_ERROR_STOP on
create role service_role;
create role anon;
create role authenticated;
create table products(id uuid primary key, name text, price numeric, original_price numeric,
 description text, is_visible boolean, category_id uuid, updated_at timestamptz not null default clock_timestamp());
create table product_colors(id uuid primary key, product_id uuid references products on delete cascade,
 name text, hex_code text, image_url text, is_visible boolean, sort_order integer);
create table product_sizes(id uuid primary key, product_id uuid references products on delete cascade,
 label text, is_visible boolean, sort_order integer);
create table product_color_images(id uuid default gen_random_uuid() primary key,
 color_id uuid references product_colors on delete cascade, image_url text not null check(image_url <> 'FAIL'), sort_order integer);
create table product_variants(id uuid default gen_random_uuid() primary key,
 product_id uuid references products on delete cascade, color_id uuid references product_colors on delete cascade,
 size_id uuid references product_sizes on delete cascade, stock integer, unique(color_id, size_id));
create table orders(id uuid primary key, status text, ecotrack_status text, ecotrack_tracking text,
 deleted_at timestamptz, updated_at timestamptz not null default clock_timestamp());
\ir ../../supabase/migrations/20260928130000_atomic_catalog_save.sql
\ir ../../supabase/migrations/20260928131000_serialize_order_operations.sql

create function pg_temp.product_payload() returns jsonb language sql as $$
 select jsonb_build_object('id','11111111-1111-4111-8111-111111111111','name','Dress','price',1000,
 'original_price',0,'description','Edited','is_visible',true,'category_id',null);
$$;
create function pg_temp.colors(image text default 'https://example.com/image.jpg') returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('id','22222222-2222-4222-8222-222222222222',
 'name','Black','hex_code','#000000','sort_order',0,'is_visible',true,
 'images',jsonb_build_array(jsonb_build_object('image_url',image,'sort_order',0))));
$$;
create function pg_temp.sizes() returns jsonb language sql as $$
 select '[{"id":"33333333-3333-4333-8333-333333333333","label":"M","is_visible":true,"sort_order":0},
 {"id":"44444444-4444-4444-8444-444444444444","label":"L","is_visible":true,"sort_order":1}]'::jsonb;
$$;
create function pg_temp.stock_change(before_stock integer, after_stock integer) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('color_id','22222222-2222-4222-8222-222222222222',
 'size_id','33333333-3333-4333-8333-333333333333','expected_stock',before_stock,'stock',after_stock));
$$;
do $$
declare v_time timestamptz; v_new timestamptz;
begin
 perform save_catalog_product(pg_temp.product_payload(),pg_temp.colors(),pg_temp.sizes(),pg_temp.stock_change(null,5),null);
 select updated_at into v_time from products;
 update product_variants set stock = 4; -- A customer reserved one after the form opened.
 perform save_catalog_product(pg_temp.product_payload(),pg_temp.colors(),pg_temp.sizes(),'[]',v_time);
 assert (select stock = 4 from product_variants), 'metadata save overwrote reserved stock';
 assert (select count(*) = 1 from product_variants), 'unlimited size acquired a finite stock row';
 select updated_at into v_time from products;
 begin
   perform save_catalog_product(pg_temp.product_payload() || '{"name":"Must roll back"}',pg_temp.colors(),pg_temp.sizes(),pg_temp.stock_change(5,8),v_time);
   raise exception 'stale stock accepted';
 exception when raise_exception then if sqlerrm <> 'stock_conflict' then raise; end if; end;
 assert (select name = 'Dress' and updated_at = v_time from products), 'partial product commit';
 assert (select stock = 4 from product_variants);
 begin
   perform save_catalog_product(pg_temp.product_payload() || '{"name":"Must roll back"}',pg_temp.colors('FAIL'),pg_temp.sizes(),'[]',v_time);
   raise exception 'image rejection was ignored';
 exception when check_violation then null; end;
 assert (select name = 'Dress' and updated_at = v_time from products);
 assert (select image_url = 'https://example.com/image.jpg' from product_color_images), 'image delete escaped rollback';
 perform save_catalog_product(pg_temp.product_payload(),pg_temp.colors(),pg_temp.sizes(),pg_temp.stock_change(4,null),v_time);
 assert (select count(*) = 0 from product_variants), 'empty field did not restore unlimited stock';
 select updated_at into v_new from products;
 begin
   perform save_catalog_product(pg_temp.product_payload(),pg_temp.colors(),pg_temp.sizes(),'[]',v_time);
   raise exception 'stale product accepted';
 exception when raise_exception then if sqlerrm <> 'product_conflict' then raise; end if; end;
 perform save_catalog_product(pg_temp.product_payload(),pg_temp.colors(),pg_temp.sizes(),pg_temp.stock_change(null,0),v_new);
 assert (select stock = 0 from product_variants), 'explicit zero became unlimited';
 assert not has_function_privilege('anon','public.save_catalog_product(jsonb,jsonb,jsonb,jsonb,timestamptz)','execute');
 assert not has_function_privilege('authenticated','public.set_variant_stock_checked(uuid,uuid,uuid,integer,integer)','execute');
end;
$$;

insert into orders(id,status,ecotrack_status,ecotrack_tracking)
 values('55555555-5555-4555-8555-555555555555','confirmed','draft','TRACK-1');
do $$
declare v_order_id uuid := '55555555-5555-4555-8555-555555555555'; token uuid := gen_random_uuid(); changes jsonb; result jsonb;
begin
 select jsonb_build_array(jsonb_build_object('id',v_order_id,'status','delivered','ecotrack_status','shipped',
   'tracking','TRACK-1','expected_tracking','TRACK-1','expected_updated_at',updated_at)) into changes from orders;
 assert try_lock_order_operation(v_order_id,token);
 assert not try_lock_order_operation(v_order_id,gen_random_uuid()), 'second worker acquired same order';
 perform release_order_operation(v_order_id,gen_random_uuid());
 assert not try_lock_order_operation(v_order_id,gen_random_uuid()), 'wrong owner released mutex';
 result := apply_ecotrack_snapshots(changes);
 assert result = '[]'::jsonb, 'sync wrote during an edit/shipment';
 perform release_order_operation(v_order_id,token);
 update orders set ecotrack_tracking = 'TRACK-2';
 assert apply_ecotrack_snapshots(changes) = '[]'::jsonb, 'old remote snapshot replaced new tracking';
 select jsonb_build_array(jsonb_build_object('id',v_order_id,'status','delivered','ecotrack_status','shipped',
   'tracking','TRACK-2','expected_tracking','TRACK-2','expected_updated_at',updated_at)) into changes from orders;
 result := apply_ecotrack_snapshots(changes);
 assert jsonb_array_length(result) = 1;
 assert (select status = 'delivered' from orders);
 update orders set deleted_at = clock_timestamp();
 assert apply_ecotrack_snapshots(changes) = '[]'::jsonb, 'sync changed deleted order';
 assert not has_function_privilege('anon','public.try_lock_order_operation(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.apply_ecotrack_snapshots(jsonb)','execute');
 assert (select count(*) = 0 from order_operation_locks), 'mutex leaked';
end;
$$;
\echo 'PASS: atomic product rollback, checked stock, unlimited/zero, stale edits, mutex ownership, sync snapshots and RPC privileges'
