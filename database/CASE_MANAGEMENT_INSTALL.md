# Case Management database installation

The Case Management workspace requires its database tables, row-level
security policies, and RPC functions in addition to the base POS setup.

In the Supabase SQL Editor, run these files completely and in this order:

1. `8_add_case_management_module.sql`
2. `9_add_case_management_backend_api.sql`
3. `10_add_case_role_access.sql`
4. `11_add_case_ui_support.sql`
5. `12_connect_cases_to_pos_transactions.sql`

The scripts are written to update an existing project safely. The final
script requests a PostgREST schema-cache reload.

After installation, verify the RPC exists:

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'case_list_all';
```

The expected result is `case_list_all` with no arguments.
