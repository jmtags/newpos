import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type ToolName =
  | 'getTodayAppointments'
  | 'getAppointmentSummary'
  | 'getAvailableRooms'
  | 'getAssociateAvailability'
  | 'getUnpaidTransactions'
  | 'getRevenueSummary'
  | 'getReferralSummary'
  | 'getServicePerformance';

interface ToolResult {
  name: ToolName;
  label: string;
  data: unknown;
  params?: Record<string, unknown>;
  error?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const allowedRoles = ['admin', 'manager', 'regular_user'];
const defaultModel = 'gpt-4.1-mini';

const clinicalRequestPatterns = [
  /\bdiagnos(e|is|tic)\b/i,
  /\bclinical decision\b/i,
  /\btreatment plan\b/i,
  /\btherapy recommendation\b/i,
  /\bmedication\b/i,
  /\bprescrib(e|ing)\b/i,
  /\binterpret (assessment|test|psychological)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[- ]harm\b/i,
  /\bwhat disorder\b/i,
  /\bmental illness does\b/i
];

const systemInstructions = `
You are the AI Clinic Operations Assistant for Psyzygy Psychological Center.
You help front desk and admin staff with operational questions only.

You may answer about:
- appointment schedules
- appointment summaries by date range
- associate availability
- room availability
- unpaid balances
- daily clinic summary
- POS revenue summaries
- service performance
- referral source summaries
- transaction/payment status

You must not diagnose clients, interpret clinical results, suggest treatment,
make clinical decisions, recommend medication, or provide mental health crisis
instructions. If asked for clinical guidance, politely refuse and redirect the
user to a licensed clinician or emergency protocol.

Answer in simple front desk/admin language. Be concise, practical, and specific.
Use the provided source data only. If the data is incomplete, say what is missing.
Include a short "Source data used" line when useful.
When the staff question asks for scheduled appointments, appointment summaries,
bookings, or the clinic calendar, focus on appointment data. Do not include POS
revenue unless the staff question explicitly asks for revenue, sales, POS,
collections, payments, refunds, or transactions.
`;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });

const toDateValue = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const monthNameToIndex: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
};

const getManilaToday = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date());
};

const parseDateRange = (message: string) => {
  const lower = message.toLowerCase();
  const explicitDate = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const explicitMonth = lower.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(20\d{2})\b/
  );

  if (explicitDate) {
    return {
      startDate: explicitDate[1],
      endDate: explicitDate[1],
      label: explicitDate[1]
    };
  }

  if (explicitMonth) {
    const monthIndex = monthNameToIndex[explicitMonth[1]];
    const year = Number(explicitMonth[2]);
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);

    return {
      startDate: toDateValue(start),
      endDate: toDateValue(end),
      label: `${explicitMonth[1]} ${year}`
    };
  }

  const todayValue = getManilaToday();
  const todayDate = new Date(`${todayValue}T00:00:00+08:00`);

  if (lower.includes('tomorrow')) {
    const date = toDateValue(addDays(todayDate, 1));
    return { startDate: date, endDate: date, label: 'tomorrow' };
  }

  if (lower.includes('yesterday')) {
    const date = toDateValue(addDays(todayDate, -1));
    return { startDate: date, endDate: date, label: 'yesterday' };
  }

  if (lower.includes('this month') || lower.includes('monthly')) {
    const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    const end = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
    return {
      startDate: toDateValue(start),
      endDate: toDateValue(end),
      label: 'this month'
    };
  }

  if (lower.includes('this year') || lower.includes('yearly')) {
    const start = new Date(todayDate.getFullYear(), 0, 1);
    const end = new Date(todayDate.getFullYear(), 11, 31);
    return {
      startDate: toDateValue(start),
      endDate: toDateValue(end),
      label: 'this year'
    };
  }

  if (lower.includes('this week') || lower.includes('weekly')) {
    const day = todayDate.getDay();
    const start = addDays(todayDate, -day);
    const end = addDays(start, 6);
    return {
      startDate: toDateValue(start),
      endDate: toDateValue(end),
      label: 'this week'
    };
  }

  return {
    startDate: todayValue,
    endDate: todayValue,
    label: 'today'
  };
};

const normalizeTime = (hour: number, minute = 0) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

const parseTimeRange = (message: string) => {
  const lower = message
    .toLowerCase()
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[₱$]\s*\d+(?:,\d{3})*(?:\.\d+)?/g, ' ')
    .replace(/\b\d+(?:\.\d+)?%/g, ' ');
  const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{1,2}):(\d{2})\b/g;
  const matches = [...lower.matchAll(timeRegex)]
    .map((match) => {
      let hour = Number(match[1] || match[4]);
      const minute = Number(match[2] || match[5] || 0);
      const meridiem = match[3];

      if (hour > 24 || minute > 59) return null;
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (hour === 24) hour = 0;

      return { hour, minute };
    })
    .filter(Boolean) as Array<{ hour: number; minute: number }>;

  if (matches.length === 0) {
    return { startTime: null, endTime: null };
  }

  const first = matches[0];
  const second = matches[1] || {
    hour: first.hour + 1,
    minute: first.minute
  };

  return {
    startTime: normalizeTime(first.hour, first.minute),
    endTime: normalizeTime(second.hour, second.minute)
  };
};

