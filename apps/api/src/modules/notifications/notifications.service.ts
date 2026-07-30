import { AppError } from '../../shared/app-error';
import { inventoryRepository } from '../inventory/inventory.repository';
import { notificationsRepository } from './notifications.repository';

/**
 * There's no background worker in this build to push notifications in real
 * time (see docs/02-system-architecture.md's BullMQ mention — not wired up
 * for this cross-cutting concern). Instead, low-stock and expiry conditions
 * are checked on demand whenever a user opens the notification center, and
 * a broadcast notification (`user_id: null`) is created the first time a
 * given condition is seen — `findUnreadByReference` keeps this idempotent,
 * so refreshing the bell repeatedly doesn't spam duplicate rows. This is a
 * documented simplification, not the real-time system a production
 * deployment would want.
 */
async function generateLiveNotifications(organizationId: string): Promise<void> {
  const [lowStock, expiring] = await Promise.all([
    inventoryRepository.getLowStock(organizationId),
    inventoryRepository.getExpiringBatches(organizationId, 30),
  ]);

  for (const item of lowStock) {
    const existing = await notificationsRepository.findUnreadByReference(
      organizationId,
      'product_variants',
      item.productVariantId,
    );
    if (existing) continue;
    await notificationsRepository.create({
      organization_id: organizationId,
      user_id: null,
      type: 'low_stock',
      title: `Low stock: ${item.productName}`,
      body: `${item.sku} is at ${item.quantityOnHand} units, at or below its reorder level of ${item.reorderLevel}.`,
      reference_table: 'product_variants',
      reference_id: item.productVariantId,
    });
  }

  for (const batch of expiring) {
    const existing = await notificationsRepository.findUnreadByReference(organizationId, 'batches', batch.batchId);
    if (existing) continue;
    await notificationsRepository.create({
      organization_id: organizationId,
      user_id: null,
      type: 'expiry_alert',
      title: `Expiring soon: ${batch.productName}`,
      body: `Batch ${batch.batchNumber} (${batch.sku}) expires ${new Date(batch.expiryDate!).toLocaleDateString()}.`,
      reference_table: 'batches',
      reference_id: batch.batchId,
    });
  }
}

export const notificationsService = {
  async list(organizationId: string, userId: string, limit: number) {
    await generateLiveNotifications(organizationId);
    return notificationsRepository.listForUser(organizationId, userId, limit);
  },

  async markRead(organizationId: string, id: string, userId: string) {
    const notification = await notificationsRepository.findById(organizationId, id);
    if (!notification) throw new AppError('NOT_FOUND', 'Notification not found');
    // A user-specific notification can only be marked read by its owner; a
    // broadcast (user_id: null) is marked read for the whole org the first
    // time anyone reads it — a proper per-user read-state table for
    // broadcasts is a P1 follow-up (see docs/03-database-design.md).
    if (notification.user_id && notification.user_id !== userId) {
      throw new AppError('UNAUTHORIZED', 'This notification belongs to another user');
    }
    return notificationsRepository.markRead(id);
  },
};
