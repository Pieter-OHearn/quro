-- One line per table and sequence of the application and migration schemas: row count and an
-- md5 of the rows' text form for tables, last value for sequences. Run it on two databases and
-- compare the sorted output, as scripts/recovery-drill.sh does for an instance and its restore.
-- It prints names, counts and checksums only, no row data.
select 'table|' || t.schemaname || '.' || t.tablename || '|' ||
  (xpath('/row/n/text()', query_to_xml(
     format('select count(*) as n from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text || '|' ||
  (xpath('/row/h/text()', query_to_xml(
     format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text collate "C"), '''')) as h from %I.%I x',
       t.schemaname, t.tablename), false, true, '')))[1]::text
from pg_tables t where t.schemaname in ('public', 'drizzle');
select 'sequence|' || schemaname || '.' || sequencename || '|' || coalesce(last_value::text, 'unused')
from pg_sequences where schemaname in ('public', 'drizzle');
