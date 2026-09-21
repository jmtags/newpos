import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileSignature,
  FileCheck2,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings as SettingsIcon,
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
  settingsService,
  type ClinicSettings
} from '../services/settingsService';
import {
  governmentTransactionService,
  type GovernmentTransaction,
  type GovernmentDocumentSettings,
  type GovernmentDocumentSettingsInput,
  type GovernmentTransactionInput,
  type GovernmentTransactionItem,
  type GovernmentMasterRecord,
  type GovernmentSoaBatch,
  type GovernmentSoaBatchSettingsInput,
  type GovernmentSupportDocument,
  type GovernmentSupportDocumentType,
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
  { id: 'endorsement_ready', label: 'Endorsement Ready', description: 'Endorsement letter and costing statement are ready for LGU review.' },
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

const createDefaultDocumentSettings = (): GovernmentDocumentSettingsInput => ({
  header_line_1: '',
  header_line_2: '',
  header_line_3: '',
  default_recipient_name: '',
  default_recipient_title: '',
  endorsement_signatory_name: 'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  endorsement_signatory_title: 'Psychologist, Service Provider',
  endorsement_signatory_role: 'Psyzygy Psychological Center, Inc.',
  prepared_by_name: 'Aprilyne D. Fabros, RPm',
  prepared_by_title: 'Case Manager',
  noted_by_name: 'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  noted_by_title: 'Psychologist, Service Provider',
  endorsement_body:
    'We respectfully endorse the client/beneficiary for psychological services based on the reviewed referral and the selected clinic services. The clinic will provide the necessary services with confidentiality, professionalism, and ethical care.',
  costing_footer:
    'Prepared for government guarantee letter processing and billing documentation.'
});

const createDefaultSoaBatchSettings = (): GovernmentSoaBatchSettingsInput => ({
  default_prepared_by_name: 'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  default_prepared_by_title: 'Director & Psychologist, Service Provider',
  default_received_by_label: 'SIGNATURE OVER PRINTED/NAME/DATE'
});

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
});

const formatAmount = (amount: number) => currency.format(amount || 0);

const formatDate = (dateValue?: string) => {
  if (!dateValue) return new Date().toLocaleDateString();
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString();
};

