export type TaxType = 'VAT' | 'NON_VAT' | 'NONE';

export interface TaxSettings {
  tax_enabled?: boolean | null;
  tax_type?: TaxType | string | null;
  tax_rate?: number | string | null;
  tax_inclusive?: boolean | null;
  bir_registered?: boolean | null;
  tin_number?: string | null;
  receipt_footer?: string | null;
}

export interface TaxComputation {
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  taxType: TaxType;
  taxEnabled: boolean;
  taxInclusive: boolean;
  taxableSales: number;
  isVat: boolean;
  isNonVat: boolean;
  receiptLines: string[];
}

const ALLOWED_TAX_TYPES: TaxType[] = ['VAT', 'NON_VAT', 'NONE'];

export const roundCurrency = (amount: number) =>
  Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;

export const normalizeTaxSettings = (settings?: TaxSettings | null) => {
  const configuredType = String(settings?.tax_type || 'NON_VAT').toUpperCase();
  const taxType = ALLOWED_TAX_TYPES.includes(configuredType as TaxType)
    ? (configuredType as TaxType)
    : 'NON_VAT';

  return {
    taxEnabled: settings?.tax_enabled !== false,
    taxType,
    taxRate: Number(settings?.tax_rate ?? 12) || 0,
    taxInclusive: settings?.tax_inclusive !== false,
    birRegistered: Boolean(settings?.bir_registered),
    tinNumber: settings?.tin_number || ''
  };
};

export const taxService = {
  computeTax(amount: number, settings?: TaxSettings | null): TaxComputation {
    const normalized = normalizeTaxSettings(settings);
    const saleAmount = roundCurrency(Math.max(Number(amount || 0), 0));
    const rateDecimal = normalized.taxRate / 100;

    if (!normalized.taxEnabled || normalized.taxType === 'NONE') {
      return {
        subtotal: saleAmount,
        tax: 0,
        total: saleAmount,
        taxRate: 0,
        taxType: 'NONE',
        taxEnabled: false,
        taxInclusive: normalized.taxInclusive,
        taxableSales: saleAmount,
        isVat: false,
        isNonVat: false,
        receiptLines: []
      };
    }

    if (normalized.taxType === 'NON_VAT') {
      return {
        subtotal: saleAmount,
        tax: 0,
        total: saleAmount,
        taxRate: 0,
        taxType: 'NON_VAT',
        taxEnabled: true,
        taxInclusive: normalized.taxInclusive,
        taxableSales: saleAmount,
        isVat: false,
        isNonVat: true,
        receiptLines: ['NON-VAT REGISTERED', 'VAT-EXEMPT SALE']
      };
    }

    if (normalized.taxInclusive) {
      const subtotal = roundCurrency(saleAmount / (1 + rateDecimal));
      const tax = roundCurrency(saleAmount - subtotal);

      return {
        subtotal,
        tax,
        total: saleAmount,
        taxRate: normalized.taxRate,
        taxType: 'VAT',
        taxEnabled: true,
        taxInclusive: true,
        taxableSales: subtotal,
        isVat: true,
        isNonVat: false,
        receiptLines: ['VATable Sales', `VAT ${normalized.taxRate}%`]
      };
    }

    const subtotal = saleAmount;
    const tax = roundCurrency(subtotal * rateDecimal);

    return {
      subtotal,
      tax,
      total: roundCurrency(subtotal + tax),
      taxRate: normalized.taxRate,
      taxType: 'VAT',
      taxEnabled: true,
      taxInclusive: false,
      taxableSales: subtotal,
      isVat: true,
      isNonVat: false,
      receiptLines: ['VATable Sales', `VAT ${normalized.taxRate}%`]
    };
  },

  getTaxSummaryLabel(settings?: TaxSettings | null) {
    const normalized = normalizeTaxSettings(settings);

    if (!normalized.taxEnabled || normalized.taxType === 'NONE') {
      return 'Tax Disabled';
    }

    if (normalized.taxType === 'NON_VAT') {
      return 'VAT-EXEMPT';
    }

    return `VAT ${normalized.taxRate}%`;
  },

  getReceiptRegistrationLines(settings?: TaxSettings | null) {
    const normalized = normalizeTaxSettings(settings);
    const lines: string[] = [];

    if (normalized.tinNumber) {
      lines.push(`TIN: ${normalized.tinNumber}`);
    }

    if (normalized.taxEnabled && normalized.taxType === 'NON_VAT') {
      lines.push('NON-VAT REGISTERED', 'VAT-EXEMPT SALE');
    }

    return lines;
  }
};
