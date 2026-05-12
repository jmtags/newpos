# Deploy AI Assistant Edge Function from Supabase Dashboard

Supabase Edge Functions cannot be created from the SQL Editor. SQL can create tables, policies, and RPC functions, but Edge Functions are TypeScript/Deno code deployed through the Supabase Dashboard, CLI, or MCP.

Use this guide if the CLI deployment returns a permission error or you prefer copy/paste deployment.

Official Supabase docs:

- Dashboard deployment: https://supabase.com/docs/guides/functions/quickstart-dashboard
- Edge Functions overview: https://supabase.com/docs/guides/functions

## 1. Run the Database SQL First

Open Supabase Dashboard > SQL Editor and run:

```sql
-- database/7_ai_clinic_assistant.sql
```

This creates:

- `ai_logs`
- role/access checks
- safe read-only AI query RPCs

## 2. Create the Edge Function in the Dashboard

1. Open Supabase Dashboard.
2. Select project `rcxdipmscwqzufafyrhs`.
3. Go to **Edge Functions**.
4. Click **Deploy a new function**.
5. Choose **Via Editor**.
6. Use this exact function name:

```text
ai-clinic-assistant
```

7. Replace the template code with the full contents of:

```text
supabase/functions/ai-clinic-assistant/index.ts
```

8. Click **Deploy function**.

## 3. Add Edge Function Secrets

In Supabase Dashboard > Edge Functions > Secrets, add:

```text
OPENAI_API_KEY=your_new_rotated_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Important:

- Do not put the OpenAI key in React `.env`.
- Use a new rotated key because the previous key was pasted into chat.
- The key must live only in Supabase Edge Function secrets.

## 4. Confirm It Is Live

After deployment, this URL should no longer return 404:

```text
https://rcxdipmscwqzufafyrhs.supabase.co/functions/v1/ai-clinic-assistant
```

The app calls the same function through:

```ts
supabase.functions.invoke('ai-clinic-assistant')
```

## Why There Is No SQL for the Edge Function

This is not possible:

```sql
create edge function ai-clinic-assistant ...
```

Supabase SQL Editor runs against Postgres. Edge Functions are deployed to Supabase Edge Runtime, which is separate from Postgres.

SQL is still required for the database side, and that part is already provided in:

```text
database/7_ai_clinic_assistant.sql
```

