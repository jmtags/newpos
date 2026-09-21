import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Trash2
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { useAppContext } from '../context/AppContext';
import {
  governmentTransactionService,
  type GovernmentTransaction,
  type GovernmentTransactionInput,
  type GovernmentTransactionStatus
} from '../services/governmentTransactionService';

const statusDefinitions: {
  id: GovernmentTransactionStatus;
  label: string;
  description: string;
}[] = [
  { id: 'referral_received', label: 'Referral Received', description: 'Referral letter from CSWD/LGU is encoded.' },
  { id: 'for_review', label: 'For Review', description: 'Clinic reviews requested service and client details.' },
  { id: 'costing_prepared', label: 'Costing Prepared', description: 'Tests, fee computation, and endorsement are ready.' },
  { id: 'guarantee_letter_received', label: 'Guarantee Letter', description: 'LGU guarantee letter details are recorded.' },
  { id: 'scheduled', label: 'Scheduled', description: 'Client has an appointment or test schedule.' },
  { id: 'service_completed', label: 'Service Completed', description: 'Tests or clinic service were completed.' },
  { id: 'soa_submitted', label: 'SOA Submitted', description: 'Statement of Account has been sent to LGU.' },
  { id: 'awaiting_cheque', label: 'Awaiting Cheque', description: 'Payment is being processed by LGU.' },
  { id: 'payment_completed', label: 'Payment Completed', description: 'Cheque/payment is posted and GL is closed.' }
];

const statusOptions = statusDefinitions.map((status) => ({
  value: status.id,
  label: status.label
}));

const createEmptyForm = (): GovernmentTransactionInput => ({
  status: 'referral_received',
  client_name: '',
  client_contact: '',
  cswd_office: '',
  lgu_name: '',
  social_worker: '',
  referral_date: new Date().toISOString().slice(0, 10),
  referral_letter_reference: '',
  selected_tests: '',
  computed_fee: 0,
  approved_amount: 0,
  endorsement_number: '',
  guarantee_letter_number: '',
  guarantee_letter_date: '',
  guarantee_valid_until: '',
  schedule_date: '',
  service_completed_date: '',
  soa_number: '',
  soa_submitted_date: '',
  cheque_number: '',
  cheque_released_date: '',
  payment_amount: 0,
  notes: ''
});

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
});

const formatAmount = (amount: number) => currency.format(amount || 0);

const getStatusLabel = (status: GovernmentTransactionStatus) =>
  statusDefinitions.find((item) => item.id === status)?.label || status;

const getStatusIndex = (status: GovernmentTransactionStatus) =>
  statusDefinitions.findIndex((item) => item.id === status);

const getNextStatus = (status: GovernmentTransactionStatus) => {
  const currentIndex = getStatusIndex(status);
  return statusDefinitions[currentIndex + 1]?.id;
};

const getBadgeVariant = (status: GovernmentTransactionStatus) => {
  if (status === 'payment_completed') return 'success';
  if (['soa_submitted', 'awaiting_cheque'].includes(status)) return 'warning';
  if (['guarantee_letter_received', 'scheduled', 'service_completed'].includes(status)) return 'info';
  return 'default';
};

