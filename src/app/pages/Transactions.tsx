import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { useAppContext, Transaction } from '../context/AppContext';
import { settingsService } from '../services/settingsService';
import { auditService } from '../services/auditService';
import { associateService } from '../services/associateService';
import { referralService } from '../services/referralService';
import { supabase } from '../lib/supabaseClient';
import {
  CalendarDays,
  ChevronDown,
  Eye,
  DollarSign,
  Download,
  Printer,
  Filter,
  Pencil,
  Ban,
  History,
  Save,
  Trash2,
  UserRoundCheck,
  Share2,
  RotateCcw
} from 'lucide-react';

const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const escapeCsvValue = (value: string | number) => {
  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatScheduledService = (schedule?: any | null) => {
  if (!schedule) return '';

  const date = new Date(`${schedule.appointment_date}T00:00:00`)
    .toLocaleDateString();
  const startTime = schedule.start_time?.slice(0, 5) || '';
  const endTime = schedule.end_time?.slice(0, 5) || '';
  const time = [startTime, endTime].filter(Boolean).join(' - ');
  const location = schedule.room_name || schedule.appointment_type || '';

  return [date, time, location].filter(Boolean).join(' | ');
};

export const Transactions: React.FC = () => {
  const { transactions, addPayment, refreshData } = useAppContext();

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [paymentMethodFilters, setPaymentMethodFilters] = useState<string[]>([]);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isMethodFilterOpen, setIsMethodFilterOpen] = useState(false);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const [clinicSettings, setClinicSettings] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [associates, setAssociates] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [paymentForm, setPaymentForm] = useState({
    method: 'Cash',
    amount: 0,
    reference: '',
    notes: ''
  });

  const [refundForm, setRefundForm] = useState({
    method: 'Cash',
    amount: 0,
    reference: '',
    reason: ''
  });

  const [voidReason, setVoidReason] = useState('');

  const [editReason, setEditReason] = useState('');
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, methodsData, associatesData, referralsData] =
        await Promise.all([
          settingsService.getClinicSettings(),
          settingsService.getPaymentMethods(),
          associateService.getAssociates(),
          referralService.getReferrals()
        ]);

      setClinicSettings(settingsData);

      const activeMethods = methodsData
        .filter((method: any) => method.is_active)
        .map((method: any) => ({
          value: method.name,
          label: method.name
        }));

      setPaymentMethods(activeMethods);
      setAssociates(associatesData.filter((item: any) => item.is_active));
      setReferrals(referralsData.filter((item: any) => item.is_active));
    } catch (error) {
      console.error('Error loading transaction settings:', error);
    }
  };

  const associateOptions = [
    { value: '', label: 'No associate selected' },
    ...associates.map((associate) => ({
      value: associate.id,
      label: `${associate.full_name}${associate.title ? `, ${associate.title}` : ''}`
    }))
  ];

  const referralOptions = [
    { value: '', label: 'No referral selected' },
    ...referrals.map((referral) => ({
      value: referral.id,
      label: `${referral.referral_name}${
        referral.referral_type ? ` (${referral.referral_type})` : ''
      }`
    }))
  ];

  const getRefundTotal = (transaction: Transaction) =>
    transaction.payments
      .filter((payment) => Number(payment.amount || 0) < 0)
      .reduce((sum, payment) => sum + Math.abs(Number(payment.amount || 0)), 0);

  const getDisplayStatus = (transaction: Transaction) => {
    const refundTotal = getRefundTotal(transaction);

    if (transaction.payment_status === 'Void') return 'Void';
    if (refundTotal > 0 && Number(transaction.total_paid || 0) <= 0) {
      return 'Refunded';
    }
    if (refundTotal > 0) return 'Partially Refunded';

    return transaction.payment_status;
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const statusMatch =
        statusFilters.length === 0 ||
        statusFilters.includes(getDisplayStatus(transaction));

      const methodMatch =
        paymentMethodFilters.length === 0 ||
        transaction.payments.some(
          (payment) => paymentMethodFilters.includes(payment.payment_method)
        );

      const transactionDate = new Date(transaction.transaction_date);
      const startMatch =
        !startDateFilter ||
        transactionDate >= new Date(`${startDateFilter}T00:00:00`);
      const endMatch =
        !endDateFilter ||
        transactionDate <= new Date(`${endDateFilter}T23:59:59.999`);

      return statusMatch && methodMatch && startMatch && endMatch;
    });
  }, [
    transactions,
    statusFilters,
    paymentMethodFilters,
    startDateFilter,
    endDateFilter
  ]);

  const getStatusVariant = (status: string) => {
    if (status === 'Paid') return 'success';
    if (status === 'Partial') return 'warning';
    if (status === 'Partially Refunded') return 'warning';
    if (status === 'Refunded') return 'info';
    return 'danger';
  };

  const handleViewTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowViewModal(true);
  };

  const handlePrintReceipt = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowReceiptModal(true);
  };

  const handleOpenAddPayment = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setPaymentForm({
      method: paymentMethods[0]?.value || 'Cash',
      amount: transaction.balance > 0 ? transaction.balance : 0,
      reference: '',
      notes: ''
    });
    setShowAddPaymentModal(true);
  };

  const handleAddPayment = async () => {
    if (!selectedTransaction || paymentForm.amount <= 0) return;

    try {
      const previousPaid = Number(selectedTransaction.total_paid || 0);
      const previousBalance = Number(selectedTransaction.balance || 0);

      await addPayment(selectedTransaction.id, {
        payment_method: paymentForm.method,
        amount: paymentForm.amount,
        reference_number: paymentForm.reference,
        payment_date: new Date().toISOString(),
        received_by: 'Admin User',
        notes: paymentForm.notes
      });

      await auditService.addLog({
        table_name: 'payments',
        record_id: selectedTransaction.id,
        action: 'ADD_PAYMENT',
        old_data: selectedTransaction,
        new_data: {
          ...paymentForm,
          amount_added: Number(paymentForm.amount || 0),
          previous_total_paid: previousPaid,
          new_total_paid: previousPaid + Number(paymentForm.amount || 0),
          previous_balance: previousBalance,
          new_balance: previousBalance - Number(paymentForm.amount || 0)
        },
        reason: paymentForm.notes || 'Additional payment recorded',
        performed_by: 'Admin User'
      });

      setShowAddPaymentModal(false);
      setSelectedTransaction(null);
      alert('Payment added successfully.');
    } catch (error: any) {
      console.error('Error adding payment:', error);
      alert(`Error adding payment: ${error.message}`);
    }
  };

  const handleOpenRefund = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setRefundForm({
      method: paymentMethods[0]?.value || 'Cash',
      amount: Number(transaction.total_paid || 0),
      reference: '',
      reason: ''
    });
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (!selectedTransaction) return;

    const refundAmount = Number(refundForm.amount || 0);
    const refundableAmount = Number(selectedTransaction.total_paid || 0);

    if (refundAmount <= 0) {
      alert('Please enter a refund amount.');
      return;
    }

    if (refundAmount > refundableAmount) {
      alert('Refund amount cannot be greater than the amount paid.');
      return;
    }

    if (!refundForm.reason.trim()) {
      alert('Please enter a reason for the refund.');
      return;
    }

    try {
      await addPayment(selectedTransaction.id, {
        payment_method: refundForm.method,
        amount: -refundAmount,
        reference_number: refundForm.reference,
        payment_date: new Date().toISOString(),
        received_by: 'Admin User',
        notes: `Refund: ${refundForm.reason}`
      });

      await auditService.addLog({
        table_name: 'payments',
        record_id: selectedTransaction.id,
        action: 'REFUND_PAYMENT',
        old_data: selectedTransaction,
        new_data: {
          ...refundForm,
          amount_subtracted: refundAmount,
          payment_amount_recorded: -refundAmount,
          previous_total_paid: refundableAmount,
          new_total_paid: refundableAmount - refundAmount,
          previous_balance: Number(selectedTransaction.balance || 0),
          new_balance: Number(selectedTransaction.balance || 0) + refundAmount
        },
        reason: refundForm.reason,
        performed_by: 'Admin User'
      });

      setShowRefundModal(false);
      setSelectedTransaction(null);
      alert('Refund recorded successfully.');
    } catch (error: any) {
      console.error('Error recording refund:', error);
      alert(`Error recording refund: ${error.message}`);
    }
  };

  const handleOpenEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setEditItems(
      transaction.items.map((item: any) => ({
        ...item,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        discount_amount: Number(item.discount_amount || 0),
        associate_id: item.associate_id || '',
        associate_name: item.associate_name || '',
        referral_id: item.referral_id || '',
        referral_name: item.referral_name || ''
      }))
    );
    setEditNotes(transaction.notes || '');
    setEditReason('');
    setShowEditModal(true);
  };

  const updateEditItem = (index: number, field: string, value: any) => {
    const updated = [...editItems];

    updated[index] = {
      ...updated[index],
      [field]: value
    };

    if (field === 'associate_id') {
      const selectedAssociate = associates.find((associate) => associate.id === value);
      updated[index].associate_name = selectedAssociate?.full_name || '';
    }

    if (field === 'referral_id') {
      const selectedReferral = referrals.find((referral) => referral.id === value);
      updated[index].referral_name = selectedReferral?.referral_name || '';
    }

    updated[index].line_total = Math.max(
      Number(updated[index].quantity || 0) *
        Number(updated[index].unit_price || 0) -
        Number(updated[index].discount_amount || 0),
      0
    );

    setEditItems(updated);
  };

  const deleteEditItem = (index: number) => {
    if (editItems.length <= 1) {
      alert('A transaction must have at least one service item.');
      return;
    }

    setEditItems(editItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveEditedTransaction = async () => {
    if (!selectedTransaction) return;

    if (!editReason.trim()) {
      alert('Please enter a reason for editing this transaction.');
      return;
    }

    try {
      const oldData = selectedTransaction;

      await supabase
        .from('transactions')
        .update({
          notes: editNotes
        })
        .eq('id', selectedTransaction.id);

      for (const item of editItems) {
        await supabase
          .from('transaction_items')
          .update({
            quantity: Number(item.quantity || 1),
            unit_price: Number(item.unit_price || 0),
            discount_amount: Number(item.discount_amount || 0),
            associate_id: item.associate_id || null,
            associate_name: item.associate_name || null,
            referral_id: item.referral_id || null,
            referral_name: item.referral_name || null
          })
          .eq('id', item.id);
      }

      const originalItemIds = selectedTransaction.items.map((item) => item.id);
      const remainingItemIds = editItems.map((item) => item.id);
      const deletedItemIds = originalItemIds.filter(
        (id) => !remainingItemIds.includes(id)
      );

      if (deletedItemIds.length > 0) {
        await supabase
          .from('transaction_items')
          .delete()
          .in('id', deletedItemIds);
      }

      await auditService.addLog({
        table_name: 'transactions',
        record_id: selectedTransaction.id,
        action: 'EDIT_TRANSACTION',
        old_data: oldData,
        new_data: {
          notes: editNotes,
          items: editItems
        },
        reason: editReason,
        performed_by: 'Admin User'
      });

      await refreshData();

      setShowEditModal(false);
      setSelectedTransaction(null);
      alert('Transaction updated and audit log recorded.');
    } catch (error: any) {
      console.error('Error editing transaction:', error);
      alert(`Error editing transaction: ${error.message}`);
    }
  };

  const handleOpenVoid = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setVoidReason('');
    setShowVoidModal(true);
  };

  const voidTransaction = async () => {
    if (!selectedTransaction) return;

    if (!voidReason.trim()) {
      alert('Please enter a reason for voiding this transaction.');
      return;
    }

    try {
      await supabase
        .from('transactions')
        .update({
          is_void: true,
          void_reason: voidReason,
          payment_status: 'Void'
        })
        .eq('id', selectedTransaction.id);

      await auditService.addLog({
        table_name: 'transactions',
        record_id: selectedTransaction.id,
        action: 'VOID_TRANSACTION',
        old_data: selectedTransaction,
        new_data: {
          is_void: true,
          void_reason: voidReason,
          payment_status: 'Void'
        },
        reason: voidReason,
        performed_by: 'Admin User'
      });

      await refreshData();

      setShowVoidModal(false);
      setSelectedTransaction(null);
      alert('Transaction voided and audit log recorded.');
    } catch (error: any) {
      console.error('Error voiding transaction:', error);
      alert(`Error voiding transaction: ${error.message}`);
    }
  };

  const handleOpenAudit = async (transaction: Transaction) => {
    try {
      setSelectedTransaction(transaction);
      const logs = await auditService.getLogsByRecord(transaction.id);
      setAuditLogs(logs);
      setShowAuditModal(true);
    } catch (error: any) {
      console.error('Error loading audit logs:', error);
      alert(`Error loading audit logs: ${error.message}`);
    }
  };

  const printReceipt = () => {
    window.print();
  };

  const getFilterLabel = () => {
    if (!startDateFilter && !endDateFilter) return 'All dates';
    if (startDateFilter && endDateFilter) {
      return `${new Date(`${startDateFilter}T00:00:00`).toLocaleDateString()} - ${new Date(`${endDateFilter}T00:00:00`).toLocaleDateString()}`;
    }
    if (startDateFilter) {
      return `From ${new Date(`${startDateFilter}T00:00:00`).toLocaleDateString()}`;
    }
    return `Until ${new Date(`${endDateFilter}T00:00:00`).toLocaleDateString()}`;
  };

  const statusOptions = [
    { value: 'Paid', label: 'Paid' },
    { value: 'Partial', label: 'Partial' },
    { value: 'Unpaid', label: 'Unpaid' },
    { value: 'Partially Refunded', label: 'Partially Refunded' },
    { value: 'Refunded', label: 'Refunded' },
    { value: 'Void', label: 'Void' }
  ];

  const toggleFilterValue = (
    value: string,
    selectedValues: string[],
    setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelectedValues(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value]
    );
  };

  const getSelectedLabel = (
    selectedValues: string[],
    options: { value: string; label: string }[],
    fallback: string
  ) => {
    if (selectedValues.length === 0) return fallback;

    return selectedValues
      .map((value) => options.find((option) => option.value === value)?.label || value)
      .join(', ');
  };

  const exportTransactions = () => {
    const rows = [
      ['Transaction Report'],
      ['Date Range', getFilterLabel()],
      ['Payment Status', getSelectedLabel(statusFilters, statusOptions, 'All Statuses')],
      ['Payment Method', getSelectedLabel(paymentMethodFilters, methodOptions, 'All Methods')],
      [],
      [
        'Transaction #',
        'Date',
        'Client',
        'Services',
        'Subtotal',
        'Tax Type',
        'Tax Rate',
        'Tax Amount',
        'Grand Total',
        'Paid',
        'Balance',
        'Refunded',
        'Status'
      ],
      ...filteredTransactions.map((transaction) => [
        transaction.transaction_number,
        new Date(transaction.transaction_date).toLocaleDateString(),
        transaction.client_name || '',
        transaction.items.map((item: any) => item.service_name).join(' | '),
        Number(transaction.subtotal || 0),
        transaction.tax_type || 'NON_VAT',
        Number(transaction.tax_rate || 0),
        Number(transaction.tax_amount || 0),
        Number(transaction.total_amount || 0),
        Number(transaction.total_paid || 0),
        Number(transaction.balance || 0),
        getRefundTotal(transaction),
        getDisplayStatus(transaction)
      ])
    ];

    const csvContent = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');
    const dateStamp = toDateInputValue(new Date());

    downloadFile(
      `transactions-${dateStamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;'
    );
  };

  const printTransactions = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=700');

    if (!printWindow) {
      alert('Please allow popups to print the transaction report.');
      return;
    }

    const rows = filteredTransactions
      .map(
        (transaction) => `
          <tr>
            <td>${transaction.transaction_number}</td>
            <td>${new Date(transaction.transaction_date).toLocaleDateString()}</td>
            <td>${transaction.client_name || ''}</td>
            <td>${transaction.items.map((item: any) => item.service_name).join(' | ')}</td>
            <td class="right">PHP ${Number(transaction.total_amount || 0).toLocaleString()}</td>
            <td class="right">PHP ${Number(transaction.total_paid || 0).toLocaleString()}</td>
            <td class="right">PHP ${Number(transaction.balance || 0).toLocaleString()}</td>
            <td class="right">PHP ${getRefundTotal(transaction).toLocaleString()}</td>
            <td>${getDisplayStatus(transaction)}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Transaction Report</title>
          <style>
            body {
              color: #0f172a;
              font-family: Arial, sans-serif;
              margin: 32px;
            }
            h1 {
              font-size: 22px;
              margin: 0 0 4px;
            }
            p {
              color: #475569;
              margin: 0 0 20px;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th,
            td {
              border-bottom: 1px solid #e2e8f0;
              font-size: 12px;
              padding: 8px;
              text-align: left;
            }
            th {
              background: #f8fafc;
              color: #475569;
            }
            .right {
              text-align: right;
            }
          </style>
        </head>
        <body>
          <h1>Transaction Report</h1>
          <p>Date range: ${getFilterLabel()} | Status: ${getSelectedLabel(statusFilters, statusOptions, 'All Statuses')} | Method: ${getSelectedLabel(paymentMethodFilters, methodOptions, 'All Methods')}</p>
          <table>
            <thead>
              <tr>
                <th>Transaction #</th>
                <th>Date</th>
                <th>Client</th>
                <th>Services</th>
                <th class="right">Total</th>
                <th class="right">Paid</th>
                <th class="right">Balance</th>
                <th class="right">Refunded</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="9">No transactions found.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const fallbackPaymentMethods = [
    { value: 'Cash', label: 'Cash' },
    { value: 'GCash', label: 'GCash' },
    { value: 'Maya', label: 'Maya' },
    { value: 'Bank Transfer', label: 'Bank Transfer' },
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Debit Card', label: 'Debit Card' },
    { value: 'HMO / Company Sponsored', label: 'HMO / Company Sponsored' },
    { value: 'Check', label: 'Check' },
    { value: 'Other', label: 'Other' }
  ];

  const methodOptions =
    paymentMethods.length > 0 ? paymentMethods : fallbackPaymentMethods;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 justify-between lg:items-center mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-slate-900">Filters</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={exportTransactions}>
              <Download className="w-4 h-4 mr-2" />
              Export to Excel
            </Button>

            <Button variant="outline" onClick={printTransactions}>
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
              className="w-full min-h-[66px] px-3 py-2 border border-slate-300 rounded-lg bg-white text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    Payment Status
                  </p>
                  <p className="text-sm text-slate-500 truncate mt-1">
                    {getSelectedLabel(
                      statusFilters,
                      statusOptions,
                      'All Statuses'
                    )}
                  </p>
                </div>

                <ChevronDown
                  className={`w-4 h-4 text-slate-500 mt-1 shrink-0 transition-transform ${
                    isStatusFilterOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {isStatusFilterOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg p-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Select statuses
                  </p>
                  {statusFilters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStatusFilters([])}
                      className="text-xs text-teal-700 hover:text-teal-800"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 pt-3">
                  {statusOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={statusFilters.includes(option.value)}
                        onChange={() =>
                          toggleFilterValue(
                            option.value,
                            statusFilters,
                            setStatusFilters
                          )
                        }
                        className="rounded border-slate-300"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMethodFilterOpen(!isMethodFilterOpen)}
              className="w-full min-h-[66px] px-3 py-2 border border-slate-300 rounded-lg bg-white text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    Payment Method
                  </p>
                  <p className="text-sm text-slate-500 truncate mt-1">
                    {getSelectedLabel(
                      paymentMethodFilters,
                      methodOptions,
                      'All Methods'
                    )}
                  </p>
                </div>

                <ChevronDown
                  className={`w-4 h-4 text-slate-500 mt-1 shrink-0 transition-transform ${
                    isMethodFilterOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {isMethodFilterOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white shadow-lg p-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Select methods
                  </p>
                  {paymentMethodFilters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethodFilters([])}
                      className="text-xs text-teal-700 hover:text-teal-800"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pt-3">
                  {methodOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 text-sm text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={paymentMethodFilters.includes(option.value)}
                        onChange={() =>
                          toggleFilterValue(
                            option.value,
                            paymentMethodFilters,
                            setPaymentMethodFilters
                          )
                        }
                        className="rounded border-slate-300"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Input
            type="date"
            label="Start Date"
            value={startDateFilter}
            onChange={(event) => setStartDateFilter(event.target.value)}
          />

          <Input
            type="date"
            label="End Date"
            value={endDateFilter}
            onChange={(event) => setEndDateFilter(event.target.value)}
          />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Transaction #
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Client
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Service(s)
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">
                  Total
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">
                  Paid
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">
                  Balance
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${
                    transaction.payment_status === 'Void'
                      ? 'bg-red-50/40 text-slate-500'
                      : ''
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">
                    {transaction.transaction_number}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600">
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-900">
                    {transaction.client_name}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600 max-w-xs">
                    <div className="space-y-1">
                      {transaction.items.map((item: any) => (
                        <div key={item.id}>
                          <p className="font-medium text-slate-700 truncate">
                            {item.service_name}
                          </p>
                          {(item.associate_name || item.referral_name) && (
                            <p className="text-xs text-slate-500 truncate">
                              {item.associate_name
                                ? `Associate: ${item.associate_name}`
                                : ''}
                              {item.associate_name && item.referral_name
                                ? ' | '
                                : ''}
                              {item.referral_name
                                ? `Referral: ${item.referral_name}`
                                : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-900 text-right">
                    ₱{Number(transaction.total_amount).toLocaleString()}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-900 text-right">
                    ₱{Number(transaction.total_paid).toLocaleString()}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-900 text-right">
                    ₱{Number(transaction.balance).toLocaleString()}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <Badge variant={getStatusVariant(getDisplayStatus(transaction))}>
                      {getDisplayStatus(transaction)}
                    </Badge>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewTransaction(transaction)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {transaction.payment_status !== 'Paid' &&
                        transaction.payment_status !== 'Void' && (
                          <button
                            onClick={() => handleOpenAddPayment(transaction)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="Add Payment"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        )}

                      {transaction.payment_status !== 'Void' && (
                        <button
                          onClick={() => handleOpenRefund(transaction)}
                          className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                          title="Refund"
                          disabled={Number(transaction.total_paid || 0) <= 0}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}

                      {transaction.payment_status !== 'Void' && (
                        <button
                          onClick={() => handleOpenEdit(transaction)}
                          className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                          title="Edit / Alter Transaction"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {transaction.payment_status !== 'Void' && (
                        <button
                          onClick={() => handleOpenVoid(transaction)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Void Transaction"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handlePrintReceipt(transaction)}
                        className="p-1 text-slate-600 hover:bg-slate-50 rounded"
                        title="Print Receipt"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleOpenAudit(transaction)}
                        className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                        title="Audit Trail"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No transactions found matching your filters.
          </div>
        )}
      </Card>

      {selectedTransaction && (
        <Modal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          title="Transaction Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600">Transaction Number</p>
                <p className="font-medium">
                  {selectedTransaction.transaction_number}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-600">Date</p>
                <p className="font-medium">
                  {new Date(
                    selectedTransaction.transaction_date
                  ).toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-600">Client</p>
                <p className="font-medium">{selectedTransaction.client_name}</p>
              </div>

              <div>
                <p className="text-sm text-slate-600">Created By</p>
                <p className="font-medium">{selectedTransaction.created_by}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Services</h4>

              <div className="space-y-2">
                {selectedTransaction.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="text-sm p-3 bg-slate-50 rounded"
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{item.service_name}</p>
                        <p className="text-slate-600">
                          {item.quantity} × ₱
                          {Number(item.unit_price).toLocaleString()}
                          {item.discount_amount > 0 &&
                            ` - ₱${Number(
                              item.discount_amount
                            ).toLocaleString()} discount`}
                        </p>
                      </div>

                      <p className="font-medium">
                        ₱{Number(item.line_total).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <UserRoundCheck className="w-3 h-3 text-teal-600" />
                        <span>
                          Associate:{' '}
                          <strong>{item.associate_name || 'Not selected'}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Share2 className="w-3 h-3 text-teal-600" />
                        <span>
                          Referral:{' '}
                          <strong>{item.referral_name || 'Not selected'}</strong>
                        </span>
                      </div>

                      {item.appointment_schedule && (
                        <div className="flex items-center gap-1 md:col-span-2">
                          <CalendarDays className="w-3 h-3 text-teal-600" />
                          <span>
                            Schedule:{' '}
                            <strong>
                              {formatScheduledService(item.appointment_schedule)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal:</span>
                <span>₱{Number(selectedTransaction.subtotal).toLocaleString()}</span>
              </div>

              {selectedTransaction.discount_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>
                    -₱
                    {Number(
                      selectedTransaction.discount_amount
                    ).toLocaleString()}
                  </span>
                </div>
              )}

              {selectedTransaction.tax_type === 'VAT' && (
                <>
                  <div className="flex justify-between">
                    <span>VATable Sales:</span>
                    <span>
                      {`\u20b1${Number(
                        selectedTransaction.subtotal || 0
                      ).toLocaleString()}`}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>VAT {Number(selectedTransaction.tax_rate || 0)}%:</span>
                    <span>
                      {`\u20b1${Number(
                        selectedTransaction.tax_amount || 0
                      ).toLocaleString()}`}
                    </span>
                  </div>
                </>
              )}

              {selectedTransaction.tax_type === 'NON_VAT' && (
                <div className="flex justify-between">
                  <span>VAT-EXEMPT SALE:</span>
                  <span>
                    {`\u20b1${Number(
                      selectedTransaction.subtotal || 0
                    ).toLocaleString()}`}
                  </span>
                </div>
              )}

              <div className="flex justify-between font-semibold text-lg">
                <span>Total:</span>
                <span>
                  ₱{Number(selectedTransaction.total_amount).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="text-green-600">
                  ₱{Number(selectedTransaction.total_paid).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Balance:</span>
                <span
                  className={
                    selectedTransaction.balance > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }
                >
                  ₱{Number(selectedTransaction.balance).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showAddPaymentModal}
          onClose={() => setShowAddPaymentModal(false)}
          title="Add Payment"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Amount:</span>
                <span className="font-semibold">
                  ₱{Number(selectedTransaction.total_amount).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">Already Paid:</span>
                <span className="text-green-600">
                  ₱{Number(selectedTransaction.total_paid).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between font-semibold text-lg">
                <span>Remaining Balance:</span>
                <span className="text-red-600">
                  ₱{Number(selectedTransaction.balance).toLocaleString()}
                </span>
              </div>
            </div>

            <Select
              label="Payment Method"
              options={methodOptions}
              value={paymentForm.method}
              onChange={(event) =>
                setPaymentForm({ ...paymentForm, method: event.target.value })
              }
            />

            <Input
              type="number"
              label="Amount"
              value={paymentForm.amount || ''}
              onChange={(event) =>
                setPaymentForm({
                  ...paymentForm,
                  amount: parseFloat(event.target.value) || 0
                })
              }
            />

            {paymentForm.method !== 'Cash' && (
              <Input
                label="Reference Number"
                value={paymentForm.reference}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    reference: event.target.value
                  })
                }
              />
            )}

            <Input
              label="Notes / Reason"
              value={paymentForm.notes}
              onChange={(event) =>
                setPaymentForm({ ...paymentForm, notes: event.target.value })
              }
            />

            <Button onClick={handleAddPayment} className="w-full">
              Add Payment
            </Button>
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showRefundModal}
          onClose={() => setShowRefundModal(false)}
          title="Record Refund"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg space-y-2">
              <p className="text-sm text-orange-800">
                Refunds are recorded as negative payments and kept in the audit
                trail.
              </p>

              <div className="flex justify-between">
                <span className="text-slate-600">Amount Paid:</span>
                <span className="font-semibold">
                  ₱{Number(selectedTransaction.total_paid).toLocaleString()}
                </span>
              </div>
            </div>

            <Select
              label="Refund Method"
              options={methodOptions}
              value={refundForm.method}
              onChange={(event) =>
                setRefundForm({ ...refundForm, method: event.target.value })
              }
            />

            <Input
              type="number"
              label="Refund Amount"
              value={refundForm.amount || ''}
              onChange={(event) =>
                setRefundForm({
                  ...refundForm,
                  amount: parseFloat(event.target.value) || 0
                })
              }
            />

            {refundForm.method !== 'Cash' && (
              <Input
                label="Reference Number"
                value={refundForm.reference}
                onChange={(event) =>
                  setRefundForm({
                    ...refundForm,
                    reference: event.target.value
                  })
                }
              />
            )}

            <Input
              label="Refund Reason"
              value={refundForm.reason}
              onChange={(event) =>
                setRefundForm({ ...refundForm, reason: event.target.value })
              }
              placeholder="Example: Client cancellation / overpayment correction"
            />

            <Button variant="danger" onClick={handleRefund} className="w-full">
              Record Refund
            </Button>
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit / Alter Transaction"
          size="xl"
        >
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              Editing is allowed for cashier mistakes, but every correction is
              recorded in the audit trail.
            </div>

            <Input
              label="Reason for Edit"
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              placeholder="Example: Wrong associate, referral, quantity, or service amount"
            />

            <Input
              label="Transaction Notes"
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
            />

            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">Service Items</h4>

              {editItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-600">Service</p>
                    <p className="font-medium text-slate-900">
                      {item.service_name}
                    </p>
                  </div>

                  <Input
                    type="number"
                    label="Qty"
                    value={item.quantity}
                    onChange={(event) =>
                      updateEditItem(
                        index,
                        'quantity',
                        Number(event.target.value) || 1
                      )
                    }
                  />

                  <Input
                    type="number"
                    label="Unit Price"
                    value={item.unit_price}
                    onChange={(event) =>
                      updateEditItem(
                        index,
                        'unit_price',
                        Number(event.target.value) || 0
                      )
                    }
                  />

                  <Input
                    type="number"
                    label="Discount"
                    value={item.discount_amount}
                    onChange={(event) =>
                      updateEditItem(
                        index,
                        'discount_amount',
                        Number(event.target.value) || 0
                      )
                    }
                  />

                  <div className="flex items-end">
                    <button
                      onClick={() => deleteEditItem(index)}
                      className="mb-1 p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Remove Item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="md:col-span-3">
                    <Select
                      label="Associate/s"
                      options={associateOptions}
                      value={item.associate_id || ''}
                      onChange={(event) =>
                        updateEditItem(index, 'associate_id', event.target.value)
                      }
                    />
                  </div>

                  <div className="md:col-span-3">
                    <Select
                      label="Referral Source"
                      options={referralOptions}
                      value={item.referral_id || ''}
                      onChange={(event) =>
                        updateEditItem(index, 'referral_id', event.target.value)
                      }
                    />
                  </div>

                  <div className="md:col-span-6 text-right text-sm font-semibold text-slate-700">
                    Line Total: ₱{Number(item.line_total).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={saveEditedTransaction} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save Changes with Audit Log
            </Button>
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showVoidModal}
          onClose={() => setShowVoidModal(false)}
          title="Void Transaction"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              This will void the transaction instead of deleting it. This is
              safer for clinic records and payment tracking.
            </div>

            <Input
              label="Reason for Voiding"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Example: Wrong client selected / duplicate transaction"
            />

            <Button variant="danger" onClick={voidTransaction} className="w-full">
              Void Transaction
            </Button>
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          title="Audit Trail"
          size="lg"
        >
          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No audit logs recorded yet for this transaction.
              </p>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold text-slate-900">{log.action}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>

                  <p className="text-sm text-slate-600 mt-1">
                    <strong>Reason:</strong> {log.reason || '-'}
                  </p>

                  {(log.new_data?.amount_added ||
                    log.new_data?.amount_subtracted ||
                    log.new_data?.payment_added) && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {log.new_data?.amount_added && (
                        <p className="text-green-700">
                          <strong>Amount added:</strong> ₱
                          {Number(log.new_data.amount_added).toLocaleString()}
                        </p>
                      )}

                      {log.new_data?.payment_added && (
                        <p className="text-green-700">
                          <strong>Payment added:</strong> ₱
                          {Number(log.new_data.payment_added).toLocaleString()}
                        </p>
                      )}

                      {log.new_data?.amount_subtracted && (
                        <p className="text-red-700">
                          <strong>Amount subtracted:</strong> ₱
                          {Number(
                            log.new_data.amount_subtracted
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-slate-600">
                    <strong>Performed by:</strong> {log.performed_by || '-'}
                  </p>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {selectedTransaction && (
        <Modal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          title="Receipt"
          size="md"
        >
          <div id="receipt-content" className="bg-white p-6 space-y-4">
            <div className="text-center border-b pb-4">
              {clinicSettings?.show_logo && clinicSettings?.logo_url && (
                <img
                  src={clinicSettings.logo_url}
                  alt="Clinic Logo"
                  className="w-20 h-20 object-cover rounded-xl mx-auto mb-3"
                />
              )}

              <h2 className="text-2xl font-semibold">
                {clinicSettings?.clinic_name || 'Psyzygy Psychological Center'}
              </h2>

              <p className="text-sm text-slate-600">
                {clinicSettings?.address || ''}
              </p>

              <p className="text-sm text-slate-600">
                {clinicSettings?.contact_number || ''}
              </p>

              {clinicSettings?.tin_number && (
                <p className="text-xs text-slate-500">
                  TIN: {clinicSettings.tin_number}
                </p>
              )}

              {selectedTransaction.tax_type === 'NON_VAT' && (
                <div className="mt-2 text-xs font-semibold text-slate-700">
                  <p>NON-VAT REGISTERED</p>
                  <p>VAT-EXEMPT SALE</p>
                </div>
              )}

              <p className="text-xs text-slate-500 mt-2">
                Acknowledgment Receipt
              </p>
            </div>

            <div className="text-sm space-y-1">
              <p>
                <strong>Transaction #:</strong>{' '}
                {selectedTransaction.transaction_number}
              </p>

              <p>
                <strong>Date:</strong>{' '}
                {new Date(
                  selectedTransaction.transaction_date
                ).toLocaleString()}
              </p>

              <p>
                <strong>Client:</strong> {selectedTransaction.client_name}
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Services:</h4>

              {selectedTransaction.items.map((item: any) => (
                <div key={item.id} className="mb-2 text-sm">
                  <div className="flex justify-between">
                    <span>
                      {item.service_name} × {item.quantity}
                    </span>

                    <span>₱{Number(item.line_total).toLocaleString()}</span>
                  </div>

                  {(item.associate_name ||
                    item.referral_name ||
                    item.appointment_schedule) && (
                    <div className="text-xs text-slate-500 ml-2 mt-1">
                      {item.associate_name && (
                        <p>Associate: {item.associate_name}</p>
                      )}
                      {item.referral_name && (
                        <p>Referral: {item.referral_name}</p>
                      )}
                      {item.appointment_schedule && (
                        <p>
                          Schedule:{' '}
                          {formatScheduledService(item.appointment_schedule)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>
                  ₱{Number(selectedTransaction.subtotal).toLocaleString()}
                </span>
              </div>

              {selectedTransaction.discount_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>
                    -₱
                    {Number(
                      selectedTransaction.discount_amount
                    ).toLocaleString()}
                  </span>
                </div>
              )}

              {selectedTransaction.tax_type === 'VAT' && (
                <>
                  <div className="flex justify-between">
                    <span>VATable Sales:</span>
                    <span>
                      {`\u20b1${Number(
                        selectedTransaction.subtotal || 0
                      ).toLocaleString()}`}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>VAT {Number(selectedTransaction.tax_rate || 0)}%:</span>
                    <span>
                      {`\u20b1${Number(
                        selectedTransaction.tax_amount || 0
                      ).toLocaleString()}`}
                    </span>
                  </div>
                </>
              )}

              {selectedTransaction.tax_type === 'NON_VAT' && (
                <div className="flex justify-between">
                  <span>VAT-EXEMPT SALE:</span>
                  <span>
                    {`\u20b1${Number(
                      selectedTransaction.subtotal || 0
                    ).toLocaleString()}`}
                  </span>
                </div>
              )}

              <div className="flex justify-between font-semibold text-lg">
                <span>Total:</span>
                <span>
                  ₱{Number(selectedTransaction.total_amount).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span>
                  ₱{Number(selectedTransaction.total_paid).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Balance:</span>
                <span>₱{Number(selectedTransaction.balance).toLocaleString()}</span>
              </div>
            </div>

            {selectedTransaction.payments.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Payment Details:</h4>

                {selectedTransaction.payments.map((payment) => (
                  <div key={payment.id} className="text-sm">
                    <p>
                      {payment.payment_method}: ₱
                      {Number(payment.amount).toLocaleString()}
                      {payment.reference_number
                        ? ` | Ref: ${payment.reference_number}`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-slate-500 text-center border-t pt-4">
              {clinicSettings?.receipt_footer ||
                'This receipt acknowledges payment received for psychological services rendered. This is not a psychological report or clinical certification.'}
            </div>

            <Button onClick={printReceipt} className="w-full print:hidden">
              <Printer className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
