-- Older order items stored option snapshots but not their color/size IDs.
-- Backfill only unambiguous matches so stock operations can remain exact.
update public.order_items as oi
   set color_id = (
     select c.id
       from public.product_colors as c
      where c.product_id = oi.product_id
        and lower(btrim(c.name)) = lower(btrim(oi.color_name))
      limit 1
   )
 where oi.product_id is not null
   and oi.color_id is null
   and (
     select count(*)
       from public.product_colors as c
      where c.product_id = oi.product_id
        and lower(btrim(c.name)) = lower(btrim(oi.color_name))
   ) = 1;

update public.order_items as oi
   set size_id = (
     select s.id
       from public.product_sizes as s
      where s.product_id = oi.product_id
        and lower(btrim(s.label)) = lower(btrim(oi.size_label))
      limit 1
   )
 where oi.product_id is not null
   and oi.size_id is null
   and (
     select count(*)
       from public.product_sizes as s
      where s.product_id = oi.product_id
        and lower(btrim(s.label)) = lower(btrim(oi.size_label))
   ) = 1;
