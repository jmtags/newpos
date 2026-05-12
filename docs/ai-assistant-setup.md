# AI Clinic Assistant Setup

The React app calls this hosted Supabase Edge Function:

```text
ai-clinic-assistant
```

If the app shows `404` or `Failed to send a request to the Edge Function`, the function is not deployed to the Supabase project configured in `.env`.

Current project URL from `.env`:

```text
https://rcxdipmscwqzufafyrhs.supabase.co
```

## 1. Run the SQL Migration

In Supabase SQL Editor, run:

```sql
-- database/7_ai_clinic_assistant.sql
```

This creates:

- `ai_logs`
- AI access checks
- Safe AI query RPCs

## 2. Deploy the Edge Function

From the project root:

```bash
supabase login
supabase link --project-ref rcxdipmscwqzufafyrhs
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
supabase functions deploy ai-clinic-assistant
```

You can also deploy directly with the project ref:

```bash
supabase functions deploy ai-clinic-assistant --project-ref rcxdipmscwqzufafyrhs
```

## 3. Confirm the Function Exists

In the Supabase dashboard:

1. Open the project.
2. Go to **Edge Functions**.
3. Confirm `ai-clinic-assistant` is listed.
4. Confirm the `OPENAI_API_KEY` secret is set.

## 4. Restart the React App

After deployment:

```bash
npm run dev
```

Then log in and open **AI Assistant** from the sidebar.

## Notes

- Do not put the OpenAI API key in `.env` for the React frontend.
- The key belongs only in Supabase Edge Function secrets.
- The frontend uses `supabase.functions.invoke('ai-clinic-assistant')`.
- If `.env` points to a different Supabase project, deploy the function to that same project.

