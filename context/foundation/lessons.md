# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Pair RLS with explicit GRANTs

- **Context**: Any Supabase migration that enables RLS on a new public-schema table
- **Problem**: New public-schema tables default to TRUNCATE/REFERENCES/TRIGGER/MAINTAIN only for authenticated/anon/service_role — no SELECT/INSERT/UPDATE/DELETE. RLS policies never get evaluated because the base GRANT check fails first, so every operation returns 'permission denied' even though the policies are written correctly.
- **Rule**: Always pair `alter table ... enable row level security` with explicit `grant select, insert, update, delete on <table> to authenticated;` (and any other roles that need access) in the same migration. Verify against a real local Postgres instance, not just by reading the policy SQL.
- **Applies to**: plan, implement
