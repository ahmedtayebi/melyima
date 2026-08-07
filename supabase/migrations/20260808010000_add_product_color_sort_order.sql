alter table public.product_colors
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_colors'
      and column_name = 'created_at'
  ) then
    execute '
      with ranked_colors as (
        select
          id,
          row_number() over (
            partition by product_id
            order by created_at nulls last, id
          ) - 1 as next_sort_order
        from public.product_colors
      )
      update public.product_colors pc
      set sort_order = ranked_colors.next_sort_order
      from ranked_colors
      where pc.id = ranked_colors.id
    ';
  else
    execute '
      with ranked_colors as (
        select
          id,
          row_number() over (
            partition by product_id
            order by id
          ) - 1 as next_sort_order
        from public.product_colors
      )
      update public.product_colors pc
      set sort_order = ranked_colors.next_sort_order
      from ranked_colors
      where pc.id = ranked_colors.id
    ';
  end if;
end $$;

create index if not exists product_colors_product_id_sort_order_idx
  on public.product_colors(product_id, sort_order);