const toInputDate = (dateValue?: string | null) => dateValue || '';

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
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [documentSettingsId, setDocumentSettingsId] = useState('');
  const [documentSettings, setDocumentSettings] =
    useState<GovernmentDocumentSettingsInput>(createDefaultDocumentSettings);
  const [soaBatchSettingsId, setSoaBatchSettingsId] = useState('');
  const [soaBatchSettings, setSoaBatchSettings] =
    useState<GovernmentSoaBatchSettingsInput>(createDefaultSoaBatchSettings);
  const [soaBatches, setSoaBatches] = useState<GovernmentSoaBatch[]>([]);
  const [soaBatchFilter, setSoaBatchFilter] = useState({
    batch_name: '',
    lgu_agency_id: '',
    date_from: '',
    date_to: ''
  });
  const [selectedSoaTransactionIds, setSelectedSoaTransactionIds] = useState<string[]>([]);
  const [showSoaBatchSettingsModal, setShowSoaBatchSettingsModal] = useState(false);
  const [showSoaBatchPreview, setShowSoaBatchPreview] = useState(false);
  const [soaBatchPreviewRows, setSoaBatchPreviewRows] = useState<GovernmentTransaction[]>([]);
  const [soaBatchPreviewName, setSoaBatchPreviewName] = useState('Statement of Accounts');
  const [soaBatchPreviewSettings, setSoaBatchPreviewSettings] =
    useState<GovernmentSoaBatchSettingsInput>(createDefaultSoaBatchSettings);
  const [editingSoaBatch, setEditingSoaBatch] = useState<GovernmentSoaBatch | null>(null);
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
  const [showDocumentSettingsModal, setShowDocumentSettingsModal] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [documentPreviewTransaction, setDocumentPreviewTransaction] =
    useState<GovernmentTransaction | null>(null);
  const [supportDocuments, setSupportDocuments] =
    useState<GovernmentSupportDocument[]>([]);
  const [uploadingDocumentType, setUploadingDocumentType] =
    useState<GovernmentSupportDocumentType | null>(null);
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
    const [
      cswd,
      lgu,
      workers,
      clinic,
      documentSettingsData,
      soaBatchSettingsData,
      soaBatchData
    ] = await Promise.all([
      governmentTransactionService.listCswdOffices(),
      governmentTransactionService.listLguAgencies(),
      governmentTransactionService.listSocialWorkers(),
      settingsService.getClinicSettings(),
      governmentTransactionService.getDocumentSettings(),
      governmentTransactionService.getSoaBatchSettings(),
      governmentTransactionService.listSoaBatches()
    ]);

    setCswdOffices(cswd);
    setLguAgencies(lgu);
    setSocialWorkers(workers);
    setClinicSettings(clinic);

    if (documentSettingsData) {
      const {
        id,
        created_at,
        updated_at,
        ...settings
      } = documentSettingsData;
      setDocumentSettingsId(id);
      setDocumentSettings(settings);
    } else {
      setDocumentSettingsId('');
      setDocumentSettings(createDefaultDocumentSettings());
    }

    if (soaBatchSettingsData) {
      const { id, created_at, updated_at, ...settings } = soaBatchSettingsData;
      setSoaBatchSettingsId(id);
      setSoaBatchSettings(settings);
    } else {
      setSoaBatchSettingsId('');
      setSoaBatchSettings(createDefaultSoaBatchSettings());
    }

    setSoaBatches(soaBatchData);
  };

  const loadSupportDocuments = async (transactionId?: string) => {
    if (!transactionId) {
      setSupportDocuments([]);
      return;
    }

    setSupportDocuments(
      await governmentTransactionService.listSupportDocuments(transactionId)
    );
  };

  useEffect(() => {
    loadTransactions();
    loadMasterData();
  }, []);

  useEffect(() => {
    loadSupportDocuments(editingTransaction?.id);
  }, [editingTransaction?.id]);

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

  const soaBatchCandidates = useMemo(() => {
    const assignedTransactionIds = new Set(
      soaBatches
        .filter((batch) => batch.id !== editingSoaBatch?.id)
        .flatMap((batch) => batch.transaction_ids || [])
    );

    return transactions.filter((transaction) => {
      if (assignedTransactionIds.has(transaction.id)) return false;

      const statusAllowed = [
        'service_completed',
        'soa_submitted',
        'awaiting_cheque',
        'payment_completed'
      ].includes(transaction.status);
      if (!statusAllowed) return false;

      if (
        soaBatchFilter.lgu_agency_id &&
        transaction.lgu_agency_id !== soaBatchFilter.lgu_agency_id
      ) {
        return false;
      }

      const comparisonDate =
        transaction.service_completed_date ||
        transaction.schedule_date ||
        transaction.referral_date;

      if (soaBatchFilter.date_from && comparisonDate < soaBatchFilter.date_from) {
        return false;
      }

      if (soaBatchFilter.date_to && comparisonDate > soaBatchFilter.date_to) {
        return false;
      }

      return true;
    });
  }, [editingSoaBatch?.id, soaBatchFilter, soaBatches, transactions]);

  const selectedSoaTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        selectedSoaTransactionIds.includes(transaction.id)
      ),
    [selectedSoaTransactionIds, transactions]
  );

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

  const saveDocumentSettings = async () => {
    try {
      const saved = await governmentTransactionService.saveDocumentSettings(
        documentSettingsId || undefined,
        documentSettings
      );
      const { id, created_at, updated_at, ...settings } = saved;
      setDocumentSettingsId(id);
      setDocumentSettings(settings);
      setShowDocumentSettingsModal(false);
      alert('Government document settings saved successfully.');
    } catch (error: any) {
      alert(`Error saving document settings: ${error.message}`);
    }
  };

  const saveSoaBatchSettings = async () => {
    try {
      const saved = await governmentTransactionService.saveSoaBatchSettings(
        soaBatchSettingsId || undefined,
        soaBatchSettings
      );
      const { id, created_at, updated_at, ...settings } = saved;
      setSoaBatchSettingsId(id);
      setSoaBatchSettings(settings);
      setShowSoaBatchSettingsModal(false);
      alert('SOA batch settings saved successfully.');
    } catch (error: any) {
      alert(`Error saving SOA batch settings: ${error.message}`);
    }
  };

  const toggleSoaTransaction = (transactionId: string) => {
    setSelectedSoaTransactionIds((current) =>
      current.includes(transactionId)
        ? current.filter((id) => id !== transactionId)
        : [...current, transactionId]
    );
  };

  const selectAllSoaCandidates = () => {
    setSelectedSoaTransactionIds(soaBatchCandidates.map((item) => item.id));
  };

  const clearSoaSelection = () => {
    setSelectedSoaTransactionIds([]);
    setEditingSoaBatch(null);
  };

  const getTransactionsForSoaBatch = (batch: GovernmentSoaBatch) => {
    const transactionMap = new Map(
      transactions.map((transaction) => [transaction.id, transaction])
    );

    return (batch.transaction_ids || [])
      .map((transactionId) => transactionMap.get(transactionId))
      .filter(Boolean) as GovernmentTransaction[];
  };

  const getSoaBatchSettingsForPreview = (
    batch: GovernmentSoaBatch
  ): GovernmentSoaBatchSettingsInput => ({
    default_prepared_by_name: batch.prepared_by_name || '',
    default_prepared_by_title: batch.prepared_by_title || '',
    default_received_by_label: batch.received_by_label || ''
  });

  const previewSoaBatch = () => {
    if (selectedSoaTransactions.length === 0) {
      alert('Please select at least one government transaction.');
      return;
    }

    setSoaBatchPreviewRows(selectedSoaTransactions);
    setSoaBatchPreviewName(soaBatchFilter.batch_name || 'Statement of Accounts');
    setSoaBatchPreviewSettings(soaBatchSettings);
    setShowSoaBatchPreview(true);
  };

  const previewSavedSoaBatch = (batch: GovernmentSoaBatch) => {
    const batchRows = getTransactionsForSoaBatch(batch);

    if (batchRows.length === 0) {
      alert('The transactions linked to this batch are no longer available.');
      return;
    }

    setSoaBatchPreviewRows(batchRows);
    setSoaBatchPreviewName(batch.batch_name || 'Statement of Accounts');
    setSoaBatchPreviewSettings(getSoaBatchSettingsForPreview(batch));
    setShowSoaBatchPreview(true);
  };

  const editSavedSoaBatch = (batch: GovernmentSoaBatch) => {
    setEditingSoaBatch(batch);
    setSoaBatchFilter({
      batch_name: batch.batch_name || '',
      lgu_agency_id: batch.lgu_agency_id || '',
      date_from: batch.date_from || '',
      date_to: batch.date_to || ''
    });
    setSelectedSoaTransactionIds(batch.transaction_ids || []);
  };

  const deleteSavedSoaBatch = async (batch: GovernmentSoaBatch) => {
    const confirmed = window.confirm(
      `Delete SOA batch "${batch.batch_name}"? The transactions will become eligible for a new batch again.`
    );

    if (!confirmed) return;

    try {
      await governmentTransactionService.deleteSoaBatch(batch.id);
      if (editingSoaBatch?.id === batch.id) {
        setEditingSoaBatch(null);
        setSelectedSoaTransactionIds([]);
      }
      await loadMasterData();
      alert('SOA batch deleted successfully.');
    } catch (error: any) {
      alert(`Error deleting SOA batch: ${error.message}`);
    }
  };

  const saveSoaBatch = async () => {
    if (selectedSoaTransactions.length === 0) {
      alert('Please select at least one government transaction.');
      return;
    }

    const selectedIds = selectedSoaTransactions.map((transaction) => transaction.id);
    const duplicateBatch = soaBatches.find((batch) =>
      batch.id !== editingSoaBatch?.id
      && (batch.transaction_ids || []).some((transactionId) =>
        selectedIds.includes(transactionId)
      )
    );

    if (duplicateBatch) {
      alert(
        `One or more selected transactions already belong to SOA batch "${duplicateBatch.batch_name}". Please clear them before saving.`
      );
      return;
    }

    const totalAmount = selectedSoaTransactions.reduce(
      (sum, transaction) =>
        sum + Number(transaction.computed_fee || transaction.approved_amount || 0),
      0
    );
    const agency = lguAgencies.find(
      (item) => item.id === soaBatchFilter.lgu_agency_id
    );
    const fallbackBatchName = `${new Date().toLocaleDateString()} SOA Batch`;

    const batchInput = {
      batch_name: soaBatchFilter.batch_name || fallbackBatchName,
      lgu_agency_id: soaBatchFilter.lgu_agency_id || null,
      lgu_name: agency?.name || '',
      date_from: soaBatchFilter.date_from || null,
      date_to: soaBatchFilter.date_to || null,
      prepared_by_name: soaBatchSettings.default_prepared_by_name,
      prepared_by_title: soaBatchSettings.default_prepared_by_title,
      received_by_label: soaBatchSettings.default_received_by_label,
      total_amount: totalAmount,
      transaction_ids: selectedIds
    };

    if (editingSoaBatch) {
      await governmentTransactionService.updateSoaBatch(
        editingSoaBatch.id,
        batchInput
      );
    } else {
      await governmentTransactionService.createSoaBatch(batchInput);
    }

    alert(
      editingSoaBatch
        ? 'SOA batch updated successfully.'
        : 'SOA batch saved successfully.'
    );
    setEditingSoaBatch(null);
    await loadMasterData();
  };

  const printSoaBatch = () => {
    window.print();
  };

  const previewDocuments = (transaction: GovernmentTransaction) => {
    setDocumentPreviewTransaction(transaction);
    setShowDocumentPreview(true);
  };

  const printDocuments = () => {
    window.print();
  };

  const uploadSupportDocument = async (
    documentType: GovernmentSupportDocumentType,
    file?: File
  ) => {
    if (!editingTransaction?.id || !file) return;

    try {
      setUploadingDocumentType(documentType);
      await governmentTransactionService.uploadSupportDocument(
        editingTransaction.id,
        documentType,
        file
      );
      await loadSupportDocuments(editingTransaction.id);
    } catch (error: any) {
      alert(`Error uploading document: ${error.message}`);
    } finally {
      setUploadingDocumentType(null);
    }
  };

  const openSupportDocument = async (document: GovernmentSupportDocument) => {
    try {
      const url = await governmentTransactionService.getSupportDocumentUrl(
        document.file_path
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      alert(`Error opening document: ${error.message}`);
    }
  };

  const deleteSupportDocument = async (document: GovernmentSupportDocument) => {
    if (!window.confirm(`Delete ${document.file_name}?`)) return;

    try {
      await governmentTransactionService.deleteSupportDocument(document);
      await loadSupportDocuments(editingTransaction?.id);
    } catch (error: any) {
      alert(`Error deleting document: ${error.message}`);
    }
  };

  const markEndorsementReady = async (transaction: GovernmentTransaction) => {
    const updated = await governmentTransactionService.updateTransaction(
      transaction.id,
      { status: 'endorsement_ready' }
    );
    setSelectedTransaction(updated);
    setDocumentPreviewTransaction(updated);
    await loadTransactions();
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDocumentSettingsModal(true)}
          >
            <SettingsIcon className="mr-2 h-4 w-4" />
            Document Settings
          </Button>
          <Button onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            New Government Transaction
          </Button>
        </div>
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
          onPreviewDocuments={previewDocuments}
        />
      </div>

      <SoaBatchPanel
        filter={soaBatchFilter}
        onFilterChange={setSoaBatchFilter}
        agencies={lguAgencies}
        candidates={soaBatchCandidates}
        selectedIds={selectedSoaTransactionIds}
        batches={soaBatches}
        editingBatchId={editingSoaBatch?.id || ''}
        onToggle={toggleSoaTransaction}
        onSelectAll={selectAllSoaCandidates}
        onClear={clearSoaSelection}
        onPreview={previewSoaBatch}
        onSave={saveSoaBatch}
        onPreviewBatch={previewSavedSoaBatch}
        onEditBatch={editSavedSoaBatch}
        onDeleteBatch={deleteSavedSoaBatch}
        onOpenSettings={() => setShowSoaBatchSettingsModal(true)}
      />

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

            <SupportDocumentPanel
              transactionId={editingTransaction?.id}
              documentType="referral_letter"
              title="Referral Letter"
              description="Upload the CSWD/LGU referral letter received during intake."
              documents={supportDocuments}
              uploadingDocumentType={uploadingDocumentType}
              onUpload={uploadSupportDocument}
              onOpen={openSupportDocument}
              onDelete={deleteSupportDocument}
            />
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

            <SupportDocumentPanel
              transactionId={editingTransaction?.id}
              documentType="guarantee_letter"
              title="Guarantee Letter"
              description="Upload the signed guarantee letter from the LGU or agency."
              documents={supportDocuments}
              uploadingDocumentType={uploadingDocumentType}
              onUpload={uploadSupportDocument}
              onOpen={openSupportDocument}
              onDelete={deleteSupportDocument}
            />
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

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SupportDocumentPanel
                transactionId={editingTransaction?.id}
                documentType="soa_document"
                title="Statement of Account"
                description="Upload the submitted SOA or billing document."
                documents={supportDocuments}
                uploadingDocumentType={uploadingDocumentType}
                onUpload={uploadSupportDocument}
                onOpen={openSupportDocument}
                onDelete={deleteSupportDocument}
              />
              <SupportDocumentPanel
                transactionId={editingTransaction?.id}
                documentType="cheque_payment_proof"
                title="Cheque / Payment Proof"
                description="Upload cheque copy, deposit slip, or other payment proof."
                documents={supportDocuments}
                uploadingDocumentType={uploadingDocumentType}
                onUpload={uploadSupportDocument}
                onOpen={openSupportDocument}
                onDelete={deleteSupportDocument}
              />
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

      <Modal
        isOpen={showDocumentSettingsModal}
        onClose={() => setShowDocumentSettingsModal(false)}
        title="Government Document Settings"
        size="xl"
      >
        <DocumentSettingsForm
          settings={documentSettings}
          onChange={setDocumentSettings}
          onSave={saveDocumentSettings}
          onCancel={() => setShowDocumentSettingsModal(false)}
        />
      </Modal>

      <Modal
        isOpen={showSoaBatchSettingsModal}
        onClose={() => setShowSoaBatchSettingsModal(false)}
        title="SOA Batch Settings"
        size="lg"
      >
        <SoaBatchSettingsForm
          settings={soaBatchSettings}
          onChange={setSoaBatchSettings}
          onSave={saveSoaBatchSettings}
          onCancel={() => setShowSoaBatchSettingsModal(false)}
        />
      </Modal>

      <Modal
        isOpen={showSoaBatchPreview}
        onClose={() => setShowSoaBatchPreview(false)}
        title="SOA Batch Preview"
        size="xl"
      >
        <div className="space-y-4">
          <style>
            {`
              @media print {
                body * { visibility: hidden !important; }
                #government-soa-batch, #government-soa-batch * { visibility: visible !important; }
                #government-soa-batch {
                  position: absolute;
                  inset: 0;
                  width: 100%;
                  background: white;
                }
              }
            `}
          </style>
          <div className="flex justify-end gap-2 print:hidden">
            <Button type="button" variant="outline" onClick={saveSoaBatch}>
              {editingSoaBatch ? 'Update Batch' : 'Save Batch'}
            </Button>
            <Button type="button" onClick={printSoaBatch}>
              <Printer className="mr-2 h-4 w-4" />
              Print / Save PDF
            </Button>
          </div>
          <SoaBatchPreview
            rows={soaBatchPreviewRows}
            batchName={soaBatchPreviewName}
            settings={soaBatchPreviewSettings}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showDocumentPreview}
        onClose={() => setShowDocumentPreview(false)}
        title="Endorsement & Costing Preview"
        size="xl"
      >
        {documentPreviewTransaction && (
          <div className="space-y-4">
            <style>
              {`
                @media print {
                  body * { visibility: hidden !important; }
                  #government-documents, #government-documents * { visibility: visible !important; }
                  #government-documents {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    background: white;
                  }
                  #government-documents section {
                    page-break-after: always;
                  }
                }
              `}
            </style>
            <div className="flex flex-wrap justify-end gap-2 print:hidden">
              <Button
                type="button"
                variant="outline"
                onClick={() => markEndorsementReady(documentPreviewTransaction)}
              >
                <FileSignature className="mr-2 h-4 w-4" />
                Mark as Endorsement Ready
              </Button>
              <Button type="button" onClick={printDocuments}>
                <Printer className="mr-2 h-4 w-4" />
                Print / Save PDF
              </Button>
            </div>
            <GovernmentDocumentPreview
              transaction={documentPreviewTransaction}
              client={clients.find(
                (client) => client.id === documentPreviewTransaction.client_id
              )}
              lguAgency={lguAgencies.find(
                (agency) => agency.id === documentPreviewTransaction.lgu_agency_id
              )}
              clinicSettings={clinicSettings}
              documentSettings={documentSettings}
            />
          </div>
        )}
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

