import React, { useMemo, useState } from 'react';
import { CalendarDays, Download, Printer } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { useAppContext } from '../context/AppContext';

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface ReportFilter {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  fromMonth: string;
  toMonth: string;
  monthYear: string;
  fromYear: string;
  toYear: string;
}

const periodLabels: Record<ReportPeriod, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly'
};

const monthOptions = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const formatCurrency = (amount: number) => `PHP ${amount.toLocaleString()}`;

const getRefundPayments = (transaction: any) =>
  transaction.payments.filter((payment: any) => Number(payment.amount || 0) < 0);

const getRefundReason = (notes: string) =>
  notes?.replace(/^Refund:\s*/i, '') || '-';

const isVoidedTransaction = (transaction: any) =>
  Boolean(transaction.is_void) || transaction.payment_status === 'Void';

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

const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const createDefaultFilter = (period: ReportPeriod = 'daily'): ReportFilter => {
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);

  return {
    period,
    startDate: toDateInputValue(period === 'weekly' ? startOfWeek : startOfToday),
    endDate: toDateInputValue(period === 'weekly' ? endOfWeek : startOfToday),
    fromMonth: String(today.getMonth() + 1),
    toMonth: String(today.getMonth() + 1),
    monthYear: String(today.getFullYear()),
    fromYear: String(today.getFullYear()),
    toYear: String(today.getFullYear())
  };
};

const getDateRange = (filter: ReportFilter) => {
  if (filter.period === 'monthly') {
    const fromMonthIndex = Number(filter.fromMonth) - 1;
    const toMonthIndex = Number(filter.toMonth) - 1;
    const year = Number(filter.monthYear);

    return {
      start: new Date(year, fromMonthIndex, 1),
      end: endOfDay(new Date(year, toMonthIndex + 1, 0))
    };
  }

  if (filter.period === 'yearly') {
    const fromYear = Number(filter.fromYear);
    const toYear = Number(filter.toYear);

    return {
      start: new Date(fromYear, 0, 1),
      end: endOfDay(new Date(toYear, 11, 31))
    };
  }

  return {
    start: new Date(`${filter.startDate}T00:00:00`),
    end: endOfDay(new Date(`${filter.endDate}T00:00:00`))
  };
};

const getFilterLabel = (filter: ReportFilter) => {
  const { start, end } = getDateRange(filter);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
};

