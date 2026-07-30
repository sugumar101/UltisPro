'use client';

import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { hasPermission } from '../../lib/stores/auth-store';
import {
  listExpenseCategories,
  createExpenseCategory,
  listExpenses,
  createExpense,
  type ExpenseCategory,
  type Expense,
} from '../../lib/expenses-api';
import { ApiError } from '../../lib/api-client';

const PAYMENT_MODES = ['cash', 'card', 'upi', 'bank_transfer', 'cheque'] as const;

export default function ExpensesPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.EXPENSES_MANAGE);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState('');
  const [form, setForm] = useState({ expenseCategoryId: '', amount: '', paymentMode: 'cash' as (typeof PAYMENT_MODES)[number], notes: '' });
  const [saving, setSaving] = useState(false);

  async function loadAll(token: string) {
    const [cats, exp] = await Promise.all([listExpenseCategories(token), listExpenses(token)]);
    setCategories(cats);
    setExpenses(exp.data);
    setTotal(exp.meta.total);
    if (cats.length > 0 && !form.expenseCategoryId) setForm((f) => ({ ...f, expenseCategoryId: cats[0].id }));
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    loadAll(accessToken).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  async function handleAddCategory() {
    if (!accessToken || !newCategory) return;
    try {
      await createExpenseCategory(accessToken, newCategory);
      setNewCategory('');
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add category');
    }
  }

  async function handleAddExpense() {
    if (!accessToken || !form.expenseCategoryId || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      await createExpense(accessToken, {
        expenseCategoryId: form.expenseCategoryId,
        amount: Number(form.amount),
        paymentMode: form.paymentMode,
        notes: form.notes || undefined,
      });
      setForm((f) => ({ ...f, amount: '', notes: '' }));
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Expenses</h1>
      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <table className="w-full text-left text-body-md">
              <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Mode</th>
                  <th className="p-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-outline-variant last:border-0">
                    <td className="p-4">{new Date(e.expense_date).toLocaleDateString()}</td>
                    <td className="p-4">{categories.find((c) => c.id === e.expense_category_id)?.name ?? '—'}</td>
                    <td className="p-4 capitalize text-on-surface-variant">{e.payment_mode.replace('_', ' ')}</td>
                    <td className="p-4 font-semibold">₹{e.amount}</td>
                  </tr>
                ))}
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                      No expenses recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {expenses.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-outline-variant font-semibold">
                    <td className="p-4" colSpan={3}>
                      Total ({total})
                    </td>
                    <td className="p-4">₹{expenses.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </CardContent>
        </Card>

        {canManage ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-3">
                <h2 className="font-title-sm text-title-sm">Record expense</h2>
                <FormField label="Category">
                  <select
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={form.expenseCategoryId}
                    onChange={(e) => setForm((f) => ({ ...f, expenseCategoryId: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Amount">
                  <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                </FormField>
                <FormField label="Payment mode">
                  <select
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={form.paymentMode}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value as typeof form.paymentMode }))}
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Notes (optional)">
                  <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </FormField>
                <Button className="w-full" disabled={saving || !form.expenseCategoryId || !form.amount} onClick={handleAddExpense}>
                  {saving ? 'Saving…' : 'Record expense'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <h2 className="font-title-sm text-title-sm">Categories</h2>
                <ul className="space-y-1 text-sm text-on-surface-variant">
                  {categories.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Input placeholder="New category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                  <Button variant="secondary" size="sm" onClick={handleAddCategory}>
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
