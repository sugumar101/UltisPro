import { AppError } from '../../shared/app-error';
import { inventoryRepository } from '../inventory/inventory.repository';
import { notificationsRepository } from './notifications.repository';

/**
 * There's no background worker in this build to push notifications in real
 * time (see docs/02-system-architecture.md's BullMQ mention — not wired up
 * for this cross-cutting concern). Instead, low-stock and expiry conditions
 * are checked on demand whenever a user opens the notification center, and
 * a broadcast notification (`user_id: null`) is created the first time a
 * given condition is seen — `unreadReferenceIds` keeps this idempotent,
 * so refreshing the bell repeatedly doesn't spam duplicate rows. This is a
 * documented simplification, not the real-time system a production
 * deployment would want.
 */
/**
 * How long a scan result is considered fresh, per organization.
 *
 * The bell polls every 60s per logged-in user, so without this a shop with
 * 8 staff online re-scans its entire stock position 8 times a minute to
 * produce, almost always, nothing new. Low-stock and expiry are not
 * second-sensitive conditions; a couple of minutes of staleness is
 * invisible to the user and removes almost all of the load.
 *
 * In-memory and therefore per-process: with N replicas the effective scan
 * rate is N x this. That's an acceptable ceiling (it's a cache, not a
 * correctness mechanism) and still orders of magnitude better than the
 * per-request behaviour it replaces.
 */
const SCAN_INTERVAL_MS = 120_000;
const lastScanAt = new Map<string, number>();

async function generateLiveNotifications(organizationId: string): Promise<void> {
  const now = Date.now();
  const previous = lastScanAt.get(organizationId);
  if (previous !== undefined && now - previous < SCAN_INTERVAL_MS) return;
  // Recorded before the work, not after: two concurrent polls should not
  // both decide they're the one to scan.
  lastScanAt.set(organizationId, now);

  // Four queries total, regardless of how many conditions are outstanding.
  // The previous version issued one duplicate-check per condition, so cost
  // grew with (users x low-stock items) — see unreadReferenceIds().
  const [lowStock, expiring, notifiedVariants, notifiedBatches] = await Promise.all([
    inventoryRepository.getLowStock(organizationId),
    inventoryRepository.getExpiringBatches(organizationId, 30),
    notificationsRepository.unreadReferenceIds(organizationId, 'product_variants'),
    notificationsRepository.unreadReferenceIds(organizationId, 'batches'),
  ]);

  const pending: Parameters<typeof notificationsRepository.createMany>[0] = [];

  for (const item of lowStock) {
    if (notifiedVariants.has(item.productVariantId)) continue;
    pending.push({
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
    if (notifiedBatches.has(batch.batchId)) continue;
    pending.push({
      organization_id: organizationId,
      user_id: null,
      type: 'expiry_alert',
      title: `Expiring soon: ${batch.productName}`,
      body: `Batch ${batch.batchNumber} (${batch.sku}) expires ${new Date(batch.expiryDate!).toLocaleDateString()}.`,
      reference_table: 'batches',
      reference_id: batch.batchId,
    });
  }

  // One insert for everything rather than one per condition.
  await notificationsRepository.createMany(pending);
}

/** Tests need to defeat the scan throttle to assert generation behaviour. */
export function __resetNotificationScanThrottle(): void {
  lastScanAt.clear();
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