const containsClinicalRequest = (message: string) =>
  clinicalRequestPatterns.some((pattern) => pattern.test(message));

const isAppointmentIntent = (message: string) =>
  /\b(appointment|appointments|schedule|scheduled|scheduling|calendar|booking|bookings)\b/i.test(
    message
  );

const isRevenueIntent = (message: string) =>
  /\b(revenue|sales|income|pos|collection|collected|gross|net|refund|refunds|transaction|transactions|payment total|payments collected)\b/i.test(
    message
  ) ||
  /\b(daily|monthly|yearly)?\s*(revenue|sales|income|pos)\s*summary\b/i.test(
    message
  );

const chooseTools = (message: string): ToolName[] => {
  const lower = message.toLowerCase();
  const tools = new Set<ToolName>();
  const appointmentIntent = isAppointmentIntent(message);

  if (appointmentIntent) {
    tools.add('getAppointmentSummary');
  }

  if (/room/.test(lower)) {
    tools.add('getAvailableRooms');
  }

  if (/associate|availability|available provider|provider/.test(lower)) {
    tools.add('getAssociateAvailability');
  }

  if (/unpaid|balance|partial|payment status|outstanding|receivable/.test(lower)) {
    tools.add('getUnpaidTransactions');
  }

  if (isRevenueIntent(message)) {
    tools.add('getRevenueSummary');
  }

  if (/referral|source/.test(lower)) {
    tools.add('getReferralSummary');
  }

  if (/service performance|top service|popular service|service summary|services/.test(lower)) {
    tools.add('getServicePerformance');
  }

  if (/daily clinic summary|clinic summary|today summary|how are we doing/.test(lower)) {
    tools.add('getAppointmentSummary');
    tools.add('getRevenueSummary');
    tools.add('getUnpaidTransactions');
  }

  if (tools.size === 0) {
    tools.add('getTodayAppointments');
    tools.add('getRevenueSummary');
    tools.add('getUnpaidTransactions');
  }

  return [...tools];
};

const summarizeToolResult = (result: ToolResult) => {
  if (result.error) {
    return {
      tool: result.name,
      label: result.label,
      error: result.error
    };
  }

  if (Array.isArray(result.data)) {
    return {
      tool: result.name,
      label: result.label,
      row_count: result.data.length
    };
  }

  if (result.data && typeof result.data === 'object') {
    const data = result.data as Record<string, unknown>;
    return {
      tool: result.name,
      label: result.label,
      transaction_count: data.transaction_count,
      gross_sales: data.gross_sales,
      payments_collected: data.payments_collected,
      outstanding_balance: data.outstanding_balance
    };
  }

  return {
    tool: result.name,
    label: result.label,
    row_count: 0
  };
};