export const Reports: React.FC = () => {
  const { transactions, clients, services } = useAppContext();
  const [appliedFilter, setAppliedFilter] = useState<ReportFilter>(
    createDefaultFilter('daily')
  );
  const [draftFilter, setDraftFilter] = useState<ReportFilter>(appliedFilter);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const yearOptions = useMemo(() => {
    const transactionYears = transactions.map((transaction) =>
      new Date(transaction.transaction_date).getFullYear()
    );
    const currentYear = new Date().getFullYear();
    const minYear = Math.min(currentYear, ...transactionYears);
    const maxYear = Math.max(currentYear, ...transactionYears);

    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => {
      const year = String(minYear + index);
      return { value: year, label: year };
    }).reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const { start, end } = getDateRange(appliedFilter);

    return transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transaction_date);
      return transactionDate >= start && transactionDate <= end;
    });
  }, [appliedFilter, transactions]);

  const stats = useMemo(() => {
    const activeTransactions = filteredTransactions.filter(
      (transaction) => !isVoidedTransaction(transaction)
    );

    const voidedTransactions = filteredTransactions.filter(isVoidedTransaction);
    const voidedSales = voidedTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.total_amount || 0),
      0
    );

    const refundedItems = activeTransactions.flatMap((transaction) =>
      getRefundPayments(transaction).map((payment: any) => ({
        transaction,
        payment,
        refundAmount: Math.abs(Number(payment.amount || 0))
      }))
    );

    const totalRefunded = refundedItems.reduce(
      (sum, item) => sum + item.refundAmount,
      0
    );

    const periodSales = activeTransactions.reduce(
      (sum, transaction) => sum + transaction.total_amount,
      0
    );

    const periodPayments = activeTransactions.reduce(
      (sum, transaction) =>
        sum +
        transaction.payments
          .filter((payment) => Number(payment.amount || 0) > 0)
          .reduce(
            (paymentSum, payment) => paymentSum + Number(payment.amount || 0),
            0
          ),
      0
    );

    const netSales = periodSales - totalRefunded;

    const outstandingTransactions = activeTransactions.filter(
      (transaction) =>
        transaction.payment_status !== 'Paid' &&
        getRefundPayments(transaction).length === 0 &&
        Number(transaction.balance || 0) > 0
    );

    const outstandingBalances = outstandingTransactions.reduce(
      (sum, transaction) => sum + transaction.balance,
      0
    );

    const paymentsByMethod: Record<string, number> = {};
    activeTransactions.forEach((transaction) => {
      transaction.payments.forEach((payment) => {
        paymentsByMethod[payment.payment_method] =
          (paymentsByMethod[payment.payment_method] || 0) + payment.amount;
      });
    });

    const salesByService: Record<string, { count: number; revenue: number }> = {};
    activeTransactions.forEach((transaction) => {
      transaction.items.forEach((item) => {
        if (!salesByService[item.service_name]) {
          salesByService[item.service_name] = { count: 0, revenue: 0 };
        }

        salesByService[item.service_name].count += item.quantity;
        salesByService[item.service_name].revenue += item.line_total;
      });
    });

    return {
      activeTransactionCount: activeTransactions.length,
      netSales,
      outstandingBalances,
      outstandingTransactions,
      paymentsByMethod,
      periodPayments,
      periodSales,
      refundedItems,
      totalRefunded,
      voidedSales,
      voidedTransactions,
      salesByService
    };
  }, [filteredTransactions]);

  const openFilter = () => {
    setDraftFilter(appliedFilter);
    setIsFilterOpen(true);
  };

  const updateDraftPeriod = (period: ReportPeriod) => {
    setDraftFilter({
      ...createDefaultFilter(period),
      period
    });
  };

  const applyFilter = () => {
    const { start, end } = getDateRange(draftFilter);

    if (start > end) {
      alert('Please select a valid date range.');
      return;
    }

    setAppliedFilter(draftFilter);
    setIsFilterOpen(false);
  };

  const exportToCsv = () => {
    const rows = [
      ['Psyzygy Clinic POS Report'],
      ['Report Type', periodLabels[appliedFilter.period]],
      ['Date Range', getFilterLabel(appliedFilter)],
      [],
      ['Summary'],
      ['Gross Sales', stats.periodSales],
      ['Payments Received', stats.periodPayments],
      ['Refunded Amount', stats.totalRefunded],
      ['Net Sales', stats.netSales],
      ['Outstanding Balances', stats.outstandingBalances],
      ['Period Transactions', filteredTransactions.length],
      [],
      ['Payments by Method'],
      ['Payment Method', 'Total Amount'],
      ...Object.entries(stats.paymentsByMethod).map(([method, amount]) => [
        method,
        amount
      ]),
      [],
      ['Sales by Service'],
      ['Service', 'Count', 'Revenue'],
      ...Object.entries(stats.salesByService)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([service, data]) => [service, data.count, data.revenue]),
      [],
      ['Refunded Items'],
      ['Transaction #', 'Client', 'Date', 'Services', 'Refund Method', 'Refund Amount', 'Reason'],
      ...stats.refundedItems.map(({ transaction, payment, refundAmount }) => [
        transaction.transaction_number,
        transaction.client_name || '',
        new Date(payment.payment_date || transaction.transaction_date).toLocaleDateString(),
        transaction.items.map((item: any) => item.service_name).join(' | '),
        payment.payment_method,
        refundAmount,
        getRefundReason(payment.notes)
      ]),
      [],
      ['Voided Items'],
      ['Transaction #', 'Client', 'Date', 'Services', 'Total', 'Reason'],
      ...stats.voidedTransactions.map((transaction) => [
        transaction.transaction_number,
        transaction.client_name || '',
        new Date(transaction.transaction_date).toLocaleDateString(),
        transaction.items.map((item: any) => item.service_name).join(' | '),
        transaction.total_amount,
        transaction.void_reason || transaction.notes || '-'
      ]),
      [],
      ['Outstanding Balances'],
      ['Transaction #', 'Client', 'Date', 'Total', 'Paid', 'Balance'],
      ...stats.outstandingTransactions.map((transaction) => [
        transaction.transaction_number,
        transaction.client_name || '',
        new Date(transaction.transaction_date).toLocaleDateString(),
        transaction.total_amount,
        transaction.total_paid,
        transaction.balance
      ])
    ];

    const csvContent = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `reports-${appliedFilter.period}-${dateStamp}.csv`,
      csvContent,
      'text/csv;charset=utf-8;'
    );
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=700');

    if (!printWindow) {
      alert('Please allow popups to print the report.');
      return;
    }

    const serviceRows = Object.entries(stats.salesByService)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(
        ([service, data]) => `
          <tr>
            <td>${service}</td>
            <td class="center">${data.count}</td>
            <td class="right">${formatCurrency(data.revenue)}</td>
          </tr>
        `
      )
      .join('');

    const paymentRows = Object.entries(stats.paymentsByMethod)
      .map(
        ([method, amount]) => `
          <tr>
            <td>${method}</td>
            <td class="right">${formatCurrency(amount)}</td>
          </tr>
        `
      )
      .join('');

    const balanceRows = stats.outstandingTransactions
      .map(
        (transaction) => `
          <tr>
            <td>${transaction.transaction_number}</td>
            <td>${transaction.client_name || ''}</td>
            <td>${new Date(transaction.transaction_date).toLocaleDateString()}</td>
            <td class="right">${formatCurrency(transaction.total_amount)}</td>
            <td class="right">${formatCurrency(transaction.total_paid)}</td>
            <td class="right">${formatCurrency(transaction.balance)}</td>
          </tr>
        `
      )
      .join('');

    const refundRows = stats.refundedItems
      .map(
        ({ transaction, payment, refundAmount }) => `
          <tr>
            <td>${transaction.transaction_number}</td>
            <td>${transaction.client_name || ''}</td>
            <td>${new Date(payment.payment_date || transaction.transaction_date).toLocaleDateString()}</td>
            <td>${transaction.items.map((item: any) => item.service_name).join(' | ')}</td>
            <td>${payment.payment_method}</td>
            <td class="right">${formatCurrency(refundAmount)}</td>
            <td>${getRefundReason(payment.notes)}</td>
          </tr>
        `
      )
      .join('');

    const voidRows = stats.voidedTransactions
      .map(
        (transaction) => `
          <tr>
            <td>${transaction.transaction_number}</td>
            <td>${transaction.client_name || ''}</td>
            <td>${new Date(transaction.transaction_date).toLocaleDateString()}</td>
            <td>${transaction.items.map((item: any) => item.service_name).join(' | ')}</td>
            <td class="right">${formatCurrency(transaction.total_amount)}</td>
            <td>${transaction.void_reason || transaction.notes || '-'}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${periodLabels[appliedFilter.period]} Report</title>
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
            h2 {
              font-size: 16px;
              margin: 28px 0 8px;
            }
            p {
              color: #475569;
              margin: 0 0 20px;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(5, 1fr);
              gap: 12px;
              margin: 20px 0;
            }
            .summary div {
              border: 1px solid #e2e8f0;
              padding: 12px;
            }
            .label {
              color: #64748b;
              font-size: 12px;
              margin-bottom: 6px;
            }
            .value {
              font-size: 18px;
              font-weight: 700;
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
              color: #475569;
              background: #f8fafc;
            }
            .center {
              text-align: center;
            }
            .right {
              text-align: right;
            }
          </style>
        </head>
        <body>
          <h1>Psyzygy Clinic POS Report</h1>
          <p>${periodLabels[appliedFilter.period]} report for ${getFilterLabel(appliedFilter)}</p>

          <div class="summary">
            <div>
              <div class="label">Gross Sales</div>
              <div class="value">${formatCurrency(stats.periodSales)}</div>
            </div>
            <div>
              <div class="label">Payments Received</div>
              <div class="value">${formatCurrency(stats.periodPayments)}</div>
            </div>
            <div>
              <div class="label">Refunded Amount</div>
              <div class="value">${formatCurrency(stats.totalRefunded)}</div>
            </div>
            <div>
              <div class="label">Net Sales</div>
              <div class="value">${formatCurrency(stats.netSales)}</div>
            </div>
            <div>
              <div class="label">Outstanding Balances</div>
              <div class="value">${formatCurrency(stats.outstandingBalances)}</div>
            </div>
          </div>

          <h2>Payments by Method</h2>
          <table>
            <thead>
              <tr><th>Payment Method</th><th class="right">Total Amount</th></tr>
            </thead>
            <tbody>
              ${paymentRows || '<tr><td colspan="2">No payments found.</td></tr>'}
            </tbody>
          </table>

          <h2>Sales by Service</h2>
          <table>
            <thead>
              <tr><th>Service</th><th class="center">Count</th><th class="right">Revenue</th></tr>
            </thead>
            <tbody>
              ${serviceRows || '<tr><td colspan="3">No service sales found.</td></tr>'}
            </tbody>
          </table>

          <h2>Refunded Items</h2>
          <table>
            <thead>
              <tr>
                <th>Transaction #</th>
                <th>Client</th>
                <th>Date</th>
                <th>Services</th>
                <th>Method</th>
                <th class="right">Refund Amount</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${refundRows || '<tr><td colspan="7">No refunds found.</td></tr>'}
            </tbody>
          </table>

          <h2>Voided Items</h2>
          <table>
            <thead>
              <tr>
                <th>Transaction #</th>
                <th>Client</th>
                <th>Date</th>
                <th>Services</th>
                <th class="right">Total</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${voidRows || '<tr><td colspan="6">No voided items found.</td></tr>'}
            </tbody>
          </table>

          <h2>Outstanding Balances</h2>
          <table>
            <thead>
              <tr>
                <th>Transaction #</th>
                <th>Client</th>
                <th>Date</th>
                <th class="right">Total</th>
                <th class="right">Paid</th>
                <th class="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${balanceRows || '<tr><td colspan="6">No outstanding balances found.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500 mt-1">
            {periodLabels[appliedFilter.period]} report for{' '}
            {getFilterLabel(appliedFilter)}.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={openFilter}>
            <CalendarDays className="w-4 h-4 mr-2" />
            Report Filter
          </Button>

          <Button variant="outline" onClick={exportToCsv}>
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>

          <Button variant="outline" onClick={printReport}>
            <Printer className="w-4 h-4 mr-2" />
            Print Report
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          {periodLabels[appliedFilter.period]} Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 bg-teal-50 rounded-lg">
            <p className="text-sm text-teal-700 mb-1">Gross Sales</p>
            <p className="text-2xl font-semibold text-teal-900">
              {formatCurrency(stats.periodSales)}
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 mb-1">Payments Received</p>
            <p className="text-2xl font-semibold text-blue-900">
              {formatCurrency(stats.periodPayments)}
            </p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <p className="text-sm text-orange-700 mb-1">Refunded Amount</p>
            <p className="text-2xl font-semibold text-orange-900">
              {formatCurrency(stats.totalRefunded)}
            </p>
          </div>

          <div className="p-4 bg-emerald-50 rounded-lg">
            <p className="text-sm text-emerald-700 mb-1">Net Sales</p>
            <p className="text-2xl font-semibold text-emerald-900">
              {formatCurrency(stats.netSales)}
            </p>
          </div>

          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-red-700 mb-1">Outstanding Balances</p>
            <p className="text-2xl font-semibold text-red-900">
              {formatCurrency(stats.outstandingBalances)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Payments by Method
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Payment Method
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Total Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {Object.entries(stats.paymentsByMethod).map(([method, amount]) => (
                <tr key={method} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">{method}</td>
                  <td className="py-3 px-2 text-sm text-slate-900 text-right">
                    {formatCurrency(amount)}
                  </td>
                </tr>
              ))}

              {Object.keys(stats.paymentsByMethod).length === 0 && (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-slate-500">
                    No payments found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Sales by Service
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Service
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Count
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Revenue
                </th>
              </tr>
            </thead>

            <tbody>
              {Object.entries(stats.salesByService)
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .map(([service, data]) => (
                  <tr key={service} className="border-b border-slate-100">
                    <td className="py-3 px-2 text-sm text-slate-900">
                      {service}
                    </td>
                    <td className="py-3 px-2 text-sm text-slate-900 text-center">
                      {data.count}
                    </td>
                    <td className="py-3 px-2 text-sm text-slate-900 text-right">
                      {formatCurrency(data.revenue)}
                    </td>
                  </tr>
                ))}

              {Object.keys(stats.salesByService).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-500">
                    No service sales found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Refunded Items
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Transaction #
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Client
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Services
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Method
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Refund Amount
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Reason
                </th>
              </tr>
            </thead>

            <tbody>
              {stats.refundedItems.map(({ transaction, payment, refundAmount }) => (
                <tr key={payment.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.transaction_number}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.client_name || '-'}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {transaction.items
                      .map((item: any) => item.service_name)
                      .join(' | ')}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {payment.payment_method}
                  </td>
                  <td className="py-3 px-2 text-sm text-orange-700 text-right font-medium">
                    {formatCurrency(refundAmount)}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {getRefundReason(payment.notes)}
                  </td>
                </tr>
              ))}

              {stats.refundedItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No refunds found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Voided Items
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Transaction #
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Client
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Services
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Total
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Reason
                </th>
              </tr>
            </thead>

            <tbody>
              {stats.voidedTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.transaction_number}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.client_name || '-'}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {transaction.items
                      .map((item: any) => item.service_name)
                      .join(' | ')}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900 text-right">
                    {formatCurrency(transaction.total_amount)}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {transaction.void_reason || transaction.notes || '-'}
                  </td>
                </tr>
              ))}

              {stats.voidedTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No voided items found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Outstanding Balances
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Transaction #
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Client
                </th>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Date
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Total
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Paid
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Balance
                </th>
              </tr>
            </thead>

            <tbody>
              {stats.outstandingTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.transaction_number}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {transaction.client_name}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-600">
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900 text-right">
                    {formatCurrency(transaction.total_amount)}
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-900 text-right">
                    {formatCurrency(transaction.total_paid)}
                  </td>
                  <td className="py-3 px-2 text-sm text-red-600 text-right font-medium">
                    {formatCurrency(transaction.balance)}
                  </td>
                </tr>
              ))}

              {stats.outstandingTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No outstanding balances found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Client Statistics
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">Total Clients</p>
            <p className="text-2xl font-semibold text-slate-900">
              {clients.length}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">Active Services</p>
            <p className="text-2xl font-semibold text-slate-900">
              {services.filter((service) => service.is_active).length}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">Period Transactions</p>
            <p className="text-2xl font-semibold text-slate-900">
              {filteredTransactions.length}
            </p>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Report Filter"
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Report Type"
            value={draftFilter.period}
            onChange={(event) =>
              updateDraftPeriod(event.target.value as ReportPeriod)
            }
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' }
            ]}
          />

          {(draftFilter.period === 'daily' ||
            draftFilter.period === 'weekly') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="date"
                label="Start Date"
                value={draftFilter.startDate}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    startDate: event.target.value
                  })
                }
              />

              <Input
                type="date"
                label="End Date"
                value={draftFilter.endDate}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    endDate: event.target.value
                  })
                }
              />
            </div>
          )}

          {draftFilter.period === 'monthly' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="From Month"
                value={draftFilter.fromMonth}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    fromMonth: event.target.value
                  })
                }
                options={monthOptions}
              />

              <Select
                label="To Month"
                value={draftFilter.toMonth}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    toMonth: event.target.value
                  })
                }
                options={monthOptions}
              />

              <Select
                label="Year"
                value={draftFilter.monthYear}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    monthYear: event.target.value
                  })
                }
                options={yearOptions}
              />
            </div>
          )}

          {draftFilter.period === 'yearly' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="From Year"
                value={draftFilter.fromYear}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    fromYear: event.target.value
                  })
                }
                options={yearOptions}
              />

              <Select
                label="To Year"
                value={draftFilter.toYear}
                onChange={(event) =>
                  setDraftFilter({
                    ...draftFilter,
                    toYear: event.target.value
                  })
                }
                options={yearOptions}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsFilterOpen(false)}>
              Cancel
            </Button>

            <Button onClick={applyFilter}>
              Apply Filter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
