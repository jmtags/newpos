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
  Search,
  Trash2
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { useAppContext, type Client, type Service } from '../context/AppContext';
import { clientService } from '../services/clientService';
import {
  governmentTransactionService,
  type GovernmentTransaction,
  type GovernmentTransactionInput,
  type GovernmentTransactionItem,
  type GovernmentMasterRecord,
  type GovernmentSocialWorker,
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
  client_id: '',
  client_name: '',
  client_contact: '',
  cswd_office_id: '',
  cswd_office: '',
  lgu_agency_id: '',
  lgu_name: '',
  social_worker_id: '',
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
  notes: '',
  items: []
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
  const {
    clients,
    services,
    addService,
    updateService,
    refreshData
  } = useAppContext();
  const [transactions, setTransactions] = useState<GovernmentTransaction[]>([]);
  const [cswdOffices, setCswdOffices] = useState<GovernmentMasterRecord[]>([]);
  const [lguAgencies, setLguAgencies] = useState<GovernmentMasterRecord[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<GovernmentSocialWorker[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<GovernmentTransaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<GovernmentTransaction | null>(null);
  const [form, setForm] = useState<GovernmentTransactionInput>(createEmptyForm);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [showClientSearchModal, setShowClientSearchModal] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState<
    'cswd' | 'lgu' | 'worker' | null
  >(null);
  const [editingMasterRecord, setEditingMasterRecord] = useState<any>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [newClient, setNewClient] = useState({
    client_code: '',
    full_name: '',
    birthdate: '',
    age: 0,
    sex: 'Male' as 'Male' | 'Female' | 'Other',
    contact_number: '',
    email: '',
    address: '',
    emergency_contact: '',
    notes: '',
    consent_status: true,
    privacy_acknowledged: true
  });
  const [masterForm, setMasterForm] = useState({
    name: '',
    full_name: '',
    contact_person: '',
    contact_number: '',
    address: '',
    email: '',
    cswd_office_id: '',
    lgu_agency_id: '',
    is_active: true
  });
  const [serviceForm, setServiceForm] = useState({
    name: '',
    category: 'Assessment',
    description: '',
    default_price: 0,
    duration_minutes: 60,
    requires_case_management: false,
    is_active: true
  });

  const activeServices = services.filter((service) => service.is_active);
  const selectedClient = clients.find((client) => client.id === form.client_id);
  const selectedService = activeServices.find(
    (service) => service.id === selectedServiceId
  );
  const formItems = form.items || [];

  const filteredClients = useMemo(() => {
    const search = clientSearchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      if (!search) return true;
      return [
        client.full_name,
        client.client_code,
        client.contact_number,
        client.email
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [clients, clientSearchTerm]);

  const loadTransactions = async () => {
    setTransactions(await governmentTransactionService.listTransactions());
  };

  const loadMasterData = async () => {
    const [cswd, lgu, workers] = await Promise.all([
      governmentTransactionService.listCswdOffices(),
      governmentTransactionService.listLguAgencies(),
      governmentTransactionService.listSocialWorkers()
    ]);

    setCswdOffices(cswd);
    setLguAgencies(lgu);
    setSocialWorkers(workers);
  };

  useEffect(() => {
    loadTransactions();
    loadMasterData();
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

  const selectClient = (client: Client) => {
    setForm((current) => ({
      ...current,
      client_id: client.id,
      client_name: client.full_name,
      client_contact: client.contact_number || ''
    }));
    setShowClientSearchModal(false);
  };

  const handleAddClient = async () => {
    if (!newClient.full_name.trim()) {
      alert('Please enter client full name.');
      return;
    }

    const age = newClient.birthdate
      ? new Date().getFullYear() - new Date(newClient.birthdate).getFullYear()
      : 0;

    const createdClient = await clientService.addClient({ ...newClient, age });
    await refreshData();
    setForm((current) => ({
      ...current,
      client_id: createdClient.id,
      client_name: createdClient.full_name,
      client_contact: createdClient.contact_number || ''
    }));
    setShowAddClientModal(false);
    setNewClient({
      client_code: '',
      full_name: '',
      birthdate: '',
      age: 0,
      sex: 'Male',
      contact_number: '',
      email: '',
      address: '',
      emergency_contact: '',
      notes: '',
      consent_status: true,
      privacy_acknowledged: true
    });
  };

  const updateFormItems = (items: GovernmentTransactionItem[]) => {
    const computedFee = items.reduce(
      (sum, item) => sum + Number(item.line_total || 0),
      0
    );
    setForm((current) => ({
      ...current,
      items,
      computed_fee: computedFee,
      selected_tests: items.map((item) => item.service_name).join(', ')
    }));
  };

  const addSelectedService = () => {
    if (!selectedService) return;

    updateFormItems([
      ...formItems,
      {
        service_id: selectedService.id,
        service_name: selectedService.name,
        quantity: 1,
        unit_price: Number(selectedService.default_price || 0),
        line_total: Number(selectedService.default_price || 0)
      }
    ]);
    setSelectedServiceId('');
  };

  const updateServiceItem = (
    index: number,
    field: keyof GovernmentTransactionItem,
    value: string | number
  ) => {
    const items = [...formItems];
    const current = { ...items[index], [field]: value };
    current.quantity = Number(current.quantity || 1);
    current.unit_price = Number(current.unit_price || 0);
    current.line_total = current.quantity * current.unit_price;
    items[index] = current;
    updateFormItems(items);
  };

  const removeServiceItem = (index: number) => {
    updateFormItems(formItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const openMasterModal = (
    type: 'cswd' | 'lgu' | 'worker',
    record?: any
  ) => {
    setShowMasterModal(type);
    setEditingMasterRecord(record || null);
    setMasterForm({
      name: record?.name || '',
      full_name: record?.full_name || '',
      contact_person: record?.contact_person || '',
      contact_number: record?.contact_number || '',
      address: record?.address || '',
      email: record?.email || '',
      cswd_office_id: record?.cswd_office_id || form.cswd_office_id || '',
      lgu_agency_id: record?.lgu_agency_id || form.lgu_agency_id || '',
      is_active: record?.is_active ?? true
    });
  };

  const saveMasterRecord = async () => {
    if (!showMasterModal) return;

    if (showMasterModal === 'cswd') {
      const saved = await governmentTransactionService.saveCswdOffice({
        id: editingMasterRecord?.id,
        name: masterForm.name,
        contact_person: masterForm.contact_person,
        contact_number: masterForm.contact_number,
        address: masterForm.address,
        is_active: masterForm.is_active
      });
      setForm((current) => ({
        ...current,
        cswd_office_id: saved.id,
        cswd_office: saved.name
      }));
    } else if (showMasterModal === 'lgu') {
      const saved = await governmentTransactionService.saveLguAgency({
        id: editingMasterRecord?.id,
        name: masterForm.name,
        contact_person: masterForm.contact_person,
        contact_number: masterForm.contact_number,
        address: masterForm.address,
        is_active: masterForm.is_active
      });
      setForm((current) => ({
        ...current,
        lgu_agency_id: saved.id,
        lgu_name: saved.name
      }));
    } else {
      const saved = await governmentTransactionService.saveSocialWorker({
        id: editingMasterRecord?.id,
        full_name: masterForm.full_name,
        cswd_office_id: masterForm.cswd_office_id,
        lgu_agency_id: masterForm.lgu_agency_id,
        contact_number: masterForm.contact_number,
        email: masterForm.email,
        is_active: masterForm.is_active
      });
      setForm((current) => ({
        ...current,
        social_worker_id: saved.id,
        social_worker: saved.full_name
      }));
    }

    setShowMasterModal(null);
    setEditingMasterRecord(null);
    await loadMasterData();
  };

  const openServiceModal = (service?: Service) => {
    setEditingService(service || null);
    setServiceForm({
      name: service?.name || '',
      category: service?.category || 'Assessment',
      description: service?.description || '',
      default_price: Number(service?.default_price || 0),
      duration_minutes: Number(service?.duration_minutes || 60),
      requires_case_management: Boolean(service?.requires_case_management),
      is_active: service?.is_active ?? true
    });
    setShowServiceModal(true);
  };

  const saveService = async () => {
    if (!serviceForm.name.trim()) {
      alert('Please enter service name.');
      return;
    }

    if (editingService) {
      await updateService(editingService.id, serviceForm);
    } else {
      await addService(serviceForm);
    }

    setShowServiceModal(false);
  };

  const saveTransaction = async () => {
    if (!form.client_id && !form.client_name.trim()) {
      alert('Please select or add a client.');
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
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Client *
                </label>
                <div className="flex gap-2">
                  <Select
                    aria-label="Select client"
                    value={form.client_id}
                    onChange={(event) => {
                      const client = clients.find(
                        (item) => item.id === event.target.value
                      );
                      if (client) selectClient(client);
                    }}
                    options={[
                      { value: '', label: 'Select client...' },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: client.full_name
                      }))
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="px-3"
                    onClick={() => setShowClientSearchModal(true)}
                    title="Search clients"
                    aria-label="Search clients"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddClientModal(true)}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Client
                </Button>
              </div>
              <Input label="Referral Date" type="date" value={form.referral_date} onChange={(event) => setForm({ ...form, referral_date: event.target.value })} />
              <MasterSelect
                label="CSWD Office"
                value={form.cswd_office_id}
                records={cswdOffices}
                onChange={(id) => {
                  const record = cswdOffices.find((item) => item.id === id);
                  setForm({
                    ...form,
                    cswd_office_id: id,
                    cswd_office: record?.name || ''
                  });
                }}
                onManage={() => openMasterModal('cswd')}
                onEdit={() => {
                  const record = cswdOffices.find(
                    (item) => item.id === form.cswd_office_id
                  );
                  if (record) openMasterModal('cswd', record);
                }}
              />
              <MasterSelect
                label="LGU / Agency"
                value={form.lgu_agency_id}
                records={lguAgencies}
                onChange={(id) => {
                  const record = lguAgencies.find((item) => item.id === id);
                  setForm({
                    ...form,
                    lgu_agency_id: id,
                    lgu_name: record?.name || ''
                  });
                }}
                onManage={() => openMasterModal('lgu')}
                onEdit={() => {
                  const record = lguAgencies.find(
                    (item) => item.id === form.lgu_agency_id
                  );
                  if (record) openMasterModal('lgu', record);
                }}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Social Worker
                </label>
                <div className="flex gap-2">
                  <Select
                    aria-label="Social Worker"
                    value={form.social_worker_id}
                    onChange={(event) => {
                      const worker = socialWorkers.find(
                        (item) => item.id === event.target.value
                      );
                      setForm({
                        ...form,
                        social_worker_id: event.target.value,
                        social_worker: worker?.full_name || ''
                      });
                    }}
                    options={[
                      { value: '', label: 'Select social worker...' },
                      ...socialWorkers
                        .filter((worker) => worker.is_active)
                        .map((worker) => ({
                          value: worker.id,
                          label: worker.full_name
                        }))
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="px-3"
                    onClick={() => openMasterModal('worker')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="px-3"
                    disabled={!form.social_worker_id}
                    onClick={() => {
                      const worker = socialWorkers.find(
                        (item) => item.id === form.social_worker_id
                      );
                      if (worker) openMasterModal('worker', worker);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input label="Referral Letter Reference" value={form.referral_letter_reference} onChange={(event) => setForm({ ...form, referral_letter_reference: event.target.value })} />
              <Select label="Current Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as GovernmentTransactionStatus })} options={statusOptions} />
            </div>

            {(selectedClient || form.client_name) && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <p>
                  <strong>Client:</strong>{' '}
                  {selectedClient?.full_name || form.client_name}
                </p>
                <p>
                  <strong>Contact:</strong>{' '}
                  {selectedClient?.contact_number || form.client_contact || '-'}
                </p>
              </div>
            )}
          </FormSection>

          <FormSection icon={<FileCheck2 className="h-5 w-5 text-blue-600" />} title="Review, Tests, and Costing">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto]">
              <Select
                label="Service"
                value={selectedServiceId}
                onChange={(event) => setSelectedServiceId(event.target.value)}
                options={[
                  { value: '', label: 'Select service...' },
                  ...activeServices.map((service) => ({
                    value: service.id,
                    label: `${service.name} (${formatAmount(service.default_price)})`
                  }))
                ]}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={addSelectedService}
                  disabled={!selectedServiceId}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openServiceModal()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Service
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedService}
                  onClick={() => selectedService && openServiceModal(selectedService)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[680px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm text-slate-600">
                      Service
                    </th>
                    <th className="px-3 py-2 text-right text-sm text-slate-600">
                      Qty
                    </th>
                    <th className="px-3 py-2 text-right text-sm text-slate-600">
                      Price
                    </th>
                    <th className="px-3 py-2 text-right text-sm text-slate-600">
                      Total
                    </th>
                    <th className="px-3 py-2 text-right text-sm text-slate-600">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, index) => (
                    <tr key={`${item.service_id}-${index}`} className="border-t">
                      <td className="px-3 py-2">
                        <Input
                          aria-label="Service name"
                          value={item.service_name}
                          onChange={(event) =>
                            updateServiceItem(
                              index,
                              'service_name',
                              event.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label="Quantity"
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(event) =>
                            updateServiceItem(
                              index,
                              'quantity',
                              parseFloat(event.target.value) || 1
                            )
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label="Unit price"
                          type="number"
                          value={item.unit_price || ''}
                          onChange={(event) =>
                            updateServiceItem(
                              index,
                              'unit_price',
                              parseFloat(event.target.value) || 0
                            )
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-slate-900">
                        {formatAmount(item.line_total)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => removeServiceItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {formItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-slate-500"
                      >
                        No tests or services added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <Modal
        isOpen={showClientSearchModal}
        onClose={() => setShowClientSearchModal(false)}
        title="Select Client"
        size="xl"
      >
        <div className="space-y-4">
          <Input
            label="Search"
            placeholder="Name, client ID, contact, or email"
            value={clientSearchTerm}
            onChange={(event) => setClientSearchTerm(event.target.value)}
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm text-slate-600">
                    Client ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm text-slate-600">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm text-slate-600">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-right text-sm text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {client.client_code || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      {client.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {client.contact_number || client.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => selectClient(client)}>
                        Select
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredClients.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-500">
                No clients found.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        title="Add New Client"
        size="lg"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Full Name"
            value={newClient.full_name}
            onChange={(event) =>
              setNewClient({ ...newClient, full_name: event.target.value })
            }
          />
          <Input
            type="date"
            label="Date of Birth"
            value={newClient.birthdate}
            onChange={(event) =>
              setNewClient({ ...newClient, birthdate: event.target.value })
            }
          />
          <Select
            label="Sex"
            value={newClient.sex}
            onChange={(event) =>
              setNewClient({
                ...newClient,
                sex: event.target.value as 'Male' | 'Female' | 'Other'
              })
            }
            options={[
              { value: 'Male', label: 'Male' },
              { value: 'Female', label: 'Female' },
              { value: 'Other', label: 'Other' }
            ]}
          />
          <Input
            label="Contact Number"
            value={newClient.contact_number}
            onChange={(event) =>
              setNewClient({ ...newClient, contact_number: event.target.value })
            }
          />
          <Input
            label="Email"
            value={newClient.email}
            onChange={(event) =>
              setNewClient({ ...newClient, email: event.target.value })
            }
          />
          <Input
            label="Emergency Contact"
            value={newClient.emergency_contact}
            onChange={(event) =>
              setNewClient({
                ...newClient,
                emergency_contact: event.target.value
              })
            }
          />
          <div className="md:col-span-2">
            <Input
              label="Address"
              value={newClient.address}
              onChange={(event) =>
                setNewClient({ ...newClient, address: event.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <Input
              label="Notes"
              value={newClient.notes}
              onChange={(event) =>
                setNewClient({ ...newClient, notes: event.target.value })
              }
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddClientModal(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddClient}>
              Add Client
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(showMasterModal)}
        onClose={() => setShowMasterModal(null)}
        title={
          showMasterModal === 'worker'
            ? editingMasterRecord
              ? 'Edit Social Worker'
              : 'Add Social Worker'
            : editingMasterRecord
              ? 'Edit Master Record'
              : 'Add Master Record'
        }
        size="lg"
      >
        <div className="space-y-4">
          {showMasterModal === 'worker' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Full Name"
                value={masterForm.full_name}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    full_name: event.target.value
                  })
                }
              />
              <Input
                label="Contact Number"
                value={masterForm.contact_number}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    contact_number: event.target.value
                  })
                }
              />
              <Input
                label="Email"
                value={masterForm.email}
                onChange={(event) =>
                  setMasterForm({ ...masterForm, email: event.target.value })
                }
              />
              <Select
                label="CSWD Office"
                value={masterForm.cswd_office_id}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    cswd_office_id: event.target.value
                  })
                }
                options={[
                  { value: '', label: 'None' },
                  ...cswdOffices.map((office) => ({
                    value: office.id,
                    label: office.name
                  }))
                ]}
              />
              <Select
                label="LGU / Agency"
                value={masterForm.lgu_agency_id}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    lgu_agency_id: event.target.value
                  })
                }
                options={[
                  { value: '', label: 'None' },
                  ...lguAgencies.map((agency) => ({
                    value: agency.id,
                    label: agency.name
                  }))
                ]}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Name"
                value={masterForm.name}
                onChange={(event) =>
                  setMasterForm({ ...masterForm, name: event.target.value })
                }
              />
              <Input
                label="Contact Person"
                value={masterForm.contact_person}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    contact_person: event.target.value
                  })
                }
              />
              <Input
                label="Contact Number"
                value={masterForm.contact_number}
                onChange={(event) =>
                  setMasterForm({
                    ...masterForm,
                    contact_number: event.target.value
                  })
                }
              />
              <Input
                label="Address"
                value={masterForm.address}
                onChange={(event) =>
                  setMasterForm({ ...masterForm, address: event.target.value })
                }
              />
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={masterForm.is_active}
              onChange={(event) =>
                setMasterForm({
                  ...masterForm,
                  is_active: event.target.checked
                })
              }
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMasterModal(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveMasterRecord}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        title={editingService ? 'Edit Service' : 'Add Service'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Service Name"
            value={serviceForm.name}
            onChange={(event) =>
              setServiceForm({ ...serviceForm, name: event.target.value })
            }
          />
          <Select
            label="Category"
            value={serviceForm.category}
            onChange={(event) =>
              setServiceForm({ ...serviceForm, category: event.target.value })
            }
            options={[
              { value: 'Consultation', label: 'Consultation' },
              { value: 'Therapy', label: 'Therapy' },
              { value: 'Assessment', label: 'Assessment' },
              { value: 'Documentation', label: 'Documentation' },
              { value: 'Group', label: 'Group' },
              { value: 'Other', label: 'Other' }
            ]}
          />
          <Input
            label="Description"
            value={serviceForm.description}
            onChange={(event) =>
              setServiceForm({
                ...serviceForm,
                description: event.target.value
              })
            }
          />
          <Input
            label="Default Price"
            type="number"
            value={serviceForm.default_price || ''}
            onChange={(event) =>
              setServiceForm({
                ...serviceForm,
                default_price: parseFloat(event.target.value) || 0
              })
            }
          />
          <Input
            label="Duration (minutes)"
            type="number"
            value={serviceForm.duration_minutes || ''}
            onChange={(event) =>
              setServiceForm({
                ...serviceForm,
                duration_minutes: parseInt(event.target.value) || 60
              })
            }
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={serviceForm.is_active}
              onChange={(event) =>
                setServiceForm({
                  ...serviceForm,
                  is_active: event.target.checked
                })
              }
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>
          <Button type="button" onClick={saveService} className="w-full">
            Save Service
          </Button>
        </div>
      </Modal>
    </div>
  );
};

const MasterSelect: React.FC<{
  label: string;
  value: string;
  records: GovernmentMasterRecord[];
  onChange: (id: string) => void;
  onManage: () => void;
  onEdit: () => void;
}> = ({ label, value, records, onChange, onManage, onEdit }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-slate-700">
      {label}
    </label>
    <div className="flex gap-2">
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[
          { value: '', label: `Select ${label.toLowerCase()}...` },
          ...records
            .filter((record) => record.is_active)
            .map((record) => ({
              value: record.id,
              label: record.name
            }))
        ]}
      />
      <Button
        type="button"
        variant="outline"
        className="px-3"
        onClick={onManage}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        className="px-3"
        disabled={!value}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

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

        {Boolean(transaction.items?.length) && (
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              Selected Services
            </div>
            <div className="divide-y divide-slate-100">
              {transaction.items?.map((item, index) => (
                <div
                  key={`${item.service_id}-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.service_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} x {formatAmount(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-medium text-slate-900">
                    {formatAmount(item.line_total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

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