const extractOpenAIText = (payload: any) => {
  if (payload?.output_text) return String(payload.output_text);

  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.text) chunks.push(String(content.text));
    }
  }

  return chunks.join('\n').trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') || defaultModel;
  const authHeader = req.headers.get('Authorization') || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase Edge Function environment is incomplete.' }, 500);
  }

  if (!openaiApiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY is not configured for this Edge Function.' }, 500);
  }

  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header.' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const logClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey,
    supabaseServiceRoleKey
      ? undefined
      : {
          global: {
            headers: {
              Authorization: authHeader
            }
          }
        }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, auth_user_id, full_name, email, role, is_active')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  if (!profile?.is_active || !allowedRoles.includes(profile.role)) {
    return jsonResponse({ error: 'You are not allowed to use the AI Assistant.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '').trim();

  if (!message) {
    return jsonResponse({ error: 'Please enter a question.' }, 400);
  }

  if (message.length > 1200) {
    return jsonResponse({ error: 'Please keep the question under 1,200 characters.' }, 400);
  }

  const writeLog = async (
    answer: string,
    toolsUsed: unknown[],
    sourceSummary: unknown,
    blocked = false
  ) => {
    await logClient.from('ai_logs').insert({
      user_id: profile.id,
      auth_user_id: authData.user.id,
      role: profile.role,
      question: message,
      answer,
      tools_used: toolsUsed,
      source_summary: sourceSummary,
      blocked
    });
  };

  if (containsClinicalRequest(message)) {
    const answer =
      'I can help with clinic operations, schedules, rooms, payments, and reports, but I cannot diagnose clients, interpret clinical results, or make treatment decisions. Please refer clinical questions to the licensed clinician in charge.';

    await writeLog(answer, [], { reason: 'Clinical or diagnostic request blocked.' }, true);
    return jsonResponse({
      answer,
      toolsUsed: [],
      sourceSummary: [{ label: 'Safety policy', blocked: true }],
      blocked: true
    });
  }

  const range = parseDateRange(message);
  const timeRange = parseTimeRange(message);
  const requestedTools = chooseTools(message);
  const toolResults: ToolResult[] = [];

  const runRpc = async (
    name: ToolName,
    label: string,
    rpcName: string,
    params: Record<string, unknown>
  ) => {
    const { data, error } = await supabase.rpc(rpcName, params);
    toolResults.push({
      name,
      label,
      params,
      data: data ?? null,
      error: error?.message
    });
  };

  for (const tool of requestedTools) {
    if (tool === 'getTodayAppointments') {
      await runRpc(tool, `Appointments for ${range.label}`, 'ai_get_today_appointments', {
        target_date: range.startDate
      });
    }

    if (tool === 'getAppointmentSummary') {
      await runRpc(
        tool,
        `Appointment summary for ${range.label}`,
        'ai_get_appointment_summary',
        {
          start_date: range.startDate,
          end_date: range.endDate
        }
      );
    }

    if (tool === 'getAvailableRooms') {
      await runRpc(tool, `Room availability for ${range.label}`, 'ai_get_available_rooms', {
        target_date: range.startDate,
        start_at: timeRange.startTime,
        end_at: timeRange.endTime
      });
    }

    if (tool === 'getAssociateAvailability') {
      await runRpc(
        tool,
        `Associate availability for ${range.label}`,
        'ai_get_associate_availability',
        {
          target_date: range.startDate,
          associate_id_filter: null
        }
      );
    }

    if (tool === 'getUnpaidTransactions') {
      await runRpc(tool, 'Unpaid and partial transactions', 'ai_get_unpaid_transactions', {
        limit_count: 25
      });
    }

    if (tool === 'getRevenueSummary') {
      await runRpc(tool, `Revenue summary for ${range.label}`, 'ai_get_revenue_summary', {
        start_date: range.startDate,
        end_date: range.endDate
      });
    }

    if (tool === 'getReferralSummary') {
      await runRpc(tool, `Referral summary for ${range.label}`, 'ai_get_referral_summary', {
        start_date: range.startDate,
        end_date: range.endDate
      });
    }

    if (tool === 'getServicePerformance') {
      await runRpc(
        tool,
        `Service performance for ${range.label}`,
        'ai_get_service_performance',
        {
          start_date: range.startDate,
          end_date: range.endDate
        }
      );
    }
  }

  const sourceSummary = toolResults.map(summarizeToolResult);

  const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: systemInstructions,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Staff question: ${message}`,
                `Current user role: ${profile.role}`,
                `Date range interpreted: ${range.startDate} to ${range.endDate} (${range.label})`,
                `Time interpreted: ${timeRange.startTime || 'not specified'} to ${timeRange.endTime || 'not specified'}`,
                'Source data from approved operational tools:',
                JSON.stringify(toolResults, null, 2)
              ].join('\n')
            }
          ]
        }
      ],
      max_output_tokens: 800
    })
  });

  const openaiPayload = await openaiResponse.json().catch(() => ({}));

  if (!openaiResponse.ok) {
    const errorMessage =
      openaiPayload?.error?.message || 'OpenAI request failed.';
    const errorCode = String(openaiPayload?.error?.code || '').toLowerCase();
    const isQuotaError =
      openaiResponse.status === 429 ||
      errorCode.includes('quota') ||
      errorMessage.toLowerCase().includes('quota');

    if (isQuotaError) {
      const answer = [
        'The AI Assistant reached OpenAI successfully, but the OpenAI account has no available quota right now.',
        '',
        'What to do:',
        '1. Ask the OpenAI account owner to check billing, credits, and usage limits.',
        '2. Confirm the OPENAI_API_KEY Supabase secret belongs to a funded OpenAI project.',
        '3. After quota is restored, try the same question again.',
        '',
        'I already checked the approved clinic data tools for this request. See the source data summary below.'
      ].join('\n');

      await writeLog(
        answer,
        toolResults.map((result) => ({
          name: result.name,
          params: result.params,
          error: result.error
        })),
        {
          openai_error: errorMessage,
          source_summary: sourceSummary
        },
        false
      );

      return jsonResponse({
        answer,
        toolsUsed: toolResults.map((result) => ({
          name: result.name,
          label: result.label,
          error: result.error
        })),
        sourceSummary,
        blocked: false,
        degraded: true
      });
    }

    return jsonResponse({ error: errorMessage }, 502);
  }

  const answer =
    extractOpenAIText(openaiPayload) ||
    'I could not generate an answer from the available operational data.';

  await writeLog(
    answer,
    toolResults.map((result) => ({
      name: result.name,
      params: result.params,
      error: result.error
    })),
    sourceSummary,
    false
  );

  return jsonResponse({
    answer,
    toolsUsed: toolResults.map((result) => ({
      name: result.name,
      label: result.label,
      error: result.error
    })),
    sourceSummary,
    blocked: false
  });
});
