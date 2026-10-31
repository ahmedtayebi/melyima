\set ON_ERROR_STOP on
-- Isolated test database only, after the restoration tests.
\ir ../../supabase/migrations/20261031130000_catalog_archive.sql
\ir ../../supabase/migrations/20261031130000_catalog_archive.sql
do $$
declare
  pid uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); sid uuid := gen_random_uuid();
  active_order uuid := gen_random_uuid(); archived_order uuid := gen_random_uuid();
  product jsonb; colors jsonb; sizes jsonb; version timestamptz; old_version timestamptz;
  snapshots jsonb; outcome jsonb; archive_time timestamptz;
begin
  product := jsonb_build_object('id',pid,'name','Dress','price',1000,'original_price',0,
    'description','Original','is_visible',true,'category_id',null);
  colors := jsonb_build_array(jsonb_build_object('id',cid,'name','Black','hex_code','#000000',
    'is_visible',true,'sort_order',0,'images',jsonb_build_array(jsonb_build_object('image_url','https://example.com/original.jpg','sort_order',0))));
  sizes := jsonb_build_array(jsonb_build_object('id',sid,'label','M','is_visible',true,'sort_order',0));
  perform save_catalog_product(product,colors,sizes,'[]',null);
  insert into product_variants(product_id,color_id,size_id,stock) values(pid,cid,sid,5);
  insert into orders(id,status,ecotrack_status,total_price,deleted_at)
    values(active_order,'confirmed','none',2000,null),(archived_order,'confirmed','none',2000,now());
  insert into order_items(order_id,product_id,color_id,size_id,quantity,product_name,color_name,color_hex,color_image_url,size_label)
    select oid,pid,cid,sid,2,'Dress','Black','#000000','https://example.com/original.jpg','M'
    from unnest(array[active_order,archived_order]) as oid;
  select jsonb_agg(to_jsonb(oi) order by oi.id) into snapshots from order_items oi where order_id in(active_order,archived_order);

  -- Omitting ALL options archives them, while the metadata edit commits too.
  select updated_at into version from products where id=pid;
  product := product || '{"name":"Edited dress","price":1700}';
  perform save_catalog_product(product,'[]','[]','[]',version);
  assert (select price=1700 from products where id=pid);
  assert (select archived_at is not null and not is_visible from product_colors where id=cid);
  assert (select archived_at is not null and not is_visible from product_sizes where id=sid);
  assert (select stock=5 from product_variants where product_id=pid);
  assert (select count(*)=1 from product_color_images where color_id=cid);
  select archived_at into archive_time from product_colors where id=cid;
  select updated_at into version from products where id=pid;
  perform save_catalog_product(product,'[]','[]','[]',version);
  assert (select archived_at=archive_time from product_colors where id=cid), 'repeated save changed archive timestamp';

  -- Old clients cannot implicitly resurrect archived options, nor publish them.
  select updated_at into version from products where id=pid;
  begin
    perform save_catalog_product(product,colors,sizes,'[]',version);
    raise exception 'implicit option restore accepted';
  exception when raise_exception then if sqlerrm <> 'product_option_archived' then raise; end if; end;
  begin update product_colors set is_visible=true where id=cid;
    raise exception 'archived color published';
  exception when check_violation then null; end;
  begin update product_sizes set is_visible=true where id=sid;
    raise exception 'archived size published';
  exception when check_violation then null; end;

  -- Restoring the options is atomic even when a later stock check fails.
  colors := jsonb_set(colors,'{0,restore}','true'); sizes := jsonb_set(sizes,'{0,restore}','true');
  begin
    perform save_catalog_product(product,colors,sizes,
      jsonb_build_array(jsonb_build_object('color_id',cid,'size_id',sid,'expected_stock',99,'stock',10)),version);
    raise exception 'stale stock accepted';
  exception when raise_exception then if sqlerrm <> 'stock_conflict' then raise; end if; end;
  assert (select archived_at is not null from product_colors where id=cid);
  perform save_catalog_product(product,colors,sizes,'[]',version);
  assert (select archived_at is null and is_visible from product_colors where id=cid);
  assert (select archived_at is null and is_visible from product_sizes where id=sid);
  assert (select stock=5 from product_variants where product_id=pid);

  -- Product archive keeps every child, stock row and order reference.
  select updated_at into old_version from products where id=pid;
  outcome := set_catalog_product_archived(pid,true,old_version);
  version := (outcome->>'updated_at')::timestamptz;
  assert (select archived_at is not null and not is_visible from products where id=pid);
  assert set_catalog_product_archived(pid,true,old_version) = outcome, 'archive retry changed the row';
  begin perform set_catalog_product_archived(pid,false,old_version); raise exception 'stale restore accepted';
  exception when raise_exception then if sqlerrm <> 'product_conflict' then raise; end if; end;
  begin perform save_catalog_product(product,colors,sizes,'[]',version); raise exception 'archived product edited';
  exception when raise_exception then if sqlerrm <> 'product_archived' then raise; end if; end;
  begin update products set is_visible=true where id=pid; raise exception 'archived product published';
  exception when check_violation then null; end;
  begin delete from products where id=pid; raise exception 'product hard-deleted';
  exception when raise_exception then if sqlerrm <> 'catalog_archive_required' then raise; end if; end;
  begin delete from product_colors where id=cid; raise exception 'color hard-deleted';
  exception when raise_exception then if sqlerrm <> 'catalog_archive_required' then raise; end if; end;
  begin delete from product_sizes where id=sid; raise exception 'size hard-deleted';
  exception when raise_exception then if sqlerrm <> 'catalog_archive_required' then raise; end if; end;

  -- Archived catalogue records still support processing/restoring historical orders.
  outcome := restore_order_safely(archived_order);
  assert (outcome->>'success')::boolean;
  assert (select stock=3 from product_variants where product_id=pid);
  assert (select jsonb_agg(to_jsonb(oi) order by oi.id) from order_items oi where order_id in(active_order,archived_order)) = snapshots;
  assert (select count(*)=2 from orders where id in(active_order,archived_order) and total_price=2000);
  outcome := set_catalog_product_archived(pid,false,version);
  assert (select archived_at is null and not is_visible from products where id=pid), 'restore must not unexpectedly publish';
  assert (select count(*)=1 from product_color_images where color_id=cid);

  -- Even never-ordered products are recoverable, not physically deleted.
  pid := gen_random_uuid(); cid := gen_random_uuid(); sid := gen_random_uuid();
  product := jsonb_set(product,'{id}',to_jsonb(pid));
  colors := jsonb_set(colors,'{0,id}',to_jsonb(cid)); sizes := jsonb_set(sizes,'{0,id}',to_jsonb(sid));
  perform save_catalog_product(product,colors,sizes,'[]',null);
  select updated_at into version from products where id=pid;
  outcome := set_catalog_product_archived(pid,true,version);
  perform set_catalog_product_archived(pid,false,(outcome->>'updated_at')::timestamptz);
  assert exists(select 1 from products where id=pid and archived_at is null);
  assert not has_function_privilege('anon','public.set_catalog_product_archived(uuid,boolean,timestamptz)','execute');
  assert not has_function_privilege('authenticated','public.set_catalog_product_archived(uuid,boolean,timestamptz)','execute');
end;
$$;
\echo 'PASS: reversible product/option archive, no hard deletes, atomic saves, stock and images retained, order restoration, stale edits and privilege checks'
