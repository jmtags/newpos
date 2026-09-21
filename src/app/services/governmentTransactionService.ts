import { supabase } from '../lib/supabaseClient';

export type GovernmentTransactionStatus =
  | 'referral_received'
  | 'for_review'
  | 'costing_prepared'
  | 'guarantee_letter_received'
  | 'scheduled'
  | 'service_completed'
  | 'soa_submitted'
  | 'awaiting_cheque'
  | 'payment_completed';

export interface GovernmentTransaction {
  id: string;
  reference_number: string;
  status: GovernmentTransactionStatus;
  client_id: string;
  client_name: string;
  client_contact: string;
  cswd_office_id: string;
  cswd_office: string;
  lgu_agency_id: string;
  lgu_name: string;
  social_worker_id: string;
  social_worker: string;
  referral_date: string;
  referral_letter_reference: string;
  selected_tests: string;
  computed_fee: number;
  approved_amount: number;
  endorsement_number: string;
  guarantee_letter_number: string;
  guarantee_letter_date: string;
  guarantee_valid_until: string;
  schedule_date: string;
  service_completed_date: string;
  soa_number: string;
  soa_submitted_date: string;
  cheque_number: string;
  cheque_released_date: string;
  payment_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
  items?: GovernmentTransactionItem[];
}

export interface GovernmentTransactionItem {
  id?: string;
  government_transaction_id?: string;
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order?: number;
}

export type GovernmentTransactionInput = Omit<
  GovernmentTransaction,
  'id' | 'reference_number' | 'created_at' | 'updated_at' | 'items'
> & {
  items?: GovernmentTransactionItem[];
};

export interface GovernmentMasterRecord {
  id: string;
  name: string;
  contact_person: string;
  contact_number: string;
  address: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GovernmentSocialWorker {
  id: string;
  full_name: string;
  cswd_office_id: string;
  lgu_agency_id: string;
  contact_number: string;
  email: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const storageKey = 'psyzygy_government_transactions';

const createReferenceNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `GOV-${datePart}-${randomPart}`;
};

const readStoredTransactions = (): GovernmentTransaction[] => {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error('Error reading government transactions:', error);
    return [];
  }
};

const writeStoredTransactions = (transactions: GovernmentTransaction[]) => {
  window.localStorage.setItem(storageKey, JSON.stringify(transactions));
};

const sortTransactions = (transactions: GovernmentTransaction[]) =>
  [...transactions].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

const isMissingTableError = (error: any) =>
  error?.code === '42P01'
  || String(error?.message || '').toLowerCase().includes('government_transactions');

const dateFields = [
  'referral_date',
  'guarantee_letter_date',
  'guarantee_valid_until',
  'schedule_date',
  'service_completed_date',
  'soa_submitted_date',
  'cheque_released_date'
] as const;

const optionalUuidFields = [
  'client_id',
  'cswd_office_id',
  'lgu_agency_id',
  'social_worker_id'
] as const;

const normalizeForDatabase = (
  input: Partial<GovernmentTransactionInput>
) => {
  const { items, ...transactionInput } = input;
  const payload: Record<string, any> = { ...transactionInput };

  dateFields.forEach((field) => {
    if (field in payload && payload[field] === '') {
      payload[field] = null;
    }
  });

  optionalUuidFields.forEach((field) => {
    if (field in payload && payload[field] === '') {
      payload[field] = null;
    }
  });

  return payload;
};

const normalizeFromDatabase = (transaction: any): GovernmentTransaction => {
  const normalized = { ...transaction };
  const items = normalized.government_transaction_items || normalized.items || [];

  dateFields.forEach((field) => {
    normalized[field] = normalized[field] || '';
  });

  return {
    ...normalized,
    client_id: normalized.client_id || '',
    cswd_office_id: normalized.cswd_office_id || '',
    lgu_agency_id: normalized.lgu_agency_id || '',
    social_worker_id: normalized.social_worker_id || '',
    items: items
      .map((item: any) => ({
        id: item.id,
        government_transaction_id: item.government_transaction_id,
        service_id: item.service_id || '',
        service_name: item.service_name || '',
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
        sort_order: Number(item.sort_order || 0)
      }))
      .sort((a: GovernmentTransactionItem, b: GovernmentTransactionItem) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0)
      )
  } as GovernmentTransaction;
};

const saveTransactionItems = async (
  transactionId: string,
  items: GovernmentTransactionItem[] = []
) => {
  const { error: deleteError } = await supabase
    .from('government_transaction_items')
    .delete()
    .eq('government_transaction_id', transactionId);

  if (deleteError) throw deleteError;

  if (items.length === 0) return;

  const rows = items.map((item, index) => ({
    government_transaction_id: transactionId,
    service_id: item.service_id || null,
    service_name: item.service_name,
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.unit_price || 0),
    line_total:
      Number(item.line_total) ||
      Number(item.quantity || 1) * Number(item.unit_price || 0),
    sort_order: index
  }));

  const { error } = await supabase
    .from('government_transaction_items')
    .insert(rows);

  if (error) throw error;
};

