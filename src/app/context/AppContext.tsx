import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode
} from 'react';

import { clientService } from '../services/clientService';
import { serviceService } from '../services/serviceService';
import { transactionService } from '../services/transactionService';
import { paymentService } from '../services/paymentService';

// =============================
// TYPES
// =============================

export interface Client {
  id: string;
  client_code: string;
  full_name: string;
  birthdate: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  contact_number: string;
  email: string;
  address: string;
  emergency_contact: string;
  notes: string;
  consent_status: boolean;
  privacy_acknowledged: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string;
  default_price: number;
  duration_minutes: number;
  requires_case_management: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  associate_id?: string | null;
  associate_name?: string | null;
  referral_id?: string | null;
  referral_name?: string | null;
  appointment_schedule?: {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    appointment_type: string;
    status: string;
    room_name?: string;
  } | null;
}

export interface Payment {
  id: string;
  transaction_id: string;
  payment_method: string;
  amount: number;
  reference_number: string;
  payment_date: string;
  received_by: string;
  notes: string;
  created_at: string;
}

export type PaymentStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' | 'Void';

export interface Transaction {
  id: string;
  transaction_number: string;
  client_id: string;
  client_name?: string;
  transaction_date: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tax_rate: number;
  tax_type: 'VAT' | 'NON_VAT' | 'NONE';
  grand_total: number;
  total_amount: number;
  total_paid: number;
  balance: number;
  payment_status: PaymentStatus;
  notes: string;
  created_by: string;
  is_void?: boolean;
  void_reason?: string;
  created_at: string;
  updated_at: string;
  items: TransactionItem[];
  payments: Payment[];
}

interface AppContextType {
  clients: Client[];
  services: Service[];
  transactions: Transaction[];
  loading: boolean;
  error: string | null;

  refreshData: () => Promise<void>;

  addClient: (client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;

  addService: (service: Omit<Service, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateService: (id: string, service: Partial<Service>) => Promise<void>;
  archiveService: (id: string) => Promise<void>;

  addTransaction: (
    transaction: Omit<
      Transaction,
      'id' | 'transaction_number' | 'created_at' | 'updated_at'
    >
  ) => Promise<any>;

  updateTransaction: (id: string, transaction: Partial<Transaction>) => Promise<void>;
  voidTransaction: (id: string, reason: string) => Promise<void>;

  addPayment: (
    transactionId: string,
    payment: Omit<Payment, 'id' | 'transaction_id' | 'created_at'>
  ) => Promise<any>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// =============================
// PROVIDER
// =============================

export const AppProvider: React.FC<{
  children: ReactNode;
  shouldLoadData?: boolean;
}> = ({ children, shouldLoadData = true }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // =============================
  // REFRESH ALL DATA
  // =============================

  const refreshData = async () => {
    if (!shouldLoadData) {
      setClients([]);
      setServices([]);
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [clientsData, servicesData, transactionsData] = await Promise.all([
        clientService.getClients(),
        serviceService.getServices(),
        transactionService.getTransactions()
      ]);

      setClients(clientsData as Client[]);
      setServices(servicesData as Service[]);
      setTransactions(transactionsData as Transaction[]);
    } catch (err: any) {
      console.error('Error loading app data:', err);
      setError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [shouldLoadData]);

  // =============================
  // CLIENT ACTIONS
  // =============================

  const addClient = async (
    clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      await clientService.addClient(clientData);
      await refreshData();
    } catch (err: any) {
      console.error('Error adding client:', err);
      alert(`Error adding client: ${err.message}`);
    }
  };

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      await clientService.updateClient(id, clientData);
      await refreshData();
    } catch (err: any) {
      console.error('Error updating client:', err);
      alert(`Error updating client: ${err.message}`);
    }
  };

  // =============================
  // SERVICE ACTIONS
  // =============================

  const addService = async (
    serviceData: Omit<Service, 'id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      await serviceService.addService(serviceData);
      await refreshData();
    } catch (err: any) {
      console.error('Error adding service:', err);
      alert(`Error adding service: ${err.message}`);
    }
  };

  const updateService = async (id: string, serviceData: Partial<Service>) => {
    try {
      await serviceService.updateService(id, serviceData);
      await refreshData();
    } catch (err: any) {
      console.error('Error updating service:', err);
      alert(`Error updating service: ${err.message}`);
    }
  };

  const archiveService = async (id: string) => {
    try {
      await serviceService.archiveService(id);
      await refreshData();
    } catch (err: any) {
      console.error('Error archiving service:', err);
      alert(`Error archiving service: ${err.message}`);
    }
  };

  // =============================
  // TRANSACTION ACTIONS
  // =============================

  const addTransaction = async (
    transactionData: Omit<
      Transaction,
      'id' | 'transaction_number' | 'created_at' | 'updated_at'
    >
  ) => {
    try {
      const transaction = await transactionService.addTransaction(transactionData);
      await refreshData();
      return transaction;
    } catch (err: any) {
      console.error('Error saving transaction:', err);
      throw err;
    }
  };

  const updateTransaction = async (
    id: string,
    transactionData: Partial<Transaction>
  ) => {
    try {
      await transactionService.updateTransaction(id, transactionData);
      await refreshData();
    } catch (err: any) {
      console.error('Error updating transaction:', err);
      alert(`Error updating transaction: ${err.message}`);
    }
  };

  const voidTransaction = async (id: string, reason: string) => {
    try {
      await transactionService.voidTransaction(id, reason);
      await refreshData();
    } catch (err: any) {
      console.error('Error voiding transaction:', err);
      alert(`Error voiding transaction: ${err.message}`);
    }
  };

  // =============================
  // PAYMENT ACTIONS
  // =============================

  const addPayment = async (
    transactionId: string,
    paymentData: Omit<Payment, 'id' | 'transaction_id' | 'created_at'>
  ) => {
    try {
      const payment = await paymentService.addPayment(transactionId, paymentData);
      await refreshData();
      return payment;
    } catch (err: any) {
      console.error('Error adding payment:', err);
      throw err;
    }
  };

  // =============================
  // CONTEXT VALUE
  // =============================

  return (
    <AppContext.Provider
      value={{
        clients,
        services,
        transactions,
        loading,
        error,
        refreshData,

        addClient,
        updateClient,

        addService,
        updateService,
        archiveService,

        addTransaction,
        updateTransaction,
        voidTransaction,

        addPayment
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// =============================
// HOOK
// =============================

export const useAppContext = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }

  return context;
};
