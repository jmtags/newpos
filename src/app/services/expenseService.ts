import { supabase } from '../lib/supabaseClient';

export type ExpenseStatus = 'Pending' | 'Paid' | 'Void';
export type ExpenseRecurrence =
  | 'One-time'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Yearly';

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  category_id: string | null;
  expense_date: string;
  paid_date: string | null;
  vendor: string | null;
  description: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  recurrence: ExpenseRecurrence;
  status: ExpenseStatus;
  receipt_url: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  expense_categories?: { name: string } | null;
}

export type ExpenseInput = Pick<
  Expense,
  | 'category_id'
  | 'expense_date'
  | 'paid_date'
  | 'vendor'
  | 'description'
  | 'amount'
  | 'payment_method'
  | 'reference_number'
  | 'recurrence'
  | 'status'
  | 'receipt_url'
  | 'notes'
  | 'created_by_user_id'
>;

const expenseSelect = '*, expense_categories(name)';
const receiptBucket = 'expense-receipts';

export const expenseService = {
  async getCategories(includeInactive = true) {
    let query = supabase
      .from('expense_categories')
      .select('*')
      .order('name', { ascending: true });

    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ExpenseCategory[];
  },

  async addCategory(name: string, description?: string) {
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ name: name.trim(), description: description?.trim() || null })
      .select()
      .single();

    if (error) throw error;
    return data as ExpenseCategory;
  },

  async setCategoryActive(id: string, isActive: boolean) {
    const { error } = await supabase
      .from('expense_categories')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;
  },

  async getExpenses() {
    const { data, error } = await supabase
      .from('expenses')
      .select(expenseSelect)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Expense[];
  },

  async addExpense(input: ExpenseInput) {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...input, expense_number: '' })
      .select(expenseSelect)
      .single();

    if (error) throw error;
    return data as Expense;
  },

  async updateExpense(id: string, input: Partial<ExpenseInput>) {
    const { data, error } = await supabase
      .from('expenses')
      .update(input)
      .eq('id', id)
      .select(expenseSelect)
      .single();

    if (error) throw error;
    return data as Expense;
  },

  async voidExpense(id: string) {
    return this.updateExpense(id, { status: 'Void' });
  },

  async uploadReceipt(file: File, authUserId: string) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)
      ? extension
      : 'jpg';
    const path = `${authUserId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${safeExtension}`;
    const { error } = await supabase.storage
      .from(receiptBucket)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;
    return path;
  },

  async getReceiptUrl(receiptPath: string) {
    if (/^https?:\/\//i.test(receiptPath)) return receiptPath;

    const { data, error } = await supabase.storage
      .from(receiptBucket)
      .createSignedUrl(receiptPath, 60 * 60);

    if (error) throw error;
    return data.signedUrl;
  },

  async getPayments(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, amount, payment_date, transaction_id, transactions!inner(is_void)')
      .gte('payment_date', `${startDate}T00:00:00+08:00`)
      .lte('payment_date', `${endDate}T23:59:59.999+08:00`)
      .eq('transactions.is_void', false);

    if (error) throw error;
    return data || [];
  }
};
