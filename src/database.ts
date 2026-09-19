import type { SQLiteDatabase } from 'expo-sqlite';
import type { CategoryName, Subscription, SubscriptionDraft } from './types';

type SubscriptionRow = {
  id: number;
  name: string;
  price: number;
  category: CategoryName;
  billing_cycle: Subscription['billingCycle'];
  next_billing_date: string;
  color: string;
  icon: string;
  is_trial: number;
  trial_end_date: string | null;
  reminder_days: number;
  notifications_enabled: number;
  notification_id: string | null;
  created_at: string;
};

const DATABASE_VERSION = 1;

export async function migrateDatabase(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const version = result?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL CHECK (price >= 0),
        category TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        next_billing_date TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        is_trial INTEGER NOT NULL DEFAULT 0,
        trial_end_date TEXT,
        reminder_days INTEGER NOT NULL DEFAULT 3,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        notification_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_next_date
        ON subscriptions(next_billing_date);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_category
        ON subscriptions(category);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

function fromRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    billingCycle: row.billing_cycle,
    nextBillingDate: row.next_billing_date,
    color: row.color,
    icon: row.icon,
    isTrial: row.is_trial === 1,
    trialEndDate: row.trial_end_date,
    reminderDays: row.reminder_days,
    notificationsEnabled: row.notifications_enabled === 1,
    notificationId: row.notification_id,
    createdAt: row.created_at,
  };
}

export async function getSubscriptions(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<SubscriptionRow>(
    'SELECT * FROM subscriptions ORDER BY next_billing_date ASC, name COLLATE NOCASE ASC',
  );
  return rows.map(fromRow);
}

export async function createSubscription(
  db: SQLiteDatabase,
  draft: SubscriptionDraft,
) {
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO subscriptions (
      name, price, category, billing_cycle, next_billing_date, color, icon,
      is_trial, trial_end_date, reminder_days, notifications_enabled,
      notification_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    draft.name.trim(),
    draft.price,
    draft.category,
    draft.billingCycle,
    draft.nextBillingDate,
    draft.color,
    draft.icon,
    draft.isTrial ? 1 : 0,
    draft.isTrial ? draft.trialEndDate : null,
    draft.reminderDays,
    draft.notificationsEnabled ? 1 : 0,
    createdAt,
  );
  return {
    ...draft,
    id: result.lastInsertRowId,
    notificationId: null,
    createdAt,
  } satisfies Subscription;
}

export async function updateSubscription(
  db: SQLiteDatabase,
  id: number,
  draft: SubscriptionDraft,
) {
  await db.runAsync(
    `UPDATE subscriptions SET
      name = ?, price = ?, category = ?, billing_cycle = ?,
      next_billing_date = ?, color = ?, icon = ?, is_trial = ?,
      trial_end_date = ?, reminder_days = ?, notifications_enabled = ?
    WHERE id = ?`,
    draft.name.trim(),
    draft.price,
    draft.category,
    draft.billingCycle,
    draft.nextBillingDate,
    draft.color,
    draft.icon,
    draft.isTrial ? 1 : 0,
    draft.isTrial ? draft.trialEndDate : null,
    draft.reminderDays,
    draft.notificationsEnabled ? 1 : 0,
    id,
  );
}

export async function setNotificationId(
  db: SQLiteDatabase,
  id: number,
  notificationId: string | null,
) {
  await db.runAsync(
    'UPDATE subscriptions SET notification_id = ? WHERE id = ?',
    notificationId,
    id,
  );
}

export async function deleteSubscription(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM subscriptions WHERE id = ?', id);
}