const getTransactionWithItems = async (id: string) => {
  const { data, error } = await supabase
    .from('government_transactions')
    .select('*, government_transaction_items(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return normalizeFromDatabase(data);
};

const listMasterRecords = async (table: string) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('name', { ascending: true });

  if (error && isMissingTableError(error)) return [];
  if (error) throw error;
  return (data || []) as GovernmentMasterRecord[];
};

const saveMasterRecord = async (
  table: string,
  record: Partial<GovernmentMasterRecord>
) => {
  const payload = {
    name: record.name?.trim() || '',
    contact_person: record.contact_person?.trim() || '',
    contact_number: record.contact_number?.trim() || '',
    address: record.address?.trim() || '',
    is_active: record.is_active ?? true
  };

  if (!payload.name) throw new Error('Name is required.');

  if (record.id) {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', record.id)
      .select()
      .single();

    if (error) throw error;
    return data as GovernmentMasterRecord;
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as GovernmentMasterRecord;
};

export const governmentTransactionService = {
  async listTransactions() {
    const { data, error } = await supabase
      .from('government_transactions')
      .select('*, government_transaction_items(*)')
      .order('updated_at', { ascending: false });

    if (!error) return (data || []).map(normalizeFromDatabase);
    if (isMissingTableError(error)) return sortTransactions(readStoredTransactions());
    throw error;
  },

  async createTransaction(input: GovernmentTransactionInput) {
    const { items = [] } = input;
    const { data, error } = await supabase
      .from('government_transactions')
      .insert({ ...normalizeForDatabase(input), reference_number: '' })
      .select()
      .single();

    if (!error) {
      await saveTransactionItems(data.id, items);
      return getTransactionWithItems(data.id);
    }
    if (!isMissingTableError(error)) throw error;

    const now = new Date().toISOString();
    const transaction: GovernmentTransaction = {
      ...input,
      id: crypto.randomUUID(),
      reference_number: createReferenceNumber(),
      created_at: now,
      updated_at: now,
      items
    };

    writeStoredTransactions([transaction, ...readStoredTransactions()]);
    return transaction;
  },

  async updateTransaction(
    id: string,
    input: Partial<GovernmentTransactionInput>
  ) {
    const shouldUpdateItems = 'items' in input;
    const { data, error } = await supabase
      .from('government_transactions')
      .update(normalizeForDatabase(input))
      .eq('id', id)
      .select()
      .single();

    if (!error) {
      if (shouldUpdateItems) {
        await saveTransactionItems(id, input.items || []);
      }
      return getTransactionWithItems(data.id);
    }
    if (!isMissingTableError(error)) throw error;

    let updatedTransaction: GovernmentTransaction | null = null;
    const transactions = readStoredTransactions().map((transaction) => {
      if (transaction.id !== id) return transaction;

      updatedTransaction = {
        ...transaction,
        ...input,
        updated_at: new Date().toISOString()
      };
      return updatedTransaction;
    });

    writeStoredTransactions(transactions);

    if (!updatedTransaction) {
      throw new Error('Government transaction not found.');
    }

    return updatedTransaction;
  },

  async deleteTransaction(id: string) {
    const { error } = await supabase
      .from('government_transactions')
      .delete()
      .eq('id', id);

    if (!error) return;
    if (!isMissingTableError(error)) throw error;

    writeStoredTransactions(
      readStoredTransactions().filter((transaction) => transaction.id !== id)
    );
  },

  async listCswdOffices() {
    return listMasterRecords('government_cswd_offices');
  },

  async saveCswdOffice(record: Partial<GovernmentMasterRecord>) {
    return saveMasterRecord('government_cswd_offices', record);
  },

  async listLguAgencies() {
    return listMasterRecords('government_lgu_agencies');
  },

  async saveLguAgency(record: Partial<GovernmentMasterRecord>) {
    return saveMasterRecord('government_lgu_agencies', record);
  },

  async listSocialWorkers() {
    const { data, error } = await supabase
      .from('government_social_workers')
      .select('*')
      .order('full_name', { ascending: true });

    if (error && isMissingTableError(error)) return [];
    if (error) throw error;
    return (data || []).map((worker: any) => ({
      ...worker,
      cswd_office_id: worker.cswd_office_id || '',
      lgu_agency_id: worker.lgu_agency_id || '',
      contact_number: worker.contact_number || '',
      email: worker.email || ''
    })) as GovernmentSocialWorker[];
  },

  async saveSocialWorker(record: Partial<GovernmentSocialWorker>) {
    const payload = {
      full_name: record.full_name?.trim() || '',
      cswd_office_id: record.cswd_office_id || null,
      lgu_agency_id: record.lgu_agency_id || null,
      contact_number: record.contact_number?.trim() || '',
      email: record.email?.trim() || '',
      is_active: record.is_active ?? true
    };

    if (!payload.full_name) throw new Error('Social worker name is required.');

    if (record.id) {
      const { data, error } = await supabase
        .from('government_social_workers')
        .update(payload)
        .eq('id', record.id)
        .select()
        .single();

      if (error) throw error;
      return data as GovernmentSocialWorker;
    }

    const { data, error } = await supabase
      .from('government_social_workers')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data as GovernmentSocialWorker;
  }
};
