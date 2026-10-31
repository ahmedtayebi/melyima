-- SUPERSEDED: use 20261031130000_catalog_archive.sql for reversible deletion.
-- This earlier proposal alone enables physical deletion; it is not the final workflow.
-- Allow administrators to delete products/options even when orders reference them.
-- Existing ON DELETE SET NULL foreign keys retain order_items and their snapshots;
-- product/option children continue to use their existing ON DELETE CASCADE rules.
begin;

drop trigger if exists guard_order_product_deletion on public.products;
drop trigger if exists guard_order_color_deletion on public.product_colors;
drop trigger if exists guard_order_size_deletion on public.product_sizes;
drop function if exists public.guard_order_option_deletion();

commit;
