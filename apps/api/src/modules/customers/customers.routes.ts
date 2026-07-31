import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  createAddressSchema,
  updateAddressSchema,
  chargeCustomerSchema,
  payCustomerSchema,
  lookupCustomerQuerySchema,
} from './customers.dto';
import { customersService } from './customers.service';
import { sendSuccess } from '../../shared/response-envelope';

export const customersRouter = Router();

customersRouter.get('/customers', requireAuth, async (req, res) => {
  const query = listCustomersQuerySchema.parse(req.query);
  const result = await customersService.list(req.auth!.orgId, query);
  sendSuccess(res, result.rows, 200, { page: result.page, pageSize: result.pageSize, total: result.total });
});

// Declared before /customers/:id so "lookup" isn't captured as an id.
// Returns `null` for an unknown number rather than 404 — at the till a new
// customer is the expected case, not an error.
customersRouter.get('/customers/lookup', requireAuth, async (req, res) => {
  const query = lookupCustomerQuerySchema.parse(req.query);
  sendSuccess(res, await customersService.lookupByPhone(req.auth!.orgId, query.phone));
});

customersRouter.get('/customers/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await customersService.getById(req.auth!.orgId, req.params.id));
});

customersRouter.post(
  '/customers',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = createCustomerSchema.parse(req.body);
    const customer = await customersService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, customer, 201);
  },
);

customersRouter.patch(
  '/customers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = updateCustomerSchema.parse(req.body);
    const customer = await customersService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, customer);
  },
);

customersRouter.delete(
  '/customers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    await customersService.remove(req.auth!.orgId, req.params.id, req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

customersRouter.post(
  '/customers/:id/charge',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = chargeCustomerSchema.parse(req.body);
    const customer = await customersService.charge(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, customer);
  },
);

customersRouter.post(
  '/customers/:id/payments',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = payCustomerSchema.parse(req.body);
    const customer = await customersService.recordPayment(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, customer);
  },
);

customersRouter.post(
  '/customers/:id/addresses',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = createAddressSchema.parse(req.body);
    const address = await customersService.addAddress(req.auth!.orgId, req.params.id, input);
    sendSuccess(res, address, 201);
  },
);

customersRouter.patch(
  '/customers/:id/addresses/:addressId',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    const input = updateAddressSchema.parse(req.body);
    const address = await customersService.updateAddress(req.auth!.orgId, req.params.id, req.params.addressId, input);
    sendSuccess(res, address);
  },
);

customersRouter.delete(
  '/customers/:id/addresses/:addressId',
  requireAuth,
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE),
  async (req, res) => {
    await customersService.removeAddress(req.auth!.orgId, req.params.id, req.params.addressId);
    sendSuccess(res, { deleted: true });
  },
);
