import React, { useMemo, useState } from 'react';
import {
  Bot,
  CalendarDays,
  DoorOpen,
  Loader2,
  MessageSquareText,
  Send,
  ShieldAlert,
  Sparkles,
  WalletCards
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { aiAssistantService, AIAssistantSourceSummary } from '../services/aiAssistantService';
import type { AppUser } from '../services/userService';

interface AIAssistantProps {
  currentUser: AppUser | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourceSummary?: AIAssistantSourceSummary[];
  blocked?: boolean;
}

const allowedRoles = ['admin', 'manager', 'regular_user'];

const quickPrompts = [
  {
    label: 'Today schedule',
    icon: CalendarDays,
    prompt: 'What appointments are scheduled today?'
  },
  {
    label: 'Available rooms',
    icon: DoorOpen,
    prompt: 'Which rooms are available today?'
  },
  {
    label: 'Unpaid balances',
    icon: WalletCards,
    prompt: 'Show unpaid and partial transactions.'
  },
  {
    label: 'Daily summary',
    icon: Sparkles,
    prompt: 'Give me a daily clinic summary for today.'
  },
  {
    label: 'Revenue',
    icon: WalletCards,
    prompt: 'Summarize POS revenue today.'
  },
  {
    label: 'Service performance',
    icon: MessageSquareText,
    prompt: 'Which services performed best this month?'
  },
  {
    label: 'Referrals',
    icon: MessageSquareText,
    prompt: 'Summarize referral sources this month.'
  }
];

const formatNumber = (value: unknown) => {
  if (typeof value !== 'number') return null;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatSourceSummary = (summary?: AIAssistantSourceSummary[]) => {
  if (!summary || summary.length === 0) return [];

  return summary.map((item, index) => {
    const details: string[] = [];

    if (typeof item.row_count === 'number') {
      details.push(`${item.row_count} row${item.row_count === 1 ? '' : 's'}`);
    }

    if (typeof item.transaction_count === 'number') {
      details.push(`${item.transaction_count} transaction${item.transaction_count === 1 ? '' : 's'}`);
    }

    const grossSales = formatNumber(item.gross_sales);
    if (grossSales) details.push(`gross sales ₱${grossSales}`);

    const collected = formatNumber(item.payments_collected);
    if (collected) details.push(`collected ₱${collected}`);

    const outstanding = formatNumber(item.outstanding_balance);
    if (outstanding) details.push(`outstanding ₱${outstanding}`);

    if (item.error) details.push(`error: ${item.error}`);
    if (item.blocked) details.push('blocked');

    return {
      id: `${item.tool || item.label || 'source'}-${index}`,
      label: item.label || item.tool || 'Source data',
      details: details.join(' | ') || 'used'
    };
  });
};

export const AIAssistant: React.FC<AIAssistantProps> = ({ currentUser }) => {
  const canUseAssistant = Boolean(
    currentUser?.is_active && allowedRoles.includes(currentUser.role)
  );
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hi. I can help with clinic operations: schedules, availability, rooms, unpaid balances, POS summaries, service performance, referrals, and payment status. I cannot diagnose clients or make clinical decisions.'
    }
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const lastSourceSummary = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.sourceSummary);
    return formatSourceSummary(lastAssistant?.sourceSummary);
  }, [messages]);

  const sendMessage = async (messageText = input) => {
    const trimmed = messageText.trim();
    if (!trimmed || sending || !canUseAssistant) return;

    setInput('');
    setError('');
    setSending(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed
    };

    setMessages((current) => [...current, userMessage]);

    try {
      const response = await aiAssistantService.ask(trimmed);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.answer,
        sourceSummary: response.sourceSummary,
        blocked: response.blocked
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'AI Assistant request failed.');
    } finally {
      setSending(false);
    }
  };

  if (!canUseAssistant) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 mt-1" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              AI Assistant unavailable
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Your account is not allowed to use the AI Clinic Operations
              Assistant. Ask an administrator to review your access.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            AI Clinic Operations Assistant
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Ask operational questions about appointments, rooms, associate
            availability, balances, revenue, referrals, services, and payments.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 max-w-xl">
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              This assistant is for operations only. It cannot diagnose clients,
              interpret clinical results, recommend treatment, or make clinical
              decisions.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <Card className="flex h-[680px] flex-col overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Clinic operations chat
                  </h3>
                  <p className="text-xs text-slate-500">
                    Answers are generated from approved operational data tools.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-3xl rounded-lg px-4 py-3 text-sm shadow-sm ${
                        message.role === 'user'
                          ? 'bg-teal-600 text-white'
                          : message.blocked
                          ? 'bg-amber-50 border border-amber-200 text-amber-900'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>

                      {message.sourceSummary && (
                        <div className="mt-3 border-t border-slate-200 pt-2">
                          <p className="text-xs font-semibold text-slate-500">
                            Source data summary
                          </p>
                          <div className="mt-1 space-y-1">
                            {formatSourceSummary(message.sourceSummary).map(
                              (source) => (
                                <p
                                  key={source.id}
                                  className="text-xs text-slate-500"
                                >
                                  {source.label}: {source.details}
                                </p>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking clinic data...
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              {error && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Ask: What appointments are scheduled today?"
                  className="min-h-12 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
                />

                <Button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || sending}
                  className="md:self-end"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-slate-900 mb-3">
              Quick questions
            </h3>
            <div className="space-y-2">
              {quickPrompts.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => sendMessage(prompt.prompt)}
                    disabled={sending}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Icon className="w-4 h-4 text-teal-600" />
                    <span>{prompt.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              Last source data
            </h3>
            {lastSourceSummary.length > 0 ? (
              <div className="space-y-2">
                {lastSourceSummary.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    <p className="font-medium text-slate-700">{source.label}</p>
                    <p>{source.details}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Source summaries appear after an assistant answer.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-slate-900 mb-2">
              Good uses
            </h3>
            <ul className="space-y-1 text-sm text-slate-600">
              <li>Check today&apos;s appointments.</li>
              <li>Review available rooms.</li>
              <li>Find unpaid balances.</li>
              <li>Summarize POS collections.</li>
              <li>Compare services and referrals.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};