export const GovernmentTransactions: React.FC = () => {
  const { services } = useAppContext();
  const [transactions, setTransactions] = useState<GovernmentTransaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<GovernmentTransaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<GovernmentTransaction | null>(null);
  const [form, setForm] = useState<GovernmentTransactionInput>(createEmptyForm);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const activeServices = services.filter((service) => service.is_active);

  const loadTransactions = async () => {
    setTransactions(await governmentTransactionService.listTransactions());
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesStatus =
        statusFilter === 'all' || transaction.status === statusFilter;
      const searchable = [
        transaction.reference_number,
        transaction.client_name,
        transaction.lgu_name,
        transaction.cswd_office,
        transaction.guarantee_letter_number,
        transaction.soa_number
      ]
        .join(' ')
        .toLowerCase();

      return matchesStatus && searchable.includes(normalizedQuery);
    });
  }, [query, statusFilter, transactions]);

  const metrics = useMemo(() => {
    const billedItems = transactions.filter((transaction) =>
      ['soa_submitted', 'awaiting_cheque', 'payment_completed'].includes(
        transaction.status
      )
    );
    const totalReceivable = transactions.reduce(
      (sum, transaction) =>
        sum +
        Math.max(
          (transaction.approved_amount || 0) - (transaction.payment_amount || 0),
          0
        ),
      0
    );

    return {
      open: transactions.filter(
        (transaction) => transaction.status !== 'payment_completed'
      ).length,
      waitingForGl: transactions.filter(
        (transaction) =>
          ![
            'guarantee_letter_received',
            'scheduled',
            'service_completed',
            'soa_submitted',
            'awaiting_cheque',
            'payment_completed'
          ].includes(transaction.status)
      ).length,
      billed: billedItems.length,
      totalReceivable
    };
  }, [transactions]);

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingTransaction(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setForm(createEmptyForm());
    setEditingTransaction(null);
    setShowForm(true);
  };

  const openEditForm = (transaction: GovernmentTransaction) => {
    const { id, reference_number, created_at, updated_at, ...editable } =
      transaction;
    setForm(editable);
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const saveTransaction = async () => {
    if (!form.client_name.trim()) {
      alert('Please enter the client name.');
      return;
    }

    if (!form.lgu_name.trim() && !form.cswd_office.trim()) {
      alert('Please enter the CSWD office or LGU name.');
      return;
    }

    try {
      setSaving(true);

      if (editingTransaction) {
        const updated = await governmentTransactionService.updateTransaction(
          editingTransaction.id,
          form
        );
        setSelectedTransaction(updated);
      } else {
        const created = await governmentTransactionService.createTransaction(form);
        setSelectedTransaction(created);
      }

      resetForm();
      await loadTransactions();
    } catch (error: any) {
      alert(`Error saving government transaction: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (transaction: GovernmentTransaction) => {
    const nextStatus = getNextStatus(transaction.status);
    if (!nextStatus) return;

    const updated = await governmentTransactionService.updateTransaction(
      transaction.id,
      { status: nextStatus }
    );
    setSelectedTransaction(updated);
    await loadTransactions();
  };

  const deleteTransaction = async (transaction: GovernmentTransaction) => {
    if (!window.confirm(`Delete ${transaction.reference_number}?`)) return;
    await governmentTransactionService.deleteTransaction(transaction.id);
    if (selectedTransaction?.id === transaction.id) {
      setSelectedTransaction(null);
    }
    await loadTransactions();
  };

  const addServiceToTests = (serviceName: string) => {
    if (!serviceName) return;

    setForm((current) => ({
      ...current,
      selected_tests: current.selected_tests
        ? `${current.selected_tests}, ${serviceName}`
        : serviceName
    }));
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Government Transaction Mode
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track CSWD referrals, LGU guarantee letters, schedules, SOA billing,
            cheque release, and closure in one dedicated workflow.
          </p>
        </div>

        <Button onClick={openCreateForm}>
          <Plus className="mr-2 h-4 w-4" />
          New Government Transaction
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open GL Files" value={metrics.open} icon="landmark" />
        <MetricCard label="Waiting for GL" value={metrics.waitingForGl} icon="file" />
        <MetricCard label="SOA/Billed Files" value={metrics.billed} icon="receipt" />
        <MetricCard
          label="Open Receivable"
          value={formatAmount(metrics.totalReceivable)}
          icon="money"
        />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_240px]">
          <Input
            aria-label="Search government transactions"
            placeholder="Search client, LGU, CSWD, GL number, SOA number..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <TransactionTable
          transactions={filteredTransactions}
          selectedId={selectedTransaction?.id}
          onSelect={setSelectedTransaction}
          onEdit={openEditForm}
          onDelete={deleteTransaction}
        />

        <TransactionDetails
          transaction={selectedTransaction}
          onEdit={openEditForm}
          onAdvance={advanceStatus}
        />
      </div>

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={
          editingTransaction
            ? 'Edit Government Transaction'
            : 'New Government Transaction'
        }
        size="xl"
      >
        <div className="space-y-6">
          <FormSection icon={<FileText className="h-5 w-5 text-teal-600" />} title="Referral Intake">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Client Name *" value={form.client_name} onChange={(event) => setForm({ ...form, client_name: event.target.value })} />
              <Input label="Contact Number" value={form.client_contact} onChange={(event) => setForm({ ...form, client_contact: event.target.value })} />
              <Input label="Referral Date" type="date" value={form.referral_date} onChange={(event) => setForm({ ...form, referral_date: event.target.value })} />
              <Input label="CSWD Office" value={form.cswd_office} onChange={(event) => setForm({ ...form, cswd_office: event.target.value })} />
              <Input label="LGU / Agency" value={form.lgu_name} onChange={(event) => setForm({ ...form, lgu_name: event.target.value })} />
              <Input label="Social Worker" value={form.social_worker} onChange={(event) => setForm({ ...form, social_worker: event.target.value })} />
              <Input label="Referral Letter Reference" value={form.referral_letter_reference} onChange={(event) => setForm({ ...form, referral_letter_reference: event.target.value })} />
              <Select label="Current Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as GovernmentTransactionStatus })} options={statusOptions} />
            </div>
          </FormSection>

          <FormSection icon={<FileCheck2 className="h-5 w-5 text-blue-600" />} title="Review, Tests, and Costing">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input label="Selected Tests / Services" value={form.selected_tests} onChange={(event) => setForm({ ...form, selected_tests: event.target.value })} />
              </div>
              <Select
                label="Add Existing Service"
                value=""
                onChange={(event) => addServiceToTests(event.target.value)}
                options={[
                  { value: '', label: 'Select service...' },
                  ...activeServices.map((service) => ({
                    value: service.name,
                    label: `${service.name} (${formatAmount(service.default_price)})`
                  }))
                ]}
              />
              <Input label="Computed Fee" type="number" value={form.computed_fee || ''} onChange={(event) => setForm({ ...form, computed_fee: parseFloat(event.target.value) || 0 })} />
              <Input label="Endorsement Number" value={form.endorsement_number} onChange={(event) => setForm({ ...form, endorsement_number: event.target.value })} />
            </div>
          </FormSection>

          <FormSection icon={<Landmark className="h-5 w-5 text-emerald-600" />} title="Guarantee Letter and Scheduling">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Guarantee Letter Number" value={form.guarantee_letter_number} onChange={(event) => setForm({ ...form, guarantee_letter_number: event.target.value })} />
              <Input label="GL Date" type="date" value={form.guarantee_letter_date} onChange={(event) => setForm({ ...form, guarantee_letter_date: event.target.value })} />
              <Input label="Valid Until" type="date" value={form.guarantee_valid_until} onChange={(event) => setForm({ ...form, guarantee_valid_until: event.target.value })} />
              <Input label="Approved Amount" type="number" value={form.approved_amount || ''} onChange={(event) => setForm({ ...form, approved_amount: parseFloat(event.target.value) || 0 })} />
              <Input label="Schedule Date" type="date" value={form.schedule_date} onChange={(event) => setForm({ ...form, schedule_date: event.target.value })} />
              <Input label="Service Completed Date" type="date" value={form.service_completed_date} onChange={(event) => setForm({ ...form, service_completed_date: event.target.value })} />
            </div>
          </FormSection>

          <FormSection icon={<CalendarDays className="h-5 w-5 text-violet-600" />} title="SOA and Cheque Collection">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="SOA Number" value={form.soa_number} onChange={(event) => setForm({ ...form, soa_number: event.target.value })} />
              <Input label="SOA Submitted Date" type="date" value={form.soa_submitted_date} onChange={(event) => setForm({ ...form, soa_submitted_date: event.target.value })} />
              <Input label="Cheque Number" value={form.cheque_number} onChange={(event) => setForm({ ...form, cheque_number: event.target.value })} />
              <Input label="Cheque Released Date" type="date" value={form.cheque_released_date} onChange={(event) => setForm({ ...form, cheque_released_date: event.target.value })} />
              <Input label="Payment Amount" type="number" value={form.payment_amount || ''} onChange={(event) => setForm({ ...form, payment_amount: parseFloat(event.target.value) || 0 })} />
              <Input label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
          </FormSection>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={saveTransaction} disabled={saving}>
              {saving ? 'Saving...' : editingTransaction ? 'Update File' : 'Create File'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  icon: 'landmark' | 'file' | 'receipt' | 'money';
}> = ({ label, value, icon }) => {
  const icons = {
    landmark: <Landmark className="h-8 w-8 text-teal-600" />,
    file: <FileText className="h-8 w-8 text-amber-600" />,
    receipt: <ReceiptText className="h-8 w-8 text-blue-600" />,
    money: <Banknote className="h-8 w-8 text-emerald-600" />
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        {icons[icon]}
      </div>
    </Card>
  );
};

const TransactionTable: React.FC<{
  transactions: GovernmentTransaction[];
  selectedId?: string;
  onSelect: (transaction: GovernmentTransaction) => void;
  onEdit: (transaction: GovernmentTransaction) => void;
  onDelete: (transaction: GovernmentTransaction) => void;
}> = ({ transactions, selectedId, onSelect, onEdit, onDelete }) => (
  <Card>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px]">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-sm text-slate-600">File</th>
            <th className="px-4 py-3 text-left text-sm text-slate-600">Agency</th>
            <th className="px-4 py-3 text-left text-sm text-slate-600">Status</th>
            <th className="px-4 py-3 text-right text-sm text-slate-600">Approved</th>
            <th className="px-4 py-3 text-right text-sm text-slate-600">Balance</th>
            <th className="px-4 py-3 text-right text-sm text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const balance = Math.max(
              (transaction.approved_amount || 0) - (transaction.payment_amount || 0),
              0
            );

            return (
              <tr
                key={transaction.id}
                className={`border-b border-slate-100 ${selectedId === transaction.id ? 'bg-teal-50/60' : ''}`}
              >
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(transaction)} className="text-left">
                    <p className="font-medium text-slate-900">{transaction.client_name}</p>
                    <p className="text-xs text-slate-500">{transaction.reference_number}</p>
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <p>{transaction.lgu_name || '-'}</p>
                  <p className="text-xs text-slate-500">{transaction.cswd_office || '-'}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={getBadgeVariant(transaction.status)}>
                    {getStatusLabel(transaction.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-sm text-slate-700">
                  {formatAmount(transaction.approved_amount)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                  {formatAmount(balance)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => onEdit(transaction)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => onDelete(transaction)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}

          {transactions.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                No government transactions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

const TransactionDetails: React.FC<{
  transaction: GovernmentTransaction | null;
  onEdit: (transaction: GovernmentTransaction) => void;
  onAdvance: (transaction: GovernmentTransaction) => void;
}> = ({ transaction, onEdit, onAdvance }) => (
  <Card className="p-5">
    {transaction ? (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Active File
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">
              {transaction.client_name}
            </h3>
            <p className="text-sm text-slate-500">{transaction.reference_number}</p>
          </div>
          <Badge variant={getBadgeVariant(transaction.status)}>
            {getStatusLabel(transaction.status)}
          </Badge>
        </div>

        <div className="space-y-3">
          {statusDefinitions.map((status, index) => {
            const currentIndex = getStatusIndex(transaction.status);
            const isDone = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={status.id} className="flex gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    isDone
                      ? 'bg-teal-600 text-white'
                      : isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{status.label}</p>
                  <p className="text-xs text-slate-500">{status.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
          <DetailItem label="LGU" value={transaction.lgu_name} />
          <DetailItem label="CSWD" value={transaction.cswd_office} />
          <DetailItem label="GL Number" value={transaction.guarantee_letter_number} />
          <DetailItem label="SOA Number" value={transaction.soa_number} />
          <DetailItem label="Approved" value={formatAmount(transaction.approved_amount)} />
          <DetailItem label="Paid" value={formatAmount(transaction.payment_amount)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onEdit(transaction)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit File
          </Button>
          {getNextStatus(transaction.status) && (
            <Button onClick={() => onAdvance(transaction)}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Move to {getStatusLabel(getNextStatus(transaction.status)!)}
            </Button>
          )}
        </div>
      </div>
    ) : (
      <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
        <ClipboardList className="h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-lg font-semibold text-slate-900">
          Select a government file
        </h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Choose a row to view the referral-to-payment workflow and advance its
          status.
        </p>
      </div>
    )}
  </Card>
);

const DetailItem: React.FC<{ label: string; value: string }> = ({
  label,
  value
}) => (
  <div>
    <p className="text-slate-500">{label}</p>
    <p className="font-medium text-slate-900">{value || '-'}</p>
  </div>
);

const FormSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <section>
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h3 className="font-semibold text-slate-900">{title}</h3>
    </div>
    {children}
  </section>
);
