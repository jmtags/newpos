import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, TrendingUp } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { expenseService, type Expense } from '../services/expenseService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const firstOfMonth = () => `${today().slice(0, 7)}-01`;
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export const Profitability: React.FC = () => {
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (startDate > endDate) {
      setError('Start date must be before or equal to end date.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const [expenseRows, paymentRows] = await Promise.all([
        expenseService.getExpenses(),
        expenseService.getPayments(startDate, endDate)
      ]);
      setExpenses(expenseRows);
      setPayments(paymentRows);
    } catch (err: any) {
      setError(err.message || 'Unable to calculate profitability.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const report = useMemo(() => {
    const periodExpenses = expenses.filter(
      (expense) =>
        expense.status === 'Paid' &&
        expense.paid_date &&
        expense.paid_date >= startDate &&
        expense.paid_date <= endDate
    );
    const collections = payments
      .filter((payment) => Number(payment.amount) > 0)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const refunds = payments
      .filter((payment) => Number(payment.amount) < 0)
      .reduce((sum, payment) => sum + Math.abs(Number(payment.amount)), 0);
    const netCollections = collections - refunds;
    const paidExpenses = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const netIncome = netCollections - paidExpenses;
    const margin = netCollections > 0 ? (netIncome / netCollections) * 100 : 0;
    const byCategory = periodExpenses.reduce<Record<string, number>>((totals, expense) => {
      const category = expense.expense_categories?.name || 'Uncategorized';
      totals[category] = (totals[category] || 0) + Number(expense.amount);
      return totals;
    }, {});

    return {
      collections,
      refunds,
      netCollections,
      paidExpenses,
      netIncome,
      margin,
      periodExpenses,
      byCategory
    };
  }, [endDate, expenses, payments, startDate]);

  const exportCsv = () => {
    const rows = [
      ['Psyzygy Clinic Cash Profitability Report'],
      ['Period', `${startDate} to ${endDate}`],
      ['Collections', report.collections],
      ['Refunds', report.refunds],
      ['Net collections', report.netCollections],
      ['Paid expenses', report.paidExpenses],
      ['Net income', report.netIncome],
      ['Profit margin', `${report.margin.toFixed(2)}%`],
      [],
      ['Expense category', 'Amount'],
      ...Object.entries(report.byCategory).map(([category, amount]) => [category, amount])
    ];
    const content = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = `profitability-${startDate}-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const categoryRows = Object.entries(report.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(...categoryRows.map(([, value]) => value), 1);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Profitability</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cash view: payments collected minus refunds and paid expenses.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={loading}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input type="date" label="Start Date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" label="End Date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <Button onClick={load} disabled={loading}>{loading ? 'Calculating...' : 'Apply'}</Button>
        </div>
      </Card>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Net collections</p><ArrowUpRight className="h-5 w-5 text-teal-600" /></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{money(report.netCollections)}</p>
          <p className="mt-1 text-xs text-slate-500">{money(report.collections)} received · {money(report.refunds)} refunded</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Paid expenses</p><ArrowDownRight className="h-5 w-5 text-red-500" /></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{money(report.paidExpenses)}</p>
          <p className="mt-1 text-xs text-slate-500">{report.periodExpenses.length} expense records</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Net income</p><TrendingUp className={`h-5 w-5 ${report.netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`} /></div>
          <p className={`mt-2 text-2xl font-semibold ${report.netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(report.netIncome)}</p>
          <p className="mt-1 text-xs text-slate-500">{report.netIncome >= 0 ? 'Profitable for this period' : 'Expenses exceeded collections'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Profit margin</p>
          <p className={`mt-2 text-2xl font-semibold ${report.margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>{report.margin.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-slate-500">Net income ÷ net collections</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">Cash flow summary</h3>
          <div className="mt-5 space-y-4">
            {[
              ['Collections received', report.collections, 'text-green-700'],
              ['Less: refunds', -report.refunds, 'text-red-600'],
              ['Net collections', report.netCollections, 'text-slate-900'],
              ['Less: paid expenses', -report.paidExpenses, 'text-red-600'],
              ['Net income', report.netIncome, report.netIncome >= 0 ? 'text-green-700' : 'text-red-600']
            ].map(([label, amount, color], index) => (
              <div key={String(label)} className={`flex justify-between py-2 ${index >= 2 ? 'border-t border-slate-200 font-semibold' : ''}`}>
                <span className="text-sm text-slate-600">{label}</span>
                <span className={`text-sm ${color}`}>{money(Number(amount))}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">Expenses by category</h3>
          <div className="mt-5 space-y-4">
            {categoryRows.map(([category, amount]) => (
              <div key={category}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{category}</span><span className="font-medium text-slate-900">{money(amount)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${(amount / maxCategory) * 100}%` }} /></div>
              </div>
            ))}
            {!loading && categoryRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No paid expenses in this period.</p>}
          </div>
        </Card>
      </div>

      <p className="text-xs text-slate-500">
        This is a cash-basis operational view. Pending expenses and unpaid client balances are excluded until money changes hands.
      </p>
    </div>
  );
};
