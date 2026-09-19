export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type CategoryName =
  | 'Entertainment'
  | 'Music'
  | 'Productivity'
  | 'Utilities'
  | 'Health'
  | 'Education'
  | 'Other';

export interface Subscription {
  id: number;
  name: string;
  price: number;
  category: CategoryName;
  billingCycle: BillingCycle;
  nextBillingDate: string;
  color: string;
  icon: string;
  isTrial: boolean;
  trialEndDate: string | null;
  reminderDays: number;
  notificationsEnabled: boolean;
  notificationId: string | null;
  createdAt: string;
}

export type SubscriptionDraft = Omit<
  Subscription,
  'id' | 'notificationId' | 'createdAt'
>;

export type ScreenName =
  | 'overview'
  | 'subscriptions'
  | 'calendar'
  | 'analytics'
  | 'categories'
  | 'trials'
  | 'form';
