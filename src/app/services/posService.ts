import { settingsService } from './settingsService';
import { associateService } from './associateService';
import { referralService } from './referralService';
import { roundCurrency, taxService, type TaxSettings } from './tax.service';

export interface CartItem {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  discountTypeId: string;
  discountTypeName: string;
  discount: number;
  associateId: string;
  associateName: string;
  referralId: string;
  referralName: string;
}

export interface PaymentRow {
  method: string;
  amount: number;
  reference: string;
}

export const posService = {
  async loadPOSSettings() {
    const [
      methodsData,
      discountsData,
      settingsData,
      associatesData,
      referralsData
    ] = await Promise.all([
      settingsService.getPaymentMethods(),
      settingsService.getDiscountTypes(),
      settingsService.getClinicSettings(),
      associateService.getAssociates(),
      referralService.getReferrals()
    ]);

    return {
      paymentMethods: methodsData.filter((method: any) => method.is_active),
      discountTypes: discountsData.filter((discount: any) => discount.is_active),
      clinicSettings: settingsData,
      associates: associatesData.filter((associate: any) => associate.is_active),
      referrals: referralsData.filter((referral: any) => referral.is_active)
    };
  },

  getPaymentMethodOptions(paymentMethods: any[]) {
    if (paymentMethods.length > 0) {
      return paymentMethods.map((method) => ({
        value: method.name,
        label: method.name
      }));
    }

    return [
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
  },

  getDiscountTypeOptions(discountTypes: any[]) {
    return [
      { value: '', label: 'No discount' },
      ...discountTypes.map((discount) => ({
        value: discount.id,
        label: `${discount.name}${
          discount.percentage ? ` (${discount.percentage}%)` : ''
        }${
          discount.fixed_amount
            ? ` (₱${Number(discount.fixed_amount).toLocaleString()})`
            : ''
        }`
      }))
    ];
  },

  getAssociateOptions(associates: any[]) {
    return [
      { value: '', label: 'No associate selected' },
      ...associates.map((associate) => ({
        value: associate.id,
        label: `${associate.full_name}${
          associate.title ? `, ${associate.title}` : ''
        }`
      }))
    ];
  },

  getReferralOptions(referrals: any[]) {
    return [
      { value: '', label: 'No referral selected' },
      ...referrals.map((referral) => ({
        value: referral.id,
        label: `${referral.referral_name}${
          referral.referral_type ? ` (${referral.referral_type})` : ''
        }`
      }))
    ];
  },

  calculateDiscountAmount(
    price: number,
    quantity: number,
    discountType: any,
    manualAmount: string
  ) {
    const grossAmount = price * quantity;
    const manual = manualAmount ? Number(manualAmount) : 0;

    if (manual > 0) {
      return Math.min(manual, grossAmount);
    }

    if (!discountType) {
      return 0;
    }

    if (discountType.percentage) {
      return Math.min(
        grossAmount * (Number(discountType.percentage) / 100),
        grossAmount
      );
    }

    if (discountType.fixed_amount) {
      return Math.min(Number(discountType.fixed_amount), grossAmount);
    }

    return 0;
  },

  calculateCartTotals(cart: CartItem[]) {
    const subtotal = roundCurrency(cart.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    ));

    const totalDiscount = roundCurrency(cart.reduce(
      (sum, item) => sum + Number(item.discount || 0),
      0
    ));

    const total = roundCurrency(Math.max(subtotal - totalDiscount, 0));

    return {
      subtotal,
      totalDiscount,
      total
    };
  },

  calculateTaxTotals(cart: CartItem[], settings?: TaxSettings | null) {
    const cartTotals = this.calculateCartTotals(cart);
    const taxBreakdown = taxService.computeTax(cartTotals.total, settings);

    return {
      ...cartTotals,
      taxBreakdown,
      taxSubtotal: taxBreakdown.subtotal,
      taxAmount: taxBreakdown.tax,
      grandTotal: taxBreakdown.total
    };
  },

  calculatePaymentTotals(total: number, paymentRows: PaymentRow[]) {
    const totalPaid = roundCurrency(paymentRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    ));

    const balance = roundCurrency(Math.max(total - totalPaid, 0));
    const change = totalPaid > total ? roundCurrency(totalPaid - total) : 0;

    const paymentStatus =
      totalPaid === 0 ? 'Unpaid' : totalPaid < total ? 'Partial' : 'Paid';

    return {
      totalPaid,
      balance,
      change,
      paymentStatus
    };
  },

  buildTransactionItems(cart: CartItem[]) {
    return cart.map((item, index) => ({
      id: String(index + 1),
      transaction_id: '',
      service_id: item.serviceId,
      service_name: item.serviceName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: item.discount,
      line_total: roundCurrency(item.quantity * item.unitPrice - item.discount),
      associate_id: item.associateId || null,
      associate_name: item.associateName || null,
      referral_id: item.referralId || null,
      referral_name: item.referralName || null
    }));
  },

  buildPayments(paymentRows: PaymentRow[]) {
    return paymentRows
      .filter((payment) => Number(payment.amount) > 0)
      .map((payment, index) => ({
        id: String(index + 1),
        transaction_id: '',
        payment_method: payment.method,
        amount: Number(payment.amount),
        reference_number: payment.reference,
        payment_date: new Date().toISOString(),
        received_by: 'Admin User',
        notes: '',
        created_at: new Date().toISOString()
      }));
  },

  buildReceiptSnapshot({
    selectedClientId,
    selectedClient,
    subtotal,
    grossSubtotal,
    totalDiscount,
    total,
    taxBreakdown,
    totalPaid,
    balance,
    paymentStatus,
    transactionNotes,
    items,
    payments
  }: any) {
    return {
      id: crypto.randomUUID(),
      transaction_number: `SAVED-${new Date().getTime()}`,
      client_id: selectedClientId,
      client_name: selectedClient?.full_name || '',
      transaction_date: new Date().toISOString(),
      subtotal,
      gross_subtotal: grossSubtotal ?? subtotal,
      discount_amount: totalDiscount,
      tax_amount: taxBreakdown?.tax || 0,
      tax_rate: taxBreakdown?.taxRate || 0,
      tax_type: taxBreakdown?.taxType || 'NON_VAT',
      tax_inclusive: taxBreakdown?.taxInclusive ?? true,
      grand_total: taxBreakdown?.total ?? total,
      taxable_sales: taxBreakdown?.taxableSales ?? total,
      total_amount: taxBreakdown?.total ?? total,
      total_paid: totalPaid,
      balance,
      payment_status: paymentStatus,
      notes: transactionNotes,
      created_by: 'Admin User',
      items,
      payments
    };
  }
};
