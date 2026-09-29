\set ON_ERROR_STOP on
-- Runs after admin-integrity.sql, on the same isolated test database.
alter table orders add column deleted_from_status text, add column total_price numeric default 5900,
 add column created_at timestamptz default now();
alter table product_variants add column updated_at timestamptz default now();
create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid references orders on delete cascade,
 product_id uuid references products on delete set null, color_id uuid references product_colors on delete set null,
 size_id uuid references product_sizes on delete set null, quantity integer, product_name text,
 color_name text, color_hex text, color_image_url text, size_label text);

create function pg_temp.archived() returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid(); begin
 insert into orders(id,status,ecotrack_status,deleted_at,deleted_from_status)
 values(v_id,'confirmed','none',now(),'confirmed'); return v_id;
end; $$;
create function pg_temp.item(v_order uuid, qty integer default 1, label text default 'M', size uuid default null)
returns uuid language plpgsql as $$ declare v_id uuid := gen_random_uuid(); begin
 insert into order_items(id,order_id,product_id,color_id,size_id,quantity,product_name,color_name,color_hex,size_label)
 values(v_id,v_order,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',size,qty,'Dress','Black','#000000',label);
 return v_id;
end; $$;
create function pg_temp.repairs(v_item uuid, size uuid default '33333333-3333-4333-8333-333333333333')
returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('item_id',v_item,
 'product_id','11111111-1111-4111-8111-111111111111','color_id','22222222-2222-4222-8222-222222222222','size_id',size)); $$;

-- Reproduce the deployed-source failure before installing the fix.
\ir ../../supabase/migrations/20260828090000_order_recovery_and_editing.sql
\ir ../../supabase/migrations/20260902121000_guard_order_deletion.sql
\ir ../../supabase/migrations/20260902123000_fix_restore_unlimited_stock.sql
do $$ declare oid uuid; begin
 oid := pg_temp.archived(); perform pg_temp.item(oid);
 begin
   perform restore_order_with_stock(oid); raise exception 'expected missing-size rejection';
 exception when raise_exception then if sqlerrm <> 'product_unavailable' then raise; end if; end;
 assert (select deleted_at is not null from orders where id=oid);
end; $$;
\echo 'REPRODUCED: old restore rejects a missing size even when exactly one matching size exists'

