import { apiFetch, apiFetchEnvelope } from './api-client';

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  credit_limit: string;
  outstanding_balance: string;
  loyalty_points: number;
  is_walkin: boolean;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string | null;
  line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  is_default: boolean;
}

export interface ListCustomersResult {
  data: Customer[];
  meta: { page: number; pageSize: number; total: number };
}

export async function listCustomers(
  token: string,
  params: { q?: string; page?: number } = {},
): Promise<ListCustomersResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.page) search.set('page', String(params.page));

  const envelope = await apiFetchEnvelope<Customer[]>(`/api/v1/customers?${search.toString()}`, {}, token);
  return {
    data: envelope.data,
    meta: {
      page: envelope.meta?.page ?? 1,
      pageSize: envelope.meta?.pageSize ?? 20,
      total: envelope.meta?.total ?? envelope.data.length,
    },
  };
}

export const getCustomer = (token: string, id: string) =>
  apiFetch<{ customer: Customer; addresses: CustomerAddress[] }>(`/api/v1/customers/${id}`, {}, token);

export const createCustomer = (
  token: string,
  input: { fullName: string; phone?: string; email?: string; gstin?: string; creditLimit?: number },
) => apiFetch<Customer>('/api/v1/customers', { method: 'POST', body: JSON.stringify(input) }, token);

export const updateCustomer = (
  token: string,
  id: string,
  input: Partial<{ fullName: string; phone: string; email: string; gstin: string; creditLimit: number }>,
) => apiFetch<Customer>(`/api/v1/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token);

export const chargeCustomer = (token: string, id: string, amount: number, referenceNote?: string) =>
  apiFetch<Customer>(
    `/api/v1/customers/${id}/charge`,
    { method: 'POST', body: JSON.stringify({ amount, referenceNote }) },
    token,
  );

export const recordCustomerPayment = (token: string, id: string, amount: number) =>
  apiFetch<Customer>(`/api/v1/customers/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount }) }, token);

export const addCustomerAddress = (
  token: string,
  customerId: string,
  input: { label?: string; line1?: string; city?: string; state?: string; postalCode?: string; isDefault?: boolean },
) =>
  apiFetch<CustomerAddress>(
    `/api/v1/customers/${customerId}/addresses`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
