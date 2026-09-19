import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Subscription } from './types';
import { formatShortDate, parseLocalDate, peso } from './utils';

const CHANNEL_ID = 'renewal-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function prepareNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Subscription renewals',
      description: 'Reminders before a subscription renews',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#C78997',
      sound: 'default',
    });
  }
}

export async function notificationPermissionGranted() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function cancelReminder(identifier: string | null) {
  if (!identifier) return;
  let identifiers = [identifier];
  try {
    const parsed: unknown = JSON.parse(identifier);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      identifiers = parsed;
    }
  } catch {
    // Older records may contain one plain notification identifier.
  }
  try {
    await Promise.all(
      identifiers.map((item) =>
        Notifications.cancelScheduledNotificationAsync(item),
      ),
    );
  } catch {
    // The notification may already have fired; there is nothing left to cancel.
  }
}

export async function scheduleRenewalReminder(subscription: Subscription) {
  if (!subscription.notificationsEnabled) return null;
  const granted = await notificationPermissionGranted();
  if (!granted) return null;

  const dates = subscription.isTrial && subscription.trialEndDate
    ? [subscription.trialEndDate]
    : buildRecurringDates(subscription.nextBillingDate, subscription.billingCycle);
  const identifiers: string[] = [];

  for (const targetDate of dates) {
    const reminderDate = parseLocalDate(targetDate);
    reminderDate.setDate(reminderDate.getDate() - subscription.reminderDays);
    reminderDate.setHours(9, 0, 0, 0);
    if (reminderDate.getTime() <= Date.now()) continue;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: subscription.isTrial
          ? `${subscription.name} trial ends soon`
          : `${subscription.name} renews soon`,
        body: subscription.isTrial
          ? `Your free trial ends on ${formatShortDate(targetDate)}. The next charge is ${peso.format(subscription.price)}.`
          : `${peso.format(subscription.price)} is due on ${formatShortDate(targetDate)}.`,
        sound: 'default',
        data: { subscriptionId: subscription.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
    identifiers.push(identifier);
  }

  return identifiers.length ? JSON.stringify(identifiers) : null;
}

function buildRecurringDates(
  firstDate: string,
  cycle: Subscription['billingCycle'],
) {
  const dates: string[] = [];
  let current = parseLocalDate(firstDate);
  for (let index = 0; index < 12; index += 1) {
    dates.push(toLocalISO(current));
    current = addCycle(current, cycle);
  }
  return dates;
}

function addCycle(date: Date, cycle: Subscription['billingCycle']) {
  const result = new Date(date);
  if (cycle === 'weekly') {
    result.setDate(result.getDate() + 7);
    return result;
  }

  const originalDay = result.getDate();
  result.setDate(1);
  if (cycle === 'yearly') {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + (cycle === 'quarterly' ? 3 : 1));
  }
  const finalDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, finalDay));
  return result;
}

function toLocalISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