const DocumentSettingsForm: React.FC<{
  settings: GovernmentDocumentSettingsInput;
  onChange: (settings: GovernmentDocumentSettingsInput) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ settings, onChange, onSave, onCancel }) => {
  const update = (field: keyof GovernmentDocumentSettingsInput, value: string) =>
    onChange({ ...settings, [field]: value });

  return (
    <div className="space-y-5">
      <FormSection
        icon={<FileText className="h-5 w-5 text-teal-600" />}
        title="Document Header"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input
            label="Header Line 1"
            value={settings.header_line_1}
            onChange={(event) => update('header_line_1', event.target.value)}
          />
          <Input
            label="Header Line 2"
            value={settings.header_line_2}
            onChange={(event) => update('header_line_2', event.target.value)}
          />
          <Input
            label="Header Line 3"
            value={settings.header_line_3}
            onChange={(event) => update('header_line_3', event.target.value)}
          />
        </div>
      </FormSection>

      <FormSection
        icon={<Landmark className="h-5 w-5 text-emerald-600" />}
        title="Recipient Defaults"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Default Recipient Name"
            value={settings.default_recipient_name}
            onChange={(event) =>
              update('default_recipient_name', event.target.value)
            }
          />
          <Input
            label="Default Recipient Title"
            value={settings.default_recipient_title}
            onChange={(event) =>
              update('default_recipient_title', event.target.value)
            }
          />
        </div>
      </FormSection>

      <FormSection
        icon={<FileSignature className="h-5 w-5 text-blue-600" />}
        title="Signatories"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Endorsement Signatory"
            value={settings.endorsement_signatory_name}
            onChange={(event) =>
              update('endorsement_signatory_name', event.target.value)
            }
          />
          <Input
            label="Endorsement Signatory Title"
            value={settings.endorsement_signatory_title}
            onChange={(event) =>
              update('endorsement_signatory_title', event.target.value)
            }
          />
          <Input
            label="Endorsement Signatory Role / Office"
            value={settings.endorsement_signatory_role}
            onChange={(event) =>
              update('endorsement_signatory_role', event.target.value)
            }
          />
          <Input
            label="Prepared By"
            value={settings.prepared_by_name}
            onChange={(event) =>
              update('prepared_by_name', event.target.value)
            }
          />
          <Input
            label="Prepared By Title"
            value={settings.prepared_by_title}
            onChange={(event) =>
              update('prepared_by_title', event.target.value)
            }
          />
          <Input
            label="Noted By"
            value={settings.noted_by_name}
            onChange={(event) => update('noted_by_name', event.target.value)}
          />
          <Input
            label="Noted By Title"
            value={settings.noted_by_title}
            onChange={(event) => update('noted_by_title', event.target.value)}
          />
        </div>
      </FormSection>

      <FormSection
        icon={<ClipboardList className="h-5 w-5 text-violet-600" />}
        title="Standard Text"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Endorsement Body
            </label>
            <textarea
              rows={4}
              value={settings.endorsement_body}
              onChange={(event) =>
                update('endorsement_body', event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <Input
            label="Costing Footer"
            value={settings.costing_footer}
            onChange={(event) => update('costing_footer', event.target.value)}
          />
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave}>
          Save Document Settings
        </Button>
      </div>
    </div>
  );
};

const SupportDocumentPanel: React.FC<{
  transactionId?: string;
  documentType: GovernmentSupportDocumentType;
  title: string;
  description: string;
  documents: GovernmentSupportDocument[];
  uploadingDocumentType: GovernmentSupportDocumentType | null;
  onUpload: (
    documentType: GovernmentSupportDocumentType,
    file?: File
  ) => void;
  onOpen: (document: GovernmentSupportDocument) => void;
  onDelete: (document: GovernmentSupportDocument) => void;
}> = ({
  transactionId,
  documentType,
  title,
  description,
  documents,
  uploadingDocumentType,
  onUpload,
  onOpen,
  onDelete
}) => {
  const matchingDocuments = documents.filter(
    (document) => document.document_type === documentType
  );
  const isUploading = uploadingDocumentType === documentType;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <label
          className={`inline-flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
            transactionId
              ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
          }`}
        >
          <FileText className="mr-2 h-4 w-4" />
          {isUploading ? 'Uploading...' : 'Upload'}
          <input
            type="file"
            className="hidden"
            disabled={!transactionId || isUploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              onUpload(documentType, file);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      {!transactionId && (
        <p className="mt-3 text-xs text-amber-700">
          Save the government transaction first before uploading documents.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {matchingDocuments.map((document) => (
          <div
            key={document.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {document.file_name}
              </p>
              <p className="text-xs text-slate-500">
                {(document.file_size / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpen(document)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => onDelete(document)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {matchingDocuments.length === 0 && transactionId && (
          <p className="text-xs text-slate-500">No file uploaded yet.</p>
        )}
      </div>
    </div>
  );
};

const SoaBatchPanel: React.FC<{
  filter: {
    batch_name: string;
    lgu_agency_id: string;
    date_from: string;
    date_to: string;
  };
  onFilterChange: (filter: {
    batch_name: string;
    lgu_agency_id: string;
    date_from: string;
    date_to: string;
  }) => void;
  agencies: GovernmentMasterRecord[];
  candidates: GovernmentTransaction[];
  selectedIds: string[];
  batches: GovernmentSoaBatch[];
  editingBatchId: string;
  onToggle: (transactionId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onPreview: () => void;
  onSave: () => void;
  onPreviewBatch: (batch: GovernmentSoaBatch) => void;
  onEditBatch: (batch: GovernmentSoaBatch) => void;
  onDeleteBatch: (batch: GovernmentSoaBatch) => void;
  onOpenSettings: () => void;
}> = ({
  filter,
  onFilterChange,
  agencies,
  candidates,
  selectedIds,
  batches,
  editingBatchId,
  onToggle,
  onSelectAll,
  onClear,
  onPreview,
  onSave,
  onPreviewBatch,
  onEditBatch,
  onDeleteBatch,
  onOpenSettings
}) => {
  const selectedTotal = candidates
    .filter((transaction) => selectedIds.includes(transaction.id))
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.computed_fee || transaction.approved_amount || 0),
      0
    );

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            SOA Batch Generation
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Select multiple completed government transactions and generate a
            batch Statement of Accounts list.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onOpenSettings}>
          <SettingsIcon className="mr-2 h-4 w-4" />
          SOA Settings
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          label="Batch Name"
          placeholder="Example: 5th Batch"
          value={filter.batch_name}
          onChange={(event) =>
            onFilterChange({ ...filter, batch_name: event.target.value })
          }
        />
        <Select
          label="LGU / Agency"
          value={filter.lgu_agency_id}
          onChange={(event) =>
            onFilterChange({ ...filter, lgu_agency_id: event.target.value })
          }
          options={[
            { value: '', label: 'All agencies' },
            ...agencies.map((agency) => ({
              value: agency.id,
              label: agency.name
            }))
          ]}
        />
        <Input
          label="Date From"
          type="date"
          value={filter.date_from}
          onChange={(event) =>
            onFilterChange({ ...filter, date_from: event.target.value })
          }
        />
        <Input
          label="Date To"
          type="date"
          value={filter.date_to}
          onChange={(event) =>
            onFilterChange({ ...filter, date_to: event.target.value })
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Selected: <strong>{selectedIds.length}</strong> | Total:{' '}
          <strong>{formatAmount(selectedTotal)}</strong>
          {editingBatchId && (
            <span className="ml-3 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Editing saved batch
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onSelectAll}>
            Select All
          </Button>
          <Button type="button" variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button type="button" variant="outline" onClick={onSave}>
            {editingBatchId ? 'Update Batch' : 'Save Batch'}
          </Button>
          <Button type="button" onClick={onPreview}>
            Preview Batch SOA
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[920px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                Select
              </th>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                Schedule
              </th>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                SOA / Charge No.
              </th>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                Client
              </th>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                Service
              </th>
              <th className="px-3 py-2 text-left text-sm text-slate-600">
                Control No.
              </th>
              <th className="px-3 py-2 text-right text-sm text-slate-600">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((transaction) => (
              <tr key={transaction.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(transaction.id)}
                    onChange={() => onToggle(transaction.id)}
                  />
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {formatSoaSchedule(transaction)}
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {transaction.soa_number || '-'}
                </td>
                <td className="px-3 py-2 text-sm font-medium text-slate-900">
                  {transaction.client_name}
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {formatSoaServices(transaction)}
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {transaction.reference_number}
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-900">
                  {formatAmount(transaction.computed_fee || transaction.approved_amount)}
                </td>
              </tr>
            ))}

            {candidates.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                  No eligible transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {batches.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-slate-900">
            Saved Batches
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {batches.slice(0, 6).map((batch) => (
              <div
                key={batch.id}
                className={`rounded-lg border p-3 text-sm ${
                  editingBatchId === batch.id
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="font-medium text-slate-900">{batch.batch_name}</p>
                <p className="text-slate-500">
                  {batch.lgu_name || 'All agencies'} |{' '}
                  {formatAmount(batch.total_amount)}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(batch.created_at).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onPreviewBatch(batch)}
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onEditBatch(batch)}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => onDeleteBatch(batch)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

const SoaBatchSettingsForm: React.FC<{
  settings: GovernmentSoaBatchSettingsInput;
  onChange: (settings: GovernmentSoaBatchSettingsInput) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ settings, onChange, onSave, onCancel }) => (
  <div className="space-y-4">
    <Input
      label="Prepared By"
      value={settings.default_prepared_by_name}
      onChange={(event) =>
        onChange({ ...settings, default_prepared_by_name: event.target.value })
      }
    />
    <Input
      label="Prepared By Title"
      value={settings.default_prepared_by_title}
      onChange={(event) =>
        onChange({ ...settings, default_prepared_by_title: event.target.value })
      }
    />
    <Input
      label="Received By Label"
      value={settings.default_received_by_label}
      onChange={(event) =>
        onChange({ ...settings, default_received_by_label: event.target.value })
      }
    />
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" onClick={onSave}>
        Save SOA Settings
      </Button>
    </div>
  </div>
);

const SoaBatchPreview: React.FC<{
  rows: GovernmentTransaction[];
  batchName: string;
  settings: GovernmentSoaBatchSettingsInput;
}> = ({ rows, batchName, settings }) => {
  const total = rows.reduce(
    (sum, transaction) =>
      sum + Number(transaction.computed_fee || transaction.approved_amount || 0),
    0
  );

  return (
    <section
      id="government-soa-batch"
      className="mx-auto min-h-[760px] max-w-[1056px] rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:min-h-screen print:max-w-none print:rounded-none print:border-0 print:shadow-none"
    >
      <h2 className="text-center text-2xl font-semibold">
        Statement of Accounts
      </h2>
      <p className="text-center text-lg">({batchName})</p>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-2 text-left">
              Date Scheduled
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left">
              Billing Statement No. Invoice/Charge No.
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left">
              Name of Client
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left">
              Service Provided
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left">
              Control Number
            </th>
            <th className="border border-slate-300 px-2 py-2 text-right">
              Amount Due
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transaction) => (
            <tr key={transaction.id}>
              <td className="border border-slate-300 px-2 py-2">
                {formatSoaSchedule(transaction)}
              </td>
              <td className="border border-slate-300 px-2 py-2">
                {transaction.soa_number || '-'}
              </td>
              <td className="border border-slate-300 px-2 py-2">
                {transaction.client_name}
              </td>
              <td className="border border-slate-300 px-2 py-2">
                {formatSoaServices(transaction)}
              </td>
              <td className="border border-slate-300 px-2 py-2">
                {transaction.reference_number}
              </td>
              <td className="border border-slate-300 px-2 py-2 text-right">
                {formatAmount(transaction.computed_fee || transaction.approved_amount)}
              </td>
            </tr>
          ))}
          <tr>
            <td
              colSpan={5}
              className="border border-slate-300 px-2 py-2 text-right font-semibold"
            >
              TOTAL:
            </td>
            <td className="border border-slate-300 px-2 py-2 text-right font-semibold">
              {formatAmount(total)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
        <div>
          <p>Prepared by:</p>
          <div className="mt-10">
            <p className="font-semibold">
              {settings.default_prepared_by_name || '-'}
            </p>
            <p>{settings.default_prepared_by_title || '-'}</p>
          </div>
        </div>
        <div>
          <p>Received by:</p>
          <div className="mt-10 border-t border-slate-500 pt-2 text-center">
            <p>{settings.default_received_by_label || '-'}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

const formatSoaSchedule = (transaction: GovernmentTransaction) =>
  [
    toInputDate(transaction.schedule_date),
    toInputDate(transaction.service_completed_date)
  ]
    .filter(Boolean)
    .map((date) => formatDate(date))
    .join(' / ') || '-';

const formatSoaServices = (transaction: GovernmentTransaction) => {
  const services = transaction.items?.length
    ? transaction.items.map((item) => item.service_name)
    : transaction.selected_tests
      ? [transaction.selected_tests]
      : [];

  return services.map((service) => `- ${service}`).join(', ') || '-';
};

const GovernmentDocumentPreview: React.FC<{
  transaction: GovernmentTransaction;
  client?: Client;
  lguAgency?: GovernmentMasterRecord;
  clinicSettings: ClinicSettings | null;
  documentSettings: GovernmentDocumentSettingsInput;
}> = ({
  transaction,
  client,
  lguAgency,
  clinicSettings,
  documentSettings
}) => {
  const clientName = client?.full_name || transaction.client_name;
  const clientAddress = client?.address || '-';
  const clientAge = client?.age ? `${client.age} years old` : '-';
  const clientSex = client?.sex || '-';
  const recipientName =
    lguAgency?.contact_person || documentSettings.default_recipient_name || '-';
  const recipientTitle =
    documentSettings.default_recipient_title || 'Authorized Representative';
  const recipientOffice = transaction.lgu_name || lguAgency?.name || '-';
  const recipientAddress = lguAgency?.address || '-';
  const headerLines = [
    documentSettings.header_line_1,
    documentSettings.header_line_2,
    documentSettings.header_line_3
  ].filter(Boolean);
  const serviceItems = transaction.items?.length
    ? transaction.items
    : [{
        service_name: transaction.selected_tests || 'Selected Services',
        quantity: 1,
        unit_price: transaction.computed_fee || 0,
        line_total: transaction.computed_fee || 0,
        service_id: ''
      }];
  const total = serviceItems.reduce(
    (sum, item) => sum + Number(item.line_total || 0),
    0
  );

  return (
    <div id="government-documents" className="space-y-6 print:space-y-0">
      <DocumentPage>
        <DocumentHeader
          clinicSettings={clinicSettings}
          headerLines={headerLines}
        />
        <h2 className="mt-8 text-center text-xl font-semibold">
          Endorsement Letter
        </h2>
        <div className="mt-6 space-y-1 text-sm">
          <p>Date: {formatDate(transaction.referral_date)}</p>
          <p>{recipientName}</p>
          <p>{recipientTitle}</p>
          <p>{recipientOffice}</p>
          <p>{recipientAddress}</p>
        </div>
        <p className="mt-5 text-sm font-semibold">
          Subject: Endorsement of Client/Beneficiary for Psychological Services
        </p>
        <p className="mt-5 text-sm">Dear {recipientName},</p>
        <p className="mt-4 whitespace-pre-line text-sm leading-7">
          {documentSettings.endorsement_body}
        </p>
        <div className="mt-5 rounded-lg border border-slate-200 p-4 text-sm">
          <p><strong>Name of Client/Beneficiary:</strong> {clientName}</p>
          <p><strong>Age:</strong> {clientAge}</p>
          <p><strong>Sex:</strong> {clientSex}</p>
          <p><strong>Address:</strong> {clientAddress}</p>
          <p><strong>Referral Reference:</strong> {transaction.referral_letter_reference || '-'}</p>
          <p><strong>Referral Concern / Selected Services:</strong> {transaction.selected_tests || '-'}</p>
        </div>
        <p className="mt-6 text-sm leading-7">
          Thank you for your continued partnership in supporting accessible
          psychological services for the community.
        </p>
        <div className="mt-12 text-sm">
          <p>Respectfully yours,</p>
          <div className="mt-10">
            <p className="font-semibold">
              {documentSettings.endorsement_signatory_name || '-'}
            </p>
            <p>{documentSettings.endorsement_signatory_title || '-'}</p>
            <p>{documentSettings.endorsement_signatory_role || clinicSettings?.clinic_name || '-'}</p>
          </div>
        </div>
      </DocumentPage>

      <DocumentPage>
        <DocumentHeader
          clinicSettings={clinicSettings}
          headerLines={headerLines}
        />
        <h2 className="mt-8 text-center text-xl font-semibold">
          Costing Statement
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
          <p><strong>Name:</strong> {clientName}</p>
          <p><strong>Client No.:</strong> {client?.client_code || '-'}</p>
          <p className="col-span-2"><strong>Address:</strong> {clientAddress}</p>
        </div>
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-left">
                Psychological Services
              </th>
              <th className="border border-slate-300 px-3 py-2 text-right">
                Session(s)
              </th>
              <th className="border border-slate-300 px-3 py-2 text-right">
                Amount
              </th>
              <th className="border border-slate-300 px-3 py-2 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {serviceItems.map((item, index) => (
              <tr key={`${item.service_id}-${index}`}>
                <td className="border border-slate-300 px-3 py-2">
                  {item.service_name}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right">
                  {item.quantity}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right">
                  {formatAmount(item.unit_price)}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right">
                  {formatAmount(item.line_total)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={3}
                className="border border-slate-300 px-3 py-2 text-right font-semibold"
              >
                Total
              </td>
              <td className="border border-slate-300 px-3 py-2 text-right font-semibold">
                {formatAmount(total)}
              </td>
            </tr>
          </tbody>
        </table>
        {documentSettings.costing_footer && (
          <p className="mt-4 text-sm text-slate-600">
            {documentSettings.costing_footer}
          </p>
        )}
        <div className="mt-14 grid grid-cols-2 gap-12 text-sm">
          <div>
            <p>Prepared by:</p>
            <div className="mt-10">
              <p className="font-semibold">{documentSettings.prepared_by_name || '-'}</p>
              <p>{documentSettings.prepared_by_title || '-'}</p>
            </div>
          </div>
          <div>
            <p>Noted by:</p>
            <div className="mt-10">
              <p className="font-semibold">{documentSettings.noted_by_name || '-'}</p>
              <p>{documentSettings.noted_by_title || '-'}</p>
            </div>
          </div>
        </div>
      </DocumentPage>
    </div>
  );
};

const DocumentPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="mx-auto min-h-[980px] max-w-[816px] rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:min-h-screen print:max-w-none print:rounded-none print:border-0 print:p-8 print:shadow-none">
    {children}
  </section>
);

const DocumentHeader: React.FC<{
  clinicSettings: ClinicSettings | null;
  headerLines: string[];
}> = ({ clinicSettings, headerLines }) => (
  <div className="border-b border-slate-200 pb-4 text-center text-xs leading-5 text-slate-700">
    {clinicSettings?.show_logo && clinicSettings?.logo_url && (
      <img
        src={clinicSettings.logo_url}
        alt="Clinic logo"
        className="mx-auto mb-2 h-16 w-16 object-contain"
      />
    )}
    <p className="text-base font-semibold text-slate-900">
      {clinicSettings?.clinic_name || 'Psyzygy Psychological Center'}
    </p>
    {headerLines.length > 0 ? (
      headerLines.map((line) => <p key={line}>{line}</p>)
    ) : (
      <>
        {clinicSettings?.address && <p>{clinicSettings.address}</p>}
        {clinicSettings?.contact_number && <p>{clinicSettings.contact_number}</p>}
        {clinicSettings?.email && <p>{clinicSettings.email}</p>}
        {clinicSettings?.website && <p>{clinicSettings.website}</p>}
      </>
    )}
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
  onPreviewDocuments: (transaction: GovernmentTransaction) => void;
}> = ({ transaction, onEdit, onAdvance, onPreviewDocuments }) => (
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
          <Button variant="outline" onClick={() => onPreviewDocuments(transaction)}>
            <FileSignature className="mr-2 h-4 w-4" />
            Generate Endorsement & Costing
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
