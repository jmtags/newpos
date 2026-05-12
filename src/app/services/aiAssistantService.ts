import { supabase } from '../lib/supabaseClient';

export interface AIAssistantToolSummary {
  name: string;
  label: string;
  error?: string;
}

export interface AIAssistantSourceSummary {
  tool?: string;
  label?: string;
  row_count?: number;
  transaction_count?: number;
  gross_sales?: number;
  payments_collected?: number;
  outstanding_balance?: number;
  error?: string;
  blocked?: boolean;
}

export interface AIAssistantResponse {
  answer: string;
  toolsUsed: AIAssistantToolSummary[];
  sourceSummary: AIAssistantSourceSummary[];
  blocked: boolean;
}

export const aiAssistantService = {
  async ask(message: string): Promise<AIAssistantResponse> {
    const functionName = 'ai-clinic-assistant';
    const { data, error } = await supabase.functions.invoke(
      functionName,
      {
        body: { message }
      }
    );

    if (error) {
      const message = error.message || 'Unable to reach the AI Assistant.';
      const likelyMissingFunction =
        message.toLowerCase().includes('failed to send') ||
        message.includes('404') ||
        message.toLowerCase().includes('not found');

      if (likelyMissingFunction) {
        throw new Error(
          `AI Assistant Edge Function is not reachable. Make sure "${functionName}" is deployed to the Supabase project configured in .env, then set the OPENAI_API_KEY Edge Function secret.`
        );
      }

      throw new Error(message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      answer: data?.answer || 'No answer was returned.',
      toolsUsed: data?.toolsUsed || [],
      sourceSummary: data?.sourceSummary || [],
      blocked: Boolean(data?.blocked)
    };
  }
};