\ir ../../supabase/migrations/20260929010000_repair_order_restoration.sql
do $$
declare oid uuid; iid uuid; result jsonb; version timestamptz; other uuid;
begin
 update product_variants set stock=5;
 oid:=pg_temp.archived(); iid:=pg_temp.item(oid,2);
 result:=restore_order_safely(oid);
 assert (result->>'success')::boolean and (result->>'repaired_items')::integer=1;
 assert (select stock=3 from product_variants);
 assert (select size_id='33333333-3333-4333-8333-333333333333'::uuid from order_items where id=iid);
 assert (select deleted_at is null and status='pending' and total_price=5900 from orders where id=oid);
 update orders set status='confirmed' where id=oid;
 result:=restore_order_safely(oid);
 assert (result->>'already_restored')::boolean and result->'order'->>'status'='confirmed';
 assert (select stock=3 from product_variants), 'retry double-reserved stock';
 perform delete_order_with_stock(oid, null);
 assert (select stock=5 from product_variants), 'delete did not release the reservation';
 result:=restore_order_safely(oid);
 assert (result->>'success')::boolean;
 assert (select stock=3 from product_variants), 'delete/restore cycle changed the stock balance';

 -- Actual deletion was a recurring source of lost references. Hide still works.
 begin delete from product_sizes where id='33333333-3333-4333-8333-333333333333';
   raise exception 'referenced size deleted';
 exception when raise_exception then if sqlerrm <> 'order_option_in_use' then raise; end if; end;
 begin delete from product_colors where id='22222222-2222-4222-8222-222222222222';
   raise exception 'referenced color deleted';
 exception when raise_exception then if sqlerrm <> 'order_option_in_use' then raise; end if; end;
 begin delete from products where id='11111111-1111-4111-8111-111111111111';
   raise exception 'referenced product deleted';
 exception when raise_exception then if sqlerrm <> 'order_option_in_use' then raise; end if; end;
 update product_sizes set is_visible=false where id='33333333-3333-4333-8333-333333333333';

 oid:=pg_temp.archived(); iid:=pg_temp.item(oid,1,'Removed size');
 result:=restore_order_safely(oid);
 assert result->>'code'='restore_needs_repair' and jsonb_array_length(result->'issues')=1;
 assert (select deleted_at is not null from orders where id=oid);
 assert (select size_id is null from order_items where id=iid);
 select updated_at into version from orders where id=oid;
 begin perform restore_order_safely(oid,pg_temp.repairs(iid),version-interval '1 second');
   raise exception 'stale manual repair accepted';
 exception when raise_exception then if sqlerrm <> 'order_changed' then raise; end if; end;
 begin perform restore_order_safely(oid,pg_temp.repairs(gen_random_uuid()),version);
   raise exception 'foreign item accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_restore_repairs' then raise; end if; end;
 result:=restore_order_safely(oid,pg_temp.repairs(iid),version);
 assert (result->>'success')::boolean;
 assert (select stock=2 from product_variants);
 assert (select size_label='M' from order_items where id=iid);
 assert (select total_price=5900 from orders where id=oid);

 -- Ambiguous labels are never silently assigned.
 insert into product_sizes(id,product_id,label,is_visible,sort_order)
 values('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','M',true,2);
 oid:=pg_temp.archived(); iid:=pg_temp.item(oid);
 result:=restore_order_safely(oid);
 assert result->>'code'='restore_needs_repair';
 delete from product_sizes where id='77777777-7777-4777-8777-777777777777';

 -- No variant row means unlimited, even if other sizes have finite stock.
 oid:=pg_temp.archived(); perform pg_temp.item(oid,10,'L','44444444-4444-4444-8444-444444444444');
 result:=restore_order_safely(oid);
 assert (result->>'success')::boolean and (result->>'reserved_items')::integer=0;
 assert (select stock=2 from product_variants);

 -- Mixed stock: failures must not partially reserve or persist auto repairs.
 update product_variants set stock=5;
 insert into product_variants(product_id,color_id,size_id,stock) values
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',0);
 oid:=pg_temp.archived(); iid:=pg_temp.item(oid,2); perform pg_temp.item(oid,1,'L');
 result:=restore_order_safely(oid);
 assert result->>'code'='insufficient_stock';
 assert (select stock=5 from product_variants where size_id='33333333-3333-4333-8333-333333333333');
 assert (select size_id is null from order_items where id=iid);
 assert (select deleted_at is not null from orders where id=oid);

 -- Duplicate rows require their combined quantity, never independent checks.
 oid:=pg_temp.archived(); perform pg_temp.item(oid,3); perform pg_temp.item(oid,3);
 result:=restore_order_safely(oid);
 assert result->>'code'='insufficient_stock' and (result->'issues'->0->>'required_stock')::integer=6;
 assert (select stock=5 from product_variants where size_id='33333333-3333-4333-8333-333333333333');

 oid:=pg_temp.archived();
 begin perform restore_order_safely(oid); raise exception 'empty order restored';
 exception when raise_exception then if sqlerrm <> 'empty_order' then raise; end if; end;
 perform pg_temp.item(oid,-1);
 begin perform restore_order_safely(oid); raise exception 'negative quantity increased stock';
 exception when raise_exception then if sqlerrm <> 'invalid_order_items' then raise; end if; end;
 assert not has_function_privilege('anon','public.restore_order_safely(uuid,jsonb,timestamptz)','execute');
 assert not has_function_privilege('authenticated','public.restore_order_safely(uuid,jsonb,timestamptz)','execute');
end; $$;

-- Inject a late failure, after both reference repair and stock reservation.
create function pg_temp.fail_restore_commit() returns trigger language plpgsql as $$
begin if old.deleted_at is not null and new.deleted_at is null then raise exception 'test_commit_failure'; end if; return new; end; $$;
create trigger test_commit_failure before update on orders for each row execute function pg_temp.fail_restore_commit();
do $$ declare oid uuid; iid uuid; begin
 oid:=pg_temp.archived(); iid:=pg_temp.item(oid,2);
 begin perform restore_order_safely(oid); raise exception 'injected failure not raised';
 exception when raise_exception then if sqlerrm <> 'test_commit_failure' then raise; end if; end;
 assert (select stock=5 from product_variants where size_id='33333333-3333-4333-8333-333333333333');
 assert (select size_id is null from order_items where id=iid);
 assert (select deleted_at is not null from orders where id=oid);
end; $$;
drop trigger test_commit_failure on orders;

insert into orders(id,status,ecotrack_status,deleted_at)
values('99999999-9999-4999-8999-999999999999','pending','none',now());
select pg_temp.item('99999999-9999-4999-8999-999999999999',2);
\echo 'PASS: exact/ambiguous/missing options, explicit repairs, unlimited/finite/zero/duplicate stock, idempotency, rollback, stale repair and deletion guards'
