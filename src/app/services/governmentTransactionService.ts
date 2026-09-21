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
  client_name: string;
  client_contact: string;
  cswd_office: string;
  lgu_name: string;
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
}

export type GovernmentTransactionInput = Omit<
  GovernmentTransaction,
  'id' | 'reference_number' | 'created_at' | 'updated_at'
>;

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

export const governmentTransactionService = {
  async listTransactions() {
    return sortTransactions(readStoredTransactions());
  },

  async createTransaction(input: GovernmentTransactionInput) {
    const now = new Date().toISOString();
    const transaction: GovernmentTransaction = {
      ...input,
      id: crypto.randomUUID(),
      reference_number: createReferenceNumber(),
      created_at: now,
      updated_at: now
    };

    writeStoredTransactions([transaction, ...readStoredTransactions()]);
    return transaction;
  },

  async updateTransaction(
    id: string,
    input: Partial<GovernmentTransactionInput>
  ) {
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
    writeStoredTransactions(
      readStoredTransactions().filter((transaction) => transaction.id !== id)
    );
  }
};
