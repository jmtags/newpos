# AI Clinic Operations Assistant Documentation

Feature documentation for the Psyzygy Psychological Center POS and Scheduling System.

## Overview

The **AI Clinic Operations Assistant** is an operations-only assistant built into the React + Tailwind + Supabase POS system. It helps front desk and admin staff quickly answer questions about clinic operations using approved database query tools.

The assistant can help with:

- Appointment schedules
- Associate availability
- Room availability
- Unpaid and partial balances
- Daily clinic summaries
- POS revenue summaries
- Service performance
- Referral source summaries
- Transaction and payment status

The assistant must not be used for:

- Client diagnosis
- Clinical decision-making
- Treatment planning
- Medication advice
- Psychological test interpretation
- Crisis or self-harm guidance
- Any instruction that should be handled by a licensed clinician

If a user asks a clinical question, the assistant blocks the request and redirects the user to a licensed clinician or clinic protocol.

## Feature Location

The feature appears in the sidebar as:

```text
AI Assistant
```

Frontend page:

```text
src/app/pages/AIAssistant.tsx
```

Frontend service:

```text
src/app/services/aiAssistantService.ts
```

Supabase Edge Function:

```text
supabase/functions/ai-clinic-assistant/index.ts
```

Database migration:

```text
database/7_ai_clinic_assistant.sql
```

Setup guides:

```text
docs/ai-assistant-setup.md
docs/ai-assistant-dashboard-deploy.md
```

## Architecture

The assistant uses a secure server-side architecture.

Flow:

1. Staff logs in to the React app.
2. Staff opens **AI Assistant**.
3. Staff asks an operations question.
4. React calls:

```ts
supabase.functions.invoke('ai-clinic-assistant')
```

5. The Supabase Edge Function validates the logged-in user.
6. The Edge Function chooses safe database RPC tools based on the question.
7. The Edge Function calls only approved Supabase RPC functions.
8. The Edge Function sends the summarized operational data to OpenAI.
9. OpenAI returns a plain-language answer.
10. The Edge Function logs the question and answer in `ai_logs`.
11. React displays the answer and source data summary.

Important security rule:

```text
The OpenAI API key is never stored in React and is never sent to the browser.
```

The OpenAI key belongs only in Supabase Edge Function secrets.

## Database Objects

The migration file creates:

```text
database/7_ai_clinic_assistant.sql
```

### `ai_logs`

The `ai_logs` table records assistant usage.

Fields include:

- `id`
- `user_id`
- `auth_user_id`
- `role`
- `question`
- `answer`
- `tools_used`
- `source_summary`
- `blocked`
- `created_at`

Purpose:

- Track who used the assistant
- Track what was asked
- Track what data tools were used
- Track blocked clinical requests
- Support admin review and troubleshooting

### Access Check Functions

The migration creates:

```sql
public.ai_can_use_assistant(auth_id uuid)
public.ai_is_admin_user(auth_id uuid)
```

These functions check active users and roles.

Allowed roles:

- `admin`
- `manager`
- `regular_user`

Inactive users cannot use the assistant.

### Safe Query RPC Functions

The assistant does not query arbitrary database tables. It uses approved RPC functions only.

Created functions:

```sql
public.ai_get_today_appointments(date)
public.ai_get_available_rooms(date, time, time)
public.ai_get_associate_availability(date, uuid)
public.ai_get_unpaid_transactions(integer)
public.ai_get_revenue_summary(date, date)
public.ai_get_referral_summary(date, date)
public.ai_get_service_performance(date, date)
```

These functions return limited operational summaries instead of unrestricted records.

## AI Data Tools

### `getTodayAppointments`

Use cases:

- “What appointments are scheduled today?”
- “Show tomorrow’s appointments.”
- “What is the clinic schedule on 2026-05-15?”

Data returned:

- Appointment date
- Start and end time
- Status
- Appointment type
- Payment status
- Amount due and paid
- Client name
- Service name
- Associate name
- Room
- Referral source

### `getAvailableRooms`

Use cases:

- “Which rooms are available today?”
- “Are rooms available tomorrow at 2pm?”
- “Show room availability for 2026-05-15 9am.”

Data returned:

- Room name
- Room type
- Capacity
- Notes
- Availability for the requested time
- Existing appointments for that date

### `getAssociateAvailability`

Use cases:

- “Who is available today?”
- “Show associate availability tomorrow.”
- “Which associates have appointments today?”

Data returned:

- Associate name
- Title
- Profession
- Availability windows
- Appointments for the requested date

### `getUnpaidTransactions`

Use cases:

- “Show unpaid transactions.”
- “Who still has a balance?”
- “List partial payments.”

Data returned:

- Transaction number
- Transaction date
- Client name
- Total amount
- Total paid
- Balance
- Payment status
- Notes

### `getRevenueSummary`

Use cases:

- “Summarize POS revenue today.”
- “Give me this week’s revenue.”
- “How much did we collect this month?”

Data returned:

- Transaction count
- Gross sales
- Subtotal
- Discounts
- Tax
- Payments collected
- Refunds recorded
- Net collected
- Outstanding balance
- Paid count
- Partial count
- Unpaid count

### `getReferralSummary`

Use cases:

- “Which referral sources performed best this month?”
- “Summarize referrals today.”

Data returned:

- Referral name
- Transaction count
- Line item count
- Revenue

### `getServicePerformance`

Use cases:

- “Which services performed best this month?”
- “Show top services this week.”

Data returned:

- Service name
- Transaction count
- Quantity sold
- Gross amount
- Discounts
- Revenue

## Date and Time Interpretation

The Edge Function can interpret common date terms:

- `today`
- `tomorrow`
- `yesterday`
- `this week`
- `this month`
- `this year`
- Explicit dates like `2026-05-12`

The function uses **Asia/Manila** time for today’s date.

Time examples:

- `9am`
- `2:30pm`
- `13:00`
- `9am to 10am`

If a room availability question includes only one time, the function assumes a one-hour window.

## Role-Based Access

The AI Assistant is visible to:

- Admin
- Manager
- Regular User

The assistant is hidden from unsupported roles.

Frontend sidebar rule:

```text
Show AI Assistant only for admin, manager, regular_user.
```

Backend Edge Function rule:

```text
Reject inactive users or users outside allowed roles.
```

Database rule:

```text
ai_logs can be inserted by allowed authenticated users.
ai_logs can be viewed by the user who created them or by admin users.
```

## Safety Rules

The assistant has built-in safety checks.

It blocks requests containing clinical intent such as:

- Diagnose
- Diagnosis
- Clinical decision
- Treatment plan
- Therapy recommendation
- Medication
- Prescribe
- Interpret assessment
- Interpret psychological test
- Suicidal
- Self-harm
- What disorder
- Mental illness

Blocked response example:

```text
I can help with clinic operations, schedules, rooms, payments, and reports, but I cannot diagnose clients, interpret clinical results, or make treatment decisions. Please refer clinical questions to the licensed clinician in charge.
```

Blocked requests are logged in `ai_logs` with:

```text
blocked = true
```

## Frontend Behavior

The AI page includes:

- Chat area
- Quick question buttons
- Source data summary
- Safety notice
- Loading state
- Error state

Quick questions include:

- Today schedule
- Available rooms
- Unpaid balances
- Daily summary
- Revenue
- Service performance
- Referrals

The assistant displays a source data summary after answers, such as:

```text
Revenue summary for today: 4 transactions | gross sales ₱12,000.00 | collected ₱8,000.00
```

## Edge Function Behavior

Function name:

```text
ai-clinic-assistant
```

Main responsibilities:

1. Handle CORS.
2. Accept only `POST` requests.
3. Validate Supabase session.
4. Load current user profile.
5. Check role and active status.
6. Block clinical requests.
7. Select safe tools.
8. Run Supabase RPCs.
9. Call OpenAI Responses API.
10. Log usage.
11. Return answer and source summary.

## OpenAI Configuration

Required Supabase Edge Function secret:

```text
OPENAI_API_KEY
```

Optional secret:

```text
OPENAI_MODEL
```

Default model:

```text
gpt-4.1-mini
```

Set secrets using Supabase Dashboard or CLI.

Dashboard path:

```text
Supabase Dashboard > Edge Functions > Secrets
```

CLI example:

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

Security reminder:

```text
Never place OPENAI_API_KEY in React .env.
```

## Deployment

### SQL Migration

Run this in Supabase SQL Editor:

```sql
-- database/7_ai_clinic_assistant.sql
```

### Edge Function Deployment with Dashboard

1. Go to Supabase Dashboard.
2. Open the project.
3. Go to **Edge Functions**.
4. Create or edit:

```text
ai-clinic-assistant
```

5. Paste the code from:

```text
supabase/functions/ai-clinic-assistant/index.ts
```

6. Deploy.
7. Add Edge Function secrets.

### Edge Function Deployment with CLI

```bash
supabase login
supabase link --project-ref rcxdipmscwqzufafyrhs
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
supabase functions deploy ai-clinic-assistant
```

## Example Questions

Appointment questions:

```text
What appointments are scheduled today?
Show tomorrow's appointments.
What is the schedule on 2026-05-15?
```

Room questions:

```text
Which rooms are available today?
Is Assessment Room free at 2pm?
Show room availability tomorrow at 9am.
```

Associate questions:

```text
Who is available today?
Show associate availability this week.
Which associate has the lightest schedule today?
```

Payment questions:

```text
Show unpaid transactions.
Who still has a balance?
List partial payments.
```

Revenue questions:

```text
Summarize POS revenue today.
How much did we collect this month?
Give me a daily clinic summary.
```

Service questions:

```text
Which services performed best this month?
Show service performance this week.
```

Referral questions:

```text
Which referral sources generated the most revenue this month?
Summarize referrals today.
```

## Example Blocked Questions

The assistant should refuse questions like:

```text
What diagnosis does this client have?
What treatment plan should we use?
Can you interpret this psychological assessment?
Should this client take medication?
Is this client suicidal?
```

These are clinical matters and must be handled by licensed professionals and clinic protocols.

## Logging and Audit

Every assistant request is logged in:

```text
public.ai_logs
```

Logged details:

- User
- Role
- Question
- Answer
- Tools used
- Source summary
- Whether the request was blocked
- Created timestamp

Admins can query logs for monitoring and troubleshooting.

Example SQL:

```sql
select
  created_at,
  role,
  question,
  blocked,
  tools_used,
  source_summary
from public.ai_logs
order by created_at desc
limit 50;
```

## Troubleshooting

### Error: `404 Failed to send a request to the Edge Function`

Cause:

```text
The Edge Function is not deployed to the Supabase project used by .env.
```

Fix:

1. Confirm `.env` points to the correct Supabase project.
2. Confirm Edge Function exists:

```text
ai-clinic-assistant
```

3. Deploy the function.

### Error: `OPENAI_API_KEY is not configured`

Cause:

```text
The OpenAI key is missing from Supabase Edge Function secrets.
```

Fix:

1. Go to Supabase Dashboard > Edge Functions > Secrets.
2. Add:

```text
OPENAI_API_KEY=your_key
```

3. Retry the assistant.

### Error: `You exceeded your current quota`

Cause:

```text
The OpenAI project has no available API quota or billing capacity.
```

Fix:

1. Check OpenAI billing.
2. Confirm the key belongs to a funded OpenAI project.
3. Add credits or billing.
4. Retry after quota is restored.

The Edge Function now handles quota errors gracefully and tells staff what happened.

### Error: `You are not allowed to use the AI Assistant`

Cause:

```text
The user is inactive or does not have an allowed role.
```

Fix:

1. Go to User Management.
2. Confirm the user is active.
3. Confirm the role is admin, manager, or regular user.

### Error from RPC Tool

Cause:

```text
The SQL migration may not have been run, or a database function is missing.
```

Fix:

Run:

```sql
-- database/7_ai_clinic_assistant.sql
```

Then retry.

## Maintenance Checklist

After deployment:

1. Confirm `ai-clinic-assistant` appears in Supabase Edge Functions.
2. Confirm `OPENAI_API_KEY` is set as an Edge Function secret.
3. Confirm `database/7_ai_clinic_assistant.sql` has been run.
4. Log in as an active admin or staff account.
5. Ask: `What appointments are scheduled today?`
6. Confirm an answer appears.
7. Ask a blocked clinical question.
8. Confirm the assistant refuses.
9. Check `ai_logs`.
10. Confirm the request was logged.

## Data Privacy Notes

The assistant uses operational data from the database. Staff should still follow clinic privacy rules.

Guidelines:

1. Do not ask for unnecessary personal information.
2. Do not use the assistant for clinical content.
3. Do not paste psychological reports or test results into the chat.
4. Do not paste OpenAI keys, Supabase keys, passwords, or secrets into chat.
5. Review logs if misuse is suspected.

## Current Limitations

The assistant currently:

- Uses simple keyword-based tool selection.
- Uses date parsing for common date phrases.
- Does not perform write actions.
- Does not create appointments.
- Does not collect payments.
- Does not modify records.
- Does not replace reports or audit logs.
- Does not make clinical decisions.

This is intentional for safety.

## Future Enhancements

Possible future improvements:

1. Add admin-only AI log viewer page.
2. Add more structured date range picker in the UI.
3. Add associate name filtering.
4. Add room-specific filtering.
5. Add exportable AI summaries.
6. Add stricter PHI minimization options.
7. Add response templates for daily briefing.
8. Add dashboard card for AI usage metrics.

## File Reference

Frontend:

```text
src/app/pages/AIAssistant.tsx
src/app/services/aiAssistantService.ts
src/app/App.tsx
src/app/components/Sidebar.tsx
```

Backend:

```text
supabase/functions/ai-clinic-assistant/index.ts
```

Database:

```text
database/7_ai_clinic_assistant.sql
```

Docs:

```text
docs/ai-assistant-setup.md
docs/ai-assistant-dashboard-deploy.md
docs/ai-clinic-assistant-feature-documentation.md
```

## Summary

The AI Clinic Operations Assistant is a safe operations assistant for front desk and admin workflows. It helps staff understand schedules, rooms, availability, balances, revenue, services, referrals, and payment status while preventing clinical use.

Its key safeguards are:

- Server-side OpenAI calls only
- No frontend API key exposure
- Approved database RPC tools only
- Role-based access
- Clinical request blocking
- AI usage logging

