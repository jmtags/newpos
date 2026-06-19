import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useAppContext, Client } from '../context/AppContext';
import { auditService } from '../services/auditService';
import { posService, CartItem, PaymentRow } from '../services/posService';
import { taxService } from '../services/tax.service';
import {
  Plus,
  Trash2,
  Printer,
  X,
  Receipt,
  Percent,
  UserRoundCheck,
  Share2,
  Search
} from 'lucide-react';

const formatCurrency = (amount: number) =>
  `\u20b1${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

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

export const POS: React.FC = () => {
  const { clients, services, addTransaction, addClient } = useAppContext();

  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [selectedDiscountTypeId, setSelectedDiscountTypeId] = useState('');
  const [manualDiscount, setManualDiscount] = useState('');
  const [selectedAssociateId, setSelectedAssociateId] = useState('');
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [transactionNotes, setTransactionNotes] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { method: 'Cash', amount: 0, reference: '' }
  ]);

  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [discountTypes, setDiscountTypes] = useState<any[]>([]);
  const [associates, setAssociates] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [clinicSettings, setClinicSettings] = useState<any>(null);

  const [showClientSearchModal, setShowClientSearchModal] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientSexFilter, setClientSexFilter] = useState('');
  const [clientStatusFilter, setClientStatusFilter] = useState('');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<any>(null);
  const [saving, setSaving] = useState(false);

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

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedDiscountType = discountTypes.find(
    (d) => d.id === selectedDiscountTypeId
  );
  const selectedAssociate = associates.find((a) => a.id === selectedAssociateId);
  const selectedReferral = referrals.find((r) => r.id === selectedReferralId);

  const filteredClients = useMemo(() => {
    const search = clientSearchTerm.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesSearch =
        !search ||
        client.full_name.toLowerCase().includes(search) ||
        client.client_code.toLowerCase().includes(search) ||
        client.contact_number.toLowerCase().includes(search) ||
        client.email.toLowerCase().includes(search);

      const matchesSex = !clientSexFilter || client.sex === clientSexFilter;
      const isActive = client.consent_status && client.privacy_acknowledged;
      const matchesStatus =
        !clientStatusFilter ||
        (clientStatusFilter === 'active' && isActive) ||
        (clientStatusFilter === 'pending' && !isActive);

      return matchesSearch && matchesSex && matchesStatus;
    });
  }, [clients, clientSearchTerm, clientSexFilter, clientStatusFilter]);

  useEffect(() => {
    loadPOSSettings();
  }, []);

  const loadPOSSettings = async () => {
    try {
      const settings = await posService.loadPOSSettings();

      setPaymentMethods(settings.paymentMethods);
      setDiscountTypes(settings.discountTypes);
      setClinicSettings(settings.clinicSettings);
      setAssociates(settings.associates);
      setReferrals(settings.referrals);

      if (settings.paymentMethods.length > 0) {
        setPaymentRows([
          {
            method: settings.paymentMethods[0].name,
            amount: 0,
            reference: ''
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading POS settings:', error);
    }
  };

  const paymentMethodOptions =
    posService.getPaymentMethodOptions(paymentMethods);

  const discountTypeOptions =
    posService.getDiscountTypeOptions(discountTypes);

  const associateOptions = posService.getAssociateOptions(associates);

  const referralOptions = posService.getReferralOptions(referrals);

  const previewPrice = selectedService
    ? customPrice
      ? Number(customPrice)
      : Number(selectedService.default_price)
    : 0;

  const previewDiscount = posService.calculateDiscountAmount(
    previewPrice,
    quantity,
    selectedDiscountType,
    manualDiscount
  );

  const {
    subtotal,
    totalDiscount,
    taxBreakdown,
    taxSubtotal,
    taxAmount,
    grandTotal
  } = useMemo(() => {
    return posService.calculateTaxTotals(cart, clinicSettings);
  }, [cart, clinicSettings]);

  const { totalPaid, balance, change, paymentStatus } = useMemo(() => {
    return posService.calculatePaymentTotals(grandTotal, paymentRows);
  }, [grandTotal, paymentRows]);

  const taxSummaryLabel = taxService.getTaxSummaryLabel(clinicSettings);
  const total = grandTotal;

  const addToCart = () => {
    if (!selectedServiceId || quantity <= 0) return;

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) return;

    const price = customPrice
      ? Number(customPrice)
      : Number(service.default_price);

    const discount = posService.calculateDiscountAmount(
      price,
      quantity,
      selectedDiscountType,
      manualDiscount
    );

    setCart([
      ...cart,
      {
        serviceId: service.id,
        serviceName: service.name,
        quantity,
        unitPrice: price,
        discountTypeId: selectedDiscountTypeId,
        discountTypeName: selectedDiscountType?.name || '',
        discount,
        associateId: selectedAssociateId,
        associateName: selectedAssociate?.full_name || '',
        referralId: selectedReferralId,
        referralName: selectedReferral?.referral_name || ''
      }
    ]);

    setSelectedServiceId('');
    setQuantity(1);
    setCustomPrice('');
    setSelectedDiscountTypeId('');
    setManualDiscount('');
    setSelectedAssociateId('');
    setSelectedReferralId('');
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const addPaymentRow = () => {
    setPaymentRows([
      ...paymentRows,
      {
        method: paymentMethodOptions[0]?.value || 'Cash',
        amount: 0,
        reference: ''
      }
    ]);
  };

  const removePaymentRow = (index: number) => {
    if (paymentRows.length > 1) {
      setPaymentRows(paymentRows.filter((_, i) => i !== index));
    }
  };

  const updatePaymentRow = (
    index: number,
    field: keyof PaymentRow,
    value: string | number
  ) => {
    const updated = [...paymentRows];

    updated[index] = {
      ...updated[index],
      [field]: value
    };

    setPaymentRows(updated);
  };

  const saveTransaction = async (printReceipt = false) => {
    if (!selectedClientId || cart.length === 0) {
      alert('Please select a client and add services to the cart.');
      return;
    }

    try {
      setSaving(true);

      const items = posService.buildTransactionItems(cart);
      const payments = posService.buildPayments(paymentRows);

      const receiptSnapshot = posService.buildReceiptSnapshot({
        selectedClientId,
        selectedClient,
        subtotal: taxSubtotal,
        grossSubtotal: subtotal,
        totalDiscount,
        total: grandTotal,
        taxBreakdown,
        totalPaid,
        balance,
        paymentStatus,
        transactionNotes,
        items,
        payments
      });

      const savedTransaction = await addTransaction({
        client_id: selectedClientId,
        client_name: selectedClient?.full_name,
        transaction_date: receiptSnapshot.transaction_date,
        subtotal: taxSubtotal,
        discount_amount: totalDiscount,
        tax_amount: taxAmount,
        tax_rate: taxBreakdown.taxRate,
        tax_type: taxBreakdown.taxType,
        grand_total: grandTotal,
        total_amount: grandTotal,
        total_paid: totalPaid,
        balance,
        payment_status: paymentStatus as 'Paid' | 'Partial' | 'Unpaid',
        notes: transactionNotes,
        created_by: 'Admin User',
        items,
        payments
      });

      await auditService.addLog({
        table_name: 'transactions',
        record_id: savedTransaction?.id,
        action: 'CREATE_SALE',
        old_data: null,
        new_data: {
          transaction: receiptSnapshot,
          amount_added: grandTotal,
          tax_added: taxAmount,
          payment_added: totalPaid,
          balance_after: balance
        },
        reason: transactionNotes || 'New sale transaction recorded',
        performed_by: 'Admin User'
      });

      if (printReceipt) {
        setCompletedTransaction(receiptSnapshot);
        setShowReceiptModal(true);
      } else {
        alert('Transaction saved successfully.');
      }

      resetForm();
    } catch (error: any) {
      console.error('Error saving transaction:', error);
      alert(`Error saving transaction: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedServiceId('');
    setQuantity(1);
    setCustomPrice('');
    setSelectedDiscountTypeId('');
    setManualDiscount('');
    setSelectedAssociateId('');
    setSelectedReferralId('');
    setCart([]);
    setPaymentRows([
      {
        method: paymentMethodOptions[0]?.value || 'Cash',
        amount: 0,
        reference: ''
      }
    ]);
    setTransactionNotes('');
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClientId(client.id);
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

    await addClient({
      ...newClient,
      age
    });

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

  const printReceipt = () => {
    window.print();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Client Information
          </h3>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Client
              </label>
              <div className="flex gap-2">
                <Select
                  aria-label="Select Client"
                  options={[
                    { value: '', label: 'Select a client...' },
                    ...clients.map((client) => ({
                      value: client.id,
                      label: client.full_name
                    }))
                  ]}
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className="flex-1"
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowClientSearchModal(true)}
                  className="px-3"
                  title="Search clients"
                  aria-label="Search clients"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setShowAddClientModal(true)}
              className="md:mt-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Client
            </Button>
          </div>

          {selectedClient && (
            <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm">
              <p>
                <strong>Contact:</strong> {selectedClient.contact_number || '-'} |{' '}
                {selectedClient.email || '-'}
              </p>
              <p>
                <strong>Age:</strong> {selectedClient.age || '-'} |{' '}
                <strong>Sex:</strong> {selectedClient.sex || '-'}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Add Service
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Service"
              options={[
                { value: '', label: 'Select a service...' },
                ...services
                  .filter((service) => service.is_active)
                  .map((service) => ({
                    value: service.id,
                    label: `${service.name} - ₱${Number(
                      service.default_price
                    ).toLocaleString()}`
                  }))
              ]}
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            />

            <Input
              type="number"
              label="Quantity"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value) || 1)}
              min="1"
            />

            <Input
              type="number"
              label="Custom Price"
              placeholder={selectedService?.default_price?.toString() || '0'}
              value={customPrice}
              onChange={(event) => setCustomPrice(event.target.value)}
            />

            <Select
              label="Discount Type"
              options={discountTypeOptions}
              value={selectedDiscountTypeId}
              onChange={(event) => setSelectedDiscountTypeId(event.target.value)}
            />

            <Input
              type="number"
              label="Manual Discount Amount"
              placeholder="Optional override"
              value={manualDiscount}
              onChange={(event) => setManualDiscount(event.target.value)}
            />

            <div className="flex items-end">
              <div className="w-full p-3 bg-teal-50 border border-teal-100 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-teal-700">
                  <Percent className="w-4 h-4" />
                  Discount Preview
                </div>
                <p className="text-lg font-semibold text-teal-900">
                  ₱{previewDiscount.toLocaleString()}
                </p>
              </div>
            </div>

            <Select
              label="Associate/s"
              options={associateOptions}
              value={selectedAssociateId}
              onChange={(event) => setSelectedAssociateId(event.target.value)}
            />

            <Select
              label="Referral Source"
              options={referralOptions}
              value={selectedReferralId}
              onChange={(event) => setSelectedReferralId(event.target.value)}
            />
          </div>

          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-600">
            <div className="flex items-center gap-2 mb-1">
              <UserRoundCheck className="w-4 h-4 text-teal-600" />
              <span>
                Associate:{' '}
                <strong>{selectedAssociate?.full_name || 'Not selected'}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-teal-600" />
              <span>
                Referral:{' '}
                <strong>{selectedReferral?.referral_name || 'Not selected'}</strong>
              </span>
            </div>
          </div>

          <Button
            onClick={addToCart}
            className="mt-4"
            disabled={!selectedServiceId}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add to Cart
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Cart</h3>

          {cart.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              No services added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {cart.map((item, index) => (
                <div
                  key={`${item.serviceId}-${index}`}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {item.serviceName}
                    </p>

                    <p className="text-sm text-slate-600">
                      {item.quantity} × ₱{item.unitPrice.toLocaleString()}
                    </p>

                    {item.discount > 0 && (
                      <p className="text-sm text-red-600">
                        Discount:{' '}
                        {item.discountTypeName
                          ? `${item.discountTypeName} - `
                          : ''}
                        ₱{item.discount.toLocaleString()}
                      </p>
                    )}

                    <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                      <p>
                        Associate:{' '}
                        <span className="font-medium">
                          {item.associateName || 'Not selected'}
                        </span>
                      </p>
                      <p>
                        Referral:{' '}
                        <span className="font-medium">
                          {item.referralName || 'Not selected'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-slate-900">
                      ₱
                      {(
                        item.quantity * item.unitPrice -
                        item.discount
                      ).toLocaleString()}
                    </p>

                    <button
                      onClick={() => removeFromCart(index)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <Input
            label="Transaction Notes"
            placeholder="Optional notes..."
            value={transactionNotes}
            onChange={(event) => setTransactionNotes(event.target.value)}
          />
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-6 sticky top-24">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Transaction Summary
          </h3>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-slate-600">
              <span>Services Subtotal:</span>
              <span>₱{subtotal.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Discount:</span>
              <span className="text-red-600">
                -₱{totalDiscount.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between text-slate-600 pt-3 border-t">
              <span>{taxBreakdown.isVat ? 'VATable Sales:' : 'Subtotal:'}</span>
              <span>{formatCurrency(taxSubtotal)}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>{taxSummaryLabel}:</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>

            {taxBreakdown.isNonVat && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800">
                NON-VAT REGISTERED - VAT-EXEMPT SALE
              </div>
            )}

            <div className="flex justify-between text-lg font-semibold text-slate-900 pt-3 border-t">
              <span>Grand Total:</span>
              <span>₱{total.toLocaleString()}</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-900">Payment</h4>

              <Button size="sm" variant="outline" onClick={addPaymentRow}>
                <Plus className="w-3 h-3 mr-1" />
                Add Payment
              </Button>
            </div>

            <div className="space-y-3">
              {paymentRows.map((payment, index) => (
                <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <Select
                      options={paymentMethodOptions}
                      value={payment.method}
                      onChange={(event) =>
                        updatePaymentRow(index, 'method', event.target.value)
                      }
                      className="flex-1"
                    />

                    {paymentRows.length > 1 && (
                      <button
                        onClick={() => removePaymentRow(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <Input
                    type="number"
                    placeholder="Amount"
                    value={payment.amount || ''}
                    onChange={(event) =>
                      updatePaymentRow(
                        index,
                        'amount',
                        Number(event.target.value) || 0
                      )
                    }
                  />

                  {payment.method !== 'Cash' && (
                    <Input
                      placeholder="Reference Number"
                      value={payment.reference}
                      onChange={(event) =>
                        updatePaymentRow(index, 'reference', event.target.value)
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-slate-600">
              <span>Total Paid:</span>
              <span>₱{totalPaid.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Balance:</span>
              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                ₱{balance.toLocaleString()}
              </span>
            </div>

            {change > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Change:</span>
                <span>₱{change.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2">
              <Badge
                variant={
                  paymentStatus === 'Paid'
                    ? 'success'
                    : paymentStatus === 'Partial'
                    ? 'warning'
                    : 'danger'
                }
              >
                {paymentStatus}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => saveTransaction(false)}
              className="w-full"
              disabled={cart.length === 0 || !selectedClientId || saving}
            >
              {saving ? 'Saving...' : 'Save Transaction'}
            </Button>

            <Button
              onClick={() => saveTransaction(true)}
              variant="secondary"
              className="w-full"
              disabled={cart.length === 0 || !selectedClientId || saving}
            >
              <Printer className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save & Print Receipt'}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        title="Add New Client"
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            options={[
              { value: 'Male', label: 'Male' },
              { value: 'Female', label: 'Female' },
              { value: 'Other', label: 'Other' }
            ]}
            value={newClient.sex}
            onChange={(event) =>
              setNewClient({
                ...newClient,
                sex: event.target.value as 'Male' | 'Female' | 'Other'
              })
            }
          />

          <Input
            label="Contact Number"
            value={newClient.contact_number}
            onChange={(event) =>
              setNewClient({
                ...newClient,
                contact_number: event.target.value
              })
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

          <div className="md:col-span-2 flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowAddClientModal(false)}
            >
              Cancel
            </Button>

            <Button onClick={handleAddClient}>Add Client</Button>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-[35px] text-slate-400 w-4 h-4" />
              <Input
                label="Search"
                placeholder="Name, client ID, contact, or email"
                value={clientSearchTerm}
                onChange={(event) => setClientSearchTerm(event.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              label="Sex"
              options={[
                { value: '', label: 'All' },
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' }
              ]}
              value={clientSexFilter}
              onChange={(event) => setClientSexFilter(event.target.value)}
            />

            <Select
              label="Status"
              options={[
                { value: '', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'pending', label: 'Pending' }
              ]}
              value={clientStatusFilter}
              onChange={(event) => setClientStatusFilter(event.target.value)}
            />
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                    Client ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                    Full Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                    Age / Sex
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                    Contact
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                    Email
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${
                      selectedClientId === client.id ? 'bg-teal-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-sm text-slate-900">
                      {client.client_code || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">
                      {client.full_name}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {client.age || '-'} / {client.sex || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {client.contact_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {client.email || '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          selectedClientId === client.id ? 'secondary' : 'primary'
                        }
                        onClick={() => handleSelectClient(client)}
                      >
                        {selectedClientId === client.id ? 'Selected' : 'Select'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredClients.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                No clients found matching your filters.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {completedTransaction && (
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

              {completedTransaction.tax_type === 'NON_VAT' && (
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
                {completedTransaction.transaction_number}
              </p>

              <p>
                <strong>Date:</strong>{' '}
                {new Date(completedTransaction.transaction_date).toLocaleString()}
              </p>

              <p>
                <strong>Client:</strong> {completedTransaction.client_name}
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Services:</h4>

              {completedTransaction.items.map((item: any) => (
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
                <span>₱{completedTransaction.subtotal.toLocaleString()}</span>
              </div>

              {completedTransaction.discount_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>
                    -₱{completedTransaction.discount_amount.toLocaleString()}
                  </span>
                </div>
              )}

              {completedTransaction.tax_type === 'VAT' && (
                <>
                  <div className="flex justify-between">
                    <span>VATable Sales:</span>
                    <span>{formatCurrency(completedTransaction.taxable_sales)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>VAT {Number(completedTransaction.tax_rate || 0)}%:</span>
                    <span>{formatCurrency(completedTransaction.tax_amount)}</span>
                  </div>
                </>
              )}

              {completedTransaction.tax_type === 'NON_VAT' && (
                <div className="flex justify-between">
                  <span>VAT-EXEMPT SALE:</span>
                  <span>{formatCurrency(completedTransaction.subtotal)}</span>
                </div>
              )}

              <div className="flex justify-between font-semibold text-lg">
                <span>Total:</span>
                <span>₱{completedTransaction.total_amount.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span>₱{completedTransaction.total_paid.toLocaleString()}</span>
              </div>

              <div className="flex justify-between">
                <span>Balance:</span>
                <span>₱{completedTransaction.balance.toLocaleString()}</span>
              </div>
            </div>

            {completedTransaction.payments.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Payment Details:</h4>

                {completedTransaction.payments.map((payment: any) => (
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
              <Receipt className="w-4 h-4 mx-auto mb-1" />
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
