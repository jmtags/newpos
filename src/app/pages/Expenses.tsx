import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  ImagePlus,
  FolderCog,
  Pencil,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import type { AppUser } from '../services/userService';
import {
  expenseService,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecurrence,
  type ExpenseStatus
} from '../services/expenseService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

const emptyForm = (): ExpenseInput => ({
  category_id: null,
  expense_date: today(),
  paid_date: today(),
  vendor: '',
  description: '',
  amount: 0,
  payment_method: 'Cash',
  reference_number: '',
  recurrence: 'One-time',
  status: 'Paid',
  receipt_url: '',
  notes: '',
  created_by_user_id: null
});

export const Expenses: React.FC<{ currentUser: AppUser | null }> = ({
  currentUser
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState(today().slice(0, 7));
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseInput>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [expenseRows, categoryRows] = await Promise.all([
        expenseService.getExpenses(),
        expenseService.getCategories()
      ]);
      setExpenses(expenseRows);
      setCategories(categoryRows);
    } catch (err: any) {
      setError(err.message || 'Unable to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      const matchesMonth = !monthFilter || expense.expense_date.startsWith(monthFilter);
      const matchesStatus = statusFilter === 'All' || expense.status === statusFilter;
      const matchesSearch =
        !term ||
        [
          expense.expense_number,
          expense.vendor,
          expense.description,
          expense.expense_categories?.name,
          expense.reference_number
        ].some((value) => value?.toLowerCase().includes(term));
      return matchesMonth && matchesStatus && matchesSearch;
    });
  }, [expenses, monthFilter, search, statusFilter]);

  const totals = useMemo(
    () => ({
      paid: filtered
        .filter((item) => item.status === 'Paid')
        .reduce((sum, item) => sum + Number(item.amount), 0),
      pending: filtered
        .filter((item) => item.status === 'Pending')
        .reduce((sum, item) => sum + Number(item.amount), 0)
    }),
    [filtered]
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm(), created_by_user_id: currentUser?.id || null });
    setReceiptFile(null);
    setReceiptPreview('');
    setFormOpen(true);
  };

  const openEdit = async (expense: Expense) => {
    setEditing(expense);
    setReceiptFile(null);
    setReceiptPreview('');
    setForm({
      category_id: expense.category_id,
      expense_date: expense.expense_date,
      paid_date: expense.paid_date,
      vendor: expense.vendor || '',
      description: expense.description,
      amount: Number(expense.amount),
      payment_method: expense.payment_method || '',
      reference_number: expense.reference_number || '',
      recurrence: expense.recurrence,
      status: expense.status,
      receipt_url: expense.receipt_url || '',
      notes: expense.notes || '',
      created_by_user_id: expense.created_by_user_id
    });
    setFormOpen(true);

    if (expense.receipt_url) {
      try {
        setReceiptPreview(await expenseService.getReceiptUrl(expense.receipt_url));
      } catch {
        setReceiptPreview('');
      }
    }
  };

  const selectReceipt = (file?: File) => {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      alert('Please select a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Receipt image must be 5 MB or smaller.');
      return;
    }

    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = () => setReceiptPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const openReceipt = async (receiptPath: string) => {
    const receiptWindow = window.open('', '_blank');
    try {
      const url = await expenseService.getReceiptUrl(receiptPath);
      if (receiptWindow) receiptWindow.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      receiptWindow?.close();
      alert(`Unable to open receipt: ${err.message}`);
    }
  };

  const save = async () => {
    if (!form.description.trim() || Number(form.amount) <= 0) {
      alert('Description and an amount greater than zero are required.');
      return;
    }
    if (form.status === 'Paid' && !form.paid_date) {
      alert('Paid date is required for paid expenses.');
      return;
    }

    try {
      setSaving(true);
      let receiptPath = form.receipt_url?.trim() || null;

      if (receiptFile) {
        if (!currentUser?.auth_user_id) {
          throw new Error('Your signed-in account could not be identified.');
        }
        receiptPath = await expenseService.uploadReceipt(
          receiptFile,
          currentUser.auth_user_id
        );
      }

      const payload = {
        ...form,
        category_id: form.category_id || null,
        paid_date: form.status === 'Paid' ? form.paid_date || form.expense_date : null,
        vendor: form.vendor?.trim() || null,
        payment_method: form.payment_method?.trim() || null,
        reference_number: form.reference_number?.trim() || null,
        receipt_url: receiptPath,
        notes: form.notes?.trim() || null
      };
      if (editing) await expenseService.updateExpense(editing.id, payload);
      else await expenseService.addExpense(payload);
      setFormOpen(false);
      await load();
    } catch (err: any) {
      alert(`Unable to save expense: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await expenseService.addCategory(newCategory);
      setNewCategory('');
      await load();
    } catch (err: any) {
      alert(`Unable to add category: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Expense Ledger</h2>
          <p className="mt-1 text-sm text-slate-500">
            Record operating costs, payables, vendors, and receipt references.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <FolderCog className="mr-2 h-4 w-4" /> Categories
          </Button>
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Paid expenses</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{money(totals.paid)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Pending expenses</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{money(totals.pending)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Visible records</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{filtered.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search number, vendor, description, or category"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={['All', 'Paid', 'Pending', 'Void'].map((value) => ({ value, label: value }))}
          />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {['Date / Number', 'Expense', 'Category', 'Status', 'Amount', 'Actions'].map((heading) => (
                  <th key={heading} className={`px-4 py-3 text-sm font-medium text-slate-600 ${['Amount', 'Actions'].includes(heading) ? 'text-right' : 'text-left'}`}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr key={expense.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-sm">
                    <p className="text-slate-900">{new Date(`${expense.expense_date}T00:00:00`).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-500">{expense.expense_number}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <p className="font-medium text-slate-900">{expense.description}</p>
                    <p className="text-xs text-slate-500">{expense.vendor || 'No vendor'} · {expense.recurrence}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{expense.expense_categories?.name || 'Uncategorized'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${
                      expense.status === 'Paid' ? 'bg-green-100 text-green-700' :
                      expense.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{expense.status}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${expense.status === 'Void' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {money(Number(expense.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {expense.receipt_url && (
                        <button className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" onClick={() => openReceipt(expense.receipt_url!)} title="Open receipt">
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(expense)}><Pencil className="h-4 w-4" /></Button>
                      {expense.status !== 'Void' && (
                        <Button size="sm" variant="danger" onClick={async () => {
                          if (!window.confirm('Void this expense? It will remain in the audit trail.')) return;
                          await expenseService.voidExpense(expense.id);
                          await load();
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No expenses match these filters.</td></tr>
              )}
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading expenses...</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Expense' : 'Add Expense'} size="lg">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Description *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Vendor / Payee" value={form.vendor || ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          <Select label="Category" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })} options={[
            { value: '', label: 'Uncategorized' },
            ...categories.filter((item) => item.is_active || item.id === form.category_id).map((item) => ({ value: item.id, label: item.name }))
          ]} />
          <Input type="number" min="0.01" step="0.01" label="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          <Input type="date" label="Expense Date *" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExpenseStatus, paid_date: e.target.value === 'Paid' ? form.paid_date || form.expense_date : null })} options={['Pending', 'Paid', 'Void'].map((value) => ({ value, label: value }))} />
          {form.status === 'Paid' && <Input type="date" label="Paid Date *" value={form.paid_date || ''} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />}
          <Select label="Recurrence" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as ExpenseRecurrence })} options={['One-time', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'].map((value) => ({ value, label: value }))} />
          <Input label="Payment Method" value={form.payment_method || ''} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
          <Input label="Reference Number" value={form.reference_number || ''} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Receipt Image
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-teal-500 hover:bg-teal-50">
              <ImagePlus className="h-5 w-5 text-teal-600" />
              {receiptFile ? receiptFile.name : 'Upload receipt picture'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => selectReceipt(event.target.files?.[0])}
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP, or GIF · maximum 5 MB</p>
          </div>
          <Input label="External Receipt URL (optional)" placeholder="https://..." value={receiptFile ? '' : form.receipt_url || ''} disabled={Boolean(receiptFile)} onChange={(e) => {
            setForm({ ...form, receipt_url: e.target.value });
            setReceiptPreview(e.target.value);
          }} />
          {receiptPreview && (
            <div className="md:col-span-2">
              <p className="mb-1 text-sm font-medium text-slate-700">Receipt Preview</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="max-h-64 max-w-full rounded object-contain"
                />
              </div>
            </div>
          )}
          <Input label="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Expense'}</Button>
        </div>
      </Modal>

      <Modal isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} title="Expense Categories">
        <div className="flex gap-2">
          <Input placeholder="New category name" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
          <Button onClick={addCategory}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between py-3">
              <div><p className="font-medium text-slate-900">{category.name}</p><p className="text-xs text-slate-500">{category.description || 'No description'}</p></div>
              <Button size="sm" variant={category.is_active ? 'danger' : 'success'} onClick={async () => {
                await expenseService.setCategoryActive(category.id, !category.is_active);
                await load();
              }}>{category.is_active ? 'Deactivate' : 'Activate'}</Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};
