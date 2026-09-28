#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
pg_bin="${PG_BIN:-/usr/lib/postgresql/17/bin}"
test_dir=$(mktemp -d /tmp/3abaa-db-test.XXXXXX)
cleanup() {
  "$pg_bin/pg_ctl" -D "$test_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$test_dir/data" -A trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/server.log" -o "-h '' -k $test_dir -p 55439" start >/dev/null
psql -h "$test_dir" -p 55439 -d postgres -X -q -f scripts/tests/admin-integrity.sql

# Exercise an actual row-lock race: a checkout holds the stock row while an
# administrator attempts to save a stale absolute value through a second session.
psql -h "$test_dir" -p 55439 -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
update product_variants set stock = 5;
SQL
psql -h "$test_dir" -p 55439 -d postgres -X -q -v ON_ERROR_STOP=1 >"$test_dir/checkout.log" <<SQL &
begin;
update product_variants set stock = stock - 1;
\! touch "$test_dir/locked"
select pg_sleep(1);
commit;
SQL
checkout_pid=$!
while [ ! -f "$test_dir/locked" ]; do sleep 0.05; done
psql -h "$test_dir" -p 55439 -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  begin
    perform set_variant_stock_checked('11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',5,8);
    raise exception 'concurrent checkout overwritten';
  exception when raise_exception then if sqlerrm <> 'stock_conflict' then raise; end if; end;
  assert (select stock = 4 from product_variants);
end; $$;
SQL
wait "$checkout_pid"
echo 'PASS: concurrent checkout reservation cannot be overwritten by a stale inventory save'
