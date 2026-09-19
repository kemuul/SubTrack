import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from './src/components/PressableScale';
import { AuthScreen } from './src/components/AuthScreen';
import {
  readAuthSnapshot,
  signOutLocalAccount,
  type AuthUser,
} from './src/auth';
import {
  createSubscription,
  deleteSubscription,
  getSubscriptions,
  migrateDatabase,
  setNotificationId,
  updateSubscription,
} from './src/database';
import {
  cancelReminder,
  prepareNotifications,
  scheduleRenewalReminder,
} from './src/notifications';
import { categories, categoryMeta, colors, shadows } from './src/theme';
import type {
  BillingCycle,
  CategoryName,
  ScreenName,
  Subscription,
  SubscriptionDraft,
} from './src/types';
import {
  addBillingCycleDate,
  daysUntil,
  dueLabel,
  formatMonthDay,
  formatShortDate,
  greeting,
  isValidISODate,
  monthlyEquivalent,
  parseLocalDate,
  peso,
  todayISO,
  toLocalISODate,
  totalMonthly,
} from './src/utils';

const cycleLabels: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const ONBOARDING_COMPLETE_KEY = 'subtrack.onboarding.complete';

type AppStage = 'intro' | 'onboarding' | 'auth' | 'welcome' | 'dashboard';

const onboardingSlides: {
  title: string;
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  accent: string;
}[] = [
  {
    title: 'All your subscriptions, together',
    caption: 'Keep every service, price, and renewal date in one calm, organized place.',
    icon: 'credit-card-multiple-outline',
    color: colors.rose,
    accent: colors.peach,
  },
  {
    title: 'Know what you spend',
    caption: 'See your monthly estimate and understand where your subscription budget goes.',
    icon: 'chart-donut',
    color: colors.slate,
    accent: colors.apricot,
  },
  {
    title: 'Stay ahead of free trials',
    caption: 'Track trial end dates and get a reminder before the first paid billing date.',
    icon: 'timer-sand',
    color: '#A9BFA8',
    accent: colors.rose,
  },
  {
    title: 'Simple, private, and ready',
    caption: 'Your subscription data stays on this device, ready whenever you need it.',
    icon: 'shield-check-outline',
    color: colors.peach,
    accent: colors.slate,
  },
];

const menuItems: {
  screen: Exclude<ScreenName, 'overview'>;
  title: string;
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
}[] = [
  { screen: 'subscriptions', title: 'Subscriptions', caption: 'View and manage', icon: 'credit-card-multiple-outline', color: colors.rose },
  { screen: 'calendar', title: 'Calendar', caption: 'Upcoming charges', icon: 'calendar-month-outline', color: colors.peach },
  { screen: 'analytics', title: 'Analytics', caption: 'Understand spending', icon: 'chart-donut', color: colors.slate },
  { screen: 'categories', title: 'Categories', caption: 'See where it goes', icon: 'shape-outline', color: colors.apricot },
  { screen: 'trials', title: 'Free trials', caption: 'Cancel in time', icon: 'timer-sand', color: '#A9BFA8' },
  { screen: 'form', title: 'Add new', caption: 'Track a subscription', icon: 'plus-circle-outline', color: '#A9A5C7' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="subtrack.db" onInit={migrateDatabase}>
        <SubTrackApp />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function SubTrackApp() {
  const db = useSQLiteContext();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [screen, setScreen] = useState<ScreenName>('overview');
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [formPreset, setFormPreset] = useState<'subscription' | 'trial'>('subscription');
  const [formReturnScreen, setFormReturnScreen] = useState<ScreenName>('overview');
  const [loaded, setLoaded] = useState(false);
  const [appStage, setAppStage] = useState<AppStage>('intro');
  const [registeredUser, setRegisteredUser] = useState<AuthUser | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenY = useRef(new Animated.Value(0)).current;
  const launchOpacity = useRef(new Animated.Value(1)).current;
  const launchScale = useRef(new Animated.Value(0.88)).current;

  const load = async () => {
    try {
      setSubscriptions(await getSubscriptions(db));
    } catch {
      Alert.alert('Could not load SubTrack', 'Please close and reopen the app.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
    void prepareNotifications().catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const onboardingStatus = Storage.getItem(ONBOARDING_COMPLETE_KEY).catch(() => null);
    const authStatus = readAuthSnapshot().catch(() => ({
      registeredUser: null,
      signedInUser: null,
    }));

    Animated.spring(launchScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 9,
      bounciness: 9,
    }).start();

    const timer = setTimeout(async () => {
      const [storedOnboarding, auth] = await Promise.all([onboardingStatus, authStatus]);
      if (!active) return;
      const hasCompletedOnboarding = storedOnboarding === 'true';
      setRegisteredUser(auth.registeredUser);
      setCurrentUser(auth.signedInUser);
      Animated.timing(launchOpacity, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && active) {
          if (!hasCompletedOnboarding) {
            setAppStage('onboarding');
          } else {
            setAppStage(auth.signedInUser ? 'welcome' : 'auth');
          }
        }
      });
    }, 1_050);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    screenOpacity.setValue(0);
    screenY.setValue(14);
    Animated.parallel([
      Animated.timing(screenOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(screenY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start();
  }, [screen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (appStage === 'onboarding' || appStage === 'welcome') return true;
      if (appStage !== 'dashboard') return false;
      if (screen === 'overview') return false;
      const destination = screen === 'form' ? formReturnScreen : 'overview';
      setEditing(null);
      setScreen(destination);
      return true;
    });
    return () => subscription.remove();
  }, [appStage, screen, formReturnScreen]);

  const completeOnboarding = async () => {
    try {
      await Storage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } finally {
      setAppStage(currentUser ? 'welcome' : 'auth');
    }
  };

  const authenticate = (user: AuthUser) => {
    setRegisteredUser(user);
    setCurrentUser(user);
    setScreen('overview');
    setAppStage('dashboard');
  };

  const requestSignOut = () => {
    if (!currentUser) return;
    Alert.alert(
      currentUser.displayName,
      currentUser.email,
      [
        { text: 'Stay signed in', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await signOutLocalAccount();
                setEditing(null);
                setCurrentUser(null);
                setScreen('overview');
                setAppStage('auth');
              } catch {
                Alert.alert('Could not sign out', 'Please close the app and try again.');
              }
            })();
          },
        },
      ],
    );
  };

  const navigate = (next: ScreenName) => {
    setScreen(next);
  };

  const openNewForm = (
    preset: 'subscription' | 'trial',
    returnScreen: ScreenName,
  ) => {
    setEditing(null);
    setFormPreset(preset);
    setFormReturnScreen(returnScreen);
    setScreen('form');
  };

  const edit = (subscription: Subscription, returnScreen: ScreenName) => {
    setEditing(subscription);
    setFormPreset(subscription.isTrial ? 'trial' : 'subscription');
    setFormReturnScreen(returnScreen);
    setScreen('form');
  };

  const save = async (draft: SubscriptionDraft) => {
    try {
      let saved: Subscription;
      if (editing) {
        await updateSubscription(db, editing.id, draft);
        await cancelReminder(editing.notificationId);
        saved = { ...editing, ...draft, notificationId: null };
      } else {
        saved = await createSubscription(db, draft);
      }
      let notificationId: string | null = null;
      try {
        notificationId = await scheduleRenewalReminder(saved);
      } catch {
        // Saving the subscription remains successful even if Android blocks alarms.
      }
      await setNotificationId(db, saved.id, notificationId);
      await load();
      setEditing(null);
      setScreen(draft.isTrial ? 'trials' : 'subscriptions');
      if (draft.notificationsEnabled && !notificationId) {
        Alert.alert(
          'Saved without a reminder',
          'Allow notifications in Android settings, or choose a billing date far enough in the future for the reminder window.',
        );
      }
    } catch {
      Alert.alert('Could not save subscription', 'Your changes were not saved. Please try again.');
    }
  };

  const remove = (subscription: Subscription) => {
    Alert.alert(
      `Remove ${subscription.name}?`,
      'This removes the subscription and its scheduled reminder from this device.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await cancelReminder(subscription.notificationId);
                await deleteSubscription(db, subscription.id);
                await load();
              } catch {
                Alert.alert('Could not remove subscription', 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  };

  let currentScreen;
  switch (screen) {
    case 'subscriptions':
      currentScreen = <SubscriptionsScreen items={subscriptions} onBack={() => navigate('overview')} onAdd={() => openNewForm('subscription', 'subscriptions')} onEdit={(item) => edit(item, 'subscriptions')} onDelete={remove} />;
      break;
    case 'calendar':
      currentScreen = <CalendarScreen items={subscriptions} onBack={() => navigate('overview')} />;
      break;
    case 'analytics':
      currentScreen = <AnalyticsScreen items={subscriptions} onBack={() => navigate('overview')} />;
      break;
    case 'categories':
      currentScreen = <CategoriesScreen items={subscriptions} onBack={() => navigate('overview')} />;
      break;
    case 'trials':
      currentScreen = <TrialsScreen items={subscriptions} onBack={() => navigate('overview')} onAdd={() => openNewForm('trial', 'trials')} onEdit={(item) => edit(item, 'trials')} />;
      break;
    case 'form':
      currentScreen = (
        <SubscriptionForm
          initial={editing}
          startAsTrial={formPreset === 'trial'}
          onBack={() => {
            setEditing(null);
            navigate(formReturnScreen);
          }}
          onSave={save}
        />
      );
      break;
    default:
      currentScreen = (
        <Overview
          items={subscriptions}
          loaded={loaded}
          user={currentUser}
          onNavigate={navigate}
          onAddSubscription={() => openNewForm('subscription', 'overview')}
          onAddTrial={() => openNewForm('trial', 'overview')}
          onAccountPress={requestSignOut}
        />
      );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />
      {appStage === 'dashboard' && (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <Animated.View style={[styles.screen, { opacity: screenOpacity, transform: [{ translateY: screenY }] }]}>
            {currentScreen}
          </Animated.View>
        </SafeAreaView>
      )}
      {appStage === 'onboarding' && <Onboarding onComplete={completeOnboarding} />}
      {appStage === 'auth' && (
        <AuthScreen registeredUser={registeredUser} onAuthenticated={authenticate} />
      )}
      {appStage === 'welcome' && currentUser && (
        <WelcomeBack user={currentUser} onDone={() => setAppStage('dashboard')} />
      )}
      {appStage === 'intro' && (
        <Animated.View style={[styles.launch, { opacity: launchOpacity }]}>
          <Animated.View style={[styles.launchInner, { transform: [{ scale: launchScale }] }]}>
            <Image
              accessibilityLabel="SubTracker logo"
              resizeMode="contain"
              source={require('./assets/subtrack-logo.png')}
              style={styles.launchLogo}
            />
            <Text style={styles.launchCaption}>Keep every renewal in sight.</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function Onboarding({ onComplete }: { onComplete: () => Promise<void> }) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const lastSlide = activeSlide === onboardingSlides.length - 1;
  const compact = height < 700;
  const circleSize = Math.min(218, Math.max(158, height * 0.29));

  const advance = () => {
    if (lastSlide) {
      void onComplete();
      return;
    }
    const nextSlide = activeSlide + 1;
    setActiveSlide(nextSlide);
    scrollRef.current?.scrollTo({ x: width * nextSlide, animated: true });
  };

  return (
    <SafeAreaView style={styles.onboarding} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.onboardingBrand}>
        <MaterialCommunityIcons name="credit-card-clock-outline" size={26} color={colors.rose} />
        <Text style={styles.onboardingBrandText}>SubTrack</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const nextSlide = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveSlide(Math.max(0, Math.min(nextSlide, onboardingSlides.length - 1)));
        }}
        style={styles.onboardingScroll}
      >
        {onboardingSlides.map((slide, index) => (
          <OnboardingSlide
            key={slide.title}
            {...slide}
            active={activeSlide === index}
            width={width}
            compact={compact}
            circleSize={circleSize}
            position={index + 1}
          />
        ))}
      </ScrollView>
      <View style={styles.onboardingFooter}>
        <View accessible style={styles.slideDots} accessibilityLabel={`Slide ${activeSlide + 1} of ${onboardingSlides.length}`}>
          {onboardingSlides.map((slide, index) => (
            <View
              key={slide.title}
              style={[styles.slideDot, activeSlide === index && styles.slideDotActive]}
            />
          ))}
        </View>
        <PressableScale
          containerStyle={styles.onboardingButtonSlot}
          style={styles.onboardingButton}
          onPress={advance}
          accessibilityLabel={lastSlide ? 'Get started with SubTrack' : `Continue to slide ${activeSlide + 2}`}
        >
          <LinearGradient colors={[colors.rose, colors.peach]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.onboardingButtonGradient}>
            <Text style={styles.onboardingButtonText}>{lastSlide ? 'Get Started' : 'Next'}</Text>
            <MaterialCommunityIcons name={lastSlide ? 'check' : 'arrow-right'} size={21} color={colors.white} />
          </LinearGradient>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

function OnboardingSlide({
  title,
  caption,
  icon,
  color,
  accent,
  active,
  width,
  compact,
  circleSize,
  position,
}: (typeof onboardingSlides)[number] & { active: boolean; width: number; compact: boolean; circleSize: number; position: number }) {
  const reveal = useRef(new Animated.Value(active ? 1 : 0.84)).current;

  useEffect(() => {
    Animated.spring(reveal, {
      toValue: active ? 1 : 0.84,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
  }, [active]);

  return (
    <View style={[styles.onboardingSlide, compact && styles.onboardingSlideCompact, { width }]}>
      <Text style={[styles.slideCount, compact && styles.slideCountCompact]}>0{position}</Text>
      <Animated.View
        style={[
          styles.slideCircle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: color,
            opacity: reveal,
            transform: [{ scale: reveal }],
          },
        ]}
      >
        <View
          style={[
            styles.slideOrbit,
            {
              width: circleSize * 0.83,
              height: circleSize * 0.83,
              borderRadius: circleSize * 0.415,
              borderColor: accent,
            },
          ]}
        />
        <MaterialCommunityIcons name={icon} size={compact ? 62 : 76} color={colors.white} />
      </Animated.View>
      <Text style={[styles.slideTitle, compact && styles.slideTitleCompact]}>{title}</Text>
      <Text style={[styles.slideCaption, compact && styles.slideCaptionCompact]}>{caption}</Text>
    </View>
  );
}

function WelcomeBack({ user, onDone }: { user: AuthUser; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 12, bounciness: 7, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true })
        .start(({ finished }) => {
          if (finished) onDone();
        });
    }, 1_250);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.welcomeBack} edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View style={[styles.welcomeBackInner, { opacity, transform: [{ scale }] }] }>
        <View style={styles.welcomeAvatar}>
          <MaterialCommunityIcons name="account-check-outline" size={49} color={colors.white} />
        </View>
        <Text style={styles.welcomeEyebrow}>SIGNED IN SECURELY</Text>
        <Text style={styles.welcomeTitle}>Welcome back, {user.displayName.split(' ')[0]}</Text>
        <Text style={styles.welcomeCaption}>Your subscriptions are ready.</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

function Overview({ items, loaded, user, onNavigate, onAddSubscription, onAddTrial, onAccountPress }: { items: Subscription[]; loaded: boolean; user: AuthUser | null; onNavigate: (screen: ScreenName) => void; onAddSubscription: () => void; onAddTrial: () => void; onAccountPress: () => void }) {
  const monthly = totalMonthly(items);
  const next = items.find((item) => daysUntil(item.nextBillingDate) >= 0) ?? items[0];
  const trialCount = items.filter((item) => item.isTrial).length;
  const firstName = user?.displayName.split(' ')[0];
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.overviewContent}>
      <View style={styles.brandRow}>
        <View style={styles.brandCopy}>
          <Text style={styles.eyebrow}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.1}>Your SubTrack</Text>
        </View>
        <PressableScale style={styles.brandIcon} onPress={onAccountPress} accessibilityLabel="Open account options">
          <MaterialCommunityIcons name="account-circle-outline" size={27} color={colors.rose} />
        </PressableScale>
      </View>
      <LinearGradient colors={[colors.rose, '#D99D9E', colors.peach]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroGlow} />
        <Text style={styles.heroLabel}>ESTIMATED MONTHLY SPEND</Text>
        <Text style={styles.heroAmount}>{peso.format(monthly)}</Text>
        <View style={styles.heroMetaRow}>
          <View>
            <Text style={styles.heroMetaLabel}>Yearly projection</Text>
            <Text style={styles.heroMetaValue}>{peso.format(monthly * 12)}</Text>
          </View>
          <View style={styles.heroDivider} />
          <View>
            <Text style={styles.heroMetaLabel}>Active services</Text>
            <Text style={styles.heroMetaValue}>{items.length} {trialCount ? `· ${trialCount} trial` : ''}</Text>
          </View>
        </View>
      </LinearGradient>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <Text style={styles.sectionCaption}>Everything you need, right here</Text>
      </View>
      <View style={styles.menuGrid}>
        {menuItems.map((item) => (
          <PressableScale
            key={item.screen}
            containerStyle={[
              styles.menuCard,
              {
                backgroundColor: item.color,
              },
            ]}
            style={styles.menuCardContent}
            onPress={() => {
              if (item.screen === 'form') return onAddSubscription();
              if (item.screen === 'trials' && trialCount === 0) return onAddTrial();
              onNavigate(item.screen);
            }}
            accessibilityLabel={`${item.title}. ${item.caption}`}
          >
            <MaterialCommunityIcons name={item.icon} size={31} color={colors.ink} style={styles.menuIcon} />
            <Text style={styles.menuTitle} numberOfLines={2} maxFontSizeMultiplier={1.05}>{item.title}</Text>
            <Text style={styles.menuCaption} numberOfLines={1} maxFontSizeMultiplier={1.05}>{item.caption}</Text>
          </PressableScale>
        ))}
      </View>
      {loaded && (
        <View style={styles.nextCard}>
          <View style={styles.nextIcon}>
            <MaterialCommunityIcons name={next ? (next.icon as never) : 'calendar-heart'} size={24} color={next?.color ?? colors.slate} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.nextLabel}>NEXT CHARGE</Text>
            {next ? (
              <>
                <Text style={styles.nextTitle}>{next.name}</Text>
                <Text style={styles.nextCaption}>{formatShortDate(next.nextBillingDate)} · {dueLabel(next.nextBillingDate)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.nextTitle}>No subscriptions yet</Text>
                <Text style={styles.nextCaption}>Add one to start tracking renewals.</Text>
              </>
            )}
          </View>
          {next && <Text style={styles.nextAmount}>{peso.format(next.price)}</Text>}
        </View>
      )}
      <Text style={styles.localNote}><MaterialCommunityIcons name="shield-check-outline" size={14} /> Data stays on this device</Text>
    </ScrollView>
  );
}

function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <PressableScale style={styles.backButton} onPress={onBack} accessibilityLabel="Go back">
        <MaterialCommunityIcons name="arrow-left" size={23} color={colors.ink} />
      </PressableScale>
      <View style={styles.headerTextWrap}>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function SubscriptionsScreen({ items, onBack, onAdd, onEdit, onDelete }: { items: Subscription[]; onBack: () => void; onAdd: () => void; onEdit: (item: Subscription) => void; onDelete: (item: Subscription) => void }) {
  const [query, setQuery] = useState('');
  const filtered = items.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title="Subscriptions" subtitle={`${items.length} tracked locally`} onBack={onBack} />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search subscriptions" placeholderTextColor="#9B9CA3" style={styles.searchInput} returnKeyType="search" />
          {query.length > 0 && (
            <PressableScale onPress={() => setQuery('')} haptic={false}>
              <MaterialCommunityIcons name="close-circle" size={20} color={colors.slate} />
            </PressableScale>
          )}
        </View>
        <PrimaryButton label="Add subscription" icon="plus" onPress={onAdd} />
        {filtered.length ? filtered.map((item) => (
          <SubscriptionCard key={item.id} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
        )) : (
          <EmptyState icon="credit-card-plus-outline" title={query ? 'No matches found' : 'Start tracking today'} caption={query ? 'Try a different name or category.' : 'Add your first recurring payment and SubTrack will keep it in view.'} />
        )}
      </ScrollView>
    </View>
  );
}

function SubscriptionCard({ item, onEdit, onDelete }: { item: Subscription; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.subscriptionCard}>
      <View style={[styles.subscriptionIcon, { backgroundColor: `${item.color}26` }]}>
        <MaterialCommunityIcons name={item.icon as never} size={25} color={item.color} />
      </View>
      <View style={styles.flexOne}>
        <View style={styles.nameRow}>
          <Text style={styles.subscriptionName} numberOfLines={1}>{item.name}</Text>
          {item.isTrial && <Text style={styles.trialPill}>TRIAL</Text>}
        </View>
        <Text style={styles.subscriptionMeta}>{item.category} · {cycleLabels[item.billingCycle]}</Text>
        <Text style={styles.subscriptionDate}>{formatShortDate(item.nextBillingDate)} · {dueLabel(item.nextBillingDate)}</Text>
      </View>
      <View style={styles.priceActions}>
        <Text style={styles.subscriptionPrice}>{peso.format(item.price)}</Text>
        <View style={styles.actionRow}>
          <PressableScale onPress={onEdit} style={styles.miniAction} accessibilityLabel={`Edit ${item.name}`}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.slate} />
          </PressableScale>
          <PressableScale onPress={onDelete} style={styles.miniAction} accessibilityLabel={`Remove ${item.name}`}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

function CalendarScreen({ items, onBack }: { items: Subscription[]; onBack: () => void }) {
  const groups = useMemo(() => {
    const result = new Map<string, Subscription[]>();
    items.forEach((item) => {
      const key = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(`${item.nextBillingDate}T12:00:00`));
      result.set(key, [...(result.get(key) ?? []), item]);
    });
    return [...result.entries()];
  }, [items]);
  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title="Renewal calendar" subtitle="Your next billing dates" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        {groups.length ? groups.map(([month, monthItems]) => (
          <View key={month} style={styles.calendarSection}>
            <Text style={styles.calendarMonth}>{month}</Text>
            {monthItems.map((item, index) => {
              const monthDay = formatMonthDay(item.nextBillingDate).replace(',', '').split(' ');
              return (
                <View key={item.id} style={styles.calendarRow}>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeMonth}>{monthDay[0].toUpperCase()}</Text>
                    <Text style={styles.dateBadgeDay}>{monthDay[1]}</Text>
                  </View>
                  <View style={[styles.timeline, index === monthItems.length - 1 && styles.timelineLast]} />
                  <View style={styles.calendarDetails}>
                    <Text style={styles.subscriptionName}>{item.name}</Text>
                    <Text style={styles.subscriptionMeta}>{dueLabel(item.nextBillingDate)}</Text>
                  </View>
                  <Text style={styles.calendarPrice}>{peso.format(item.price)}</Text>
                </View>
              );
            })}
          </View>
        )) : <EmptyState icon="calendar-blank-outline" title="Your calendar is clear" caption="Billing dates appear here after you add a subscription." />}
      </ScrollView>
    </View>
  );
}

function AnalyticsScreen({ items, onBack }: { items: Subscription[]; onBack: () => void }) {
  const monthly = totalMonthly(items);
  const categoryStats = categories.map((category) => ({
    category,
    amount: items.filter((item) => item.category === category).reduce((sum, item) => sum + monthlyEquivalent(item.price, item.billingCycle), 0),
  })).filter((stat) => stat.amount > 0).sort((a, b) => b.amount - a.amount);
  const max = Math.max(...categoryStats.map((stat) => stat.amount), 1);
  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title="Spending insights" subtitle="Monthly equivalents in Philippine peso" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <View style={styles.analyticsSummary}>
          <View style={styles.analyticsIcon}><MaterialCommunityIcons name="chart-arc" size={31} color={colors.rose} /></View>
          <Text style={styles.analyticsLabel}>TOTAL PER MONTH</Text>
          <Text style={styles.analyticsAmount}>{peso.format(monthly)}</Text>
          <Text style={styles.analyticsCaption}>{peso.format(monthly * 12)} projected annually</Text>
        </View>
        <Text style={styles.blockTitle}>Spend by category</Text>
        <View style={styles.chartCard}>
          {categoryStats.length ? categoryStats.map((stat) => (
            <View key={stat.category} style={styles.barGroup}>
              <View style={styles.barLabelRow}>
                <View style={styles.inlineCenter}>
                  <MaterialCommunityIcons name={categoryMeta[stat.category].icon as never} size={18} color={categoryMeta[stat.category].color} />
                  <Text style={styles.barLabel}>{stat.category}</Text>
                </View>
                <Text style={styles.barValue}>{peso.format(stat.amount)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max((stat.amount / max) * 100, 5)}%`, backgroundColor: categoryMeta[stat.category].color }]} />
              </View>
            </View>
          )) : <Text style={styles.emptyInline}>Add subscriptions to unlock insights.</Text>}
        </View>
        <View style={styles.insightCard}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={25} color={colors.peach} />
          <View style={styles.flexOne}>
            <Text style={styles.insightTitle}>A useful baseline</Text>
            <Text style={styles.insightText}>Your recurring services account for {peso.format(monthly / 30)} per day on average.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function CategoriesScreen({ items, onBack }: { items: Subscription[]; onBack: () => void }) {
  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title="Categories" subtitle="A tidy view of recurring spending" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <View style={styles.categoryGrid}>
          {categories.map((category) => {
            const categoryItems = items.filter((item) => item.category === category);
            const meta = categoryMeta[category];
            return (
              <View key={category} style={styles.categoryCard}>
                <View style={[styles.categoryIcon, { backgroundColor: `${meta.color}26` }]}>
                  <MaterialCommunityIcons name={meta.icon as never} size={26} color={meta.color} />
                </View>
                <Text style={styles.categoryTitle}>{category}</Text>
                <Text style={styles.categoryCount}>{categoryItems.length} {categoryItems.length === 1 ? 'service' : 'services'}</Text>
                <Text style={styles.categoryAmount}>{peso.format(totalMonthly(categoryItems))} / mo</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function TrialsScreen({ items, onBack, onAdd, onEdit }: { items: Subscription[]; onBack: () => void; onAdd: () => void; onEdit: (item: Subscription) => void }) {
  const trials = items.filter((item) => item.isTrial).sort((a, b) => (a.trialEndDate ?? a.nextBillingDate).localeCompare(b.trialEndDate ?? b.nextBillingDate));
  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title="Free trials" subtitle="Know before the first charge" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <PrimaryButton label="Add a free trial" icon="plus" onPress={onAdd} />
        {trials.length ? trials.map((item) => {
          const endDate = item.trialEndDate ?? item.nextBillingDate;
          return (
            <PressableScale key={item.id} style={styles.trialCard} onPress={() => onEdit(item)} accessibilityLabel={`Edit ${item.name} trial`}>
              <View style={[styles.trialIcon, { backgroundColor: `${item.color}25` }]}><MaterialCommunityIcons name="timer-outline" size={27} color={item.color} /></View>
              <View style={styles.flexOne}>
                <Text style={styles.subscriptionName}>{item.name}</Text>
                <Text style={styles.subscriptionMeta}>Trial ends {formatShortDate(endDate)}</Text>
                <Text style={styles.trialDue}>{dueLabel(endDate)}</Text>
              </View>
              <View style={styles.trialPriceWrap}>
                <Text style={styles.subscriptionPrice}>{peso.format(item.price)}</Text>
                <Text style={styles.afterTrial}>after trial</Text>
              </View>
            </PressableScale>
          );
        }) : (
          <>
            <EmptyState icon="timer-sand-empty" title="No trials to watch" caption="Mark a subscription as a free trial and its end date will appear here." />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SubscriptionForm({ initial, startAsTrial, onBack, onSave }: { initial: Subscription | null; startAsTrial: boolean; onBack: () => void; onSave: (draft: SubscriptionDraft) => Promise<void> }) {
  const defaultDate = useMemo(() => {
    return toLocalISODate(addBillingCycleDate(new Date(), 'monthly'));
  }, []);
  const defaultTrialDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toLocalISODate(date);
  }, []);
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [category, setCategory] = useState<CategoryName>(initial?.category ?? 'Entertainment');
  const [cycle, setCycle] = useState<BillingCycle>(initial?.billingCycle ?? 'monthly');
  const [billingDate, setBillingDate] = useState(initial?.nextBillingDate ?? (startAsTrial ? defaultTrialDate : defaultDate));
  const [isTrial, setIsTrial] = useState(initial?.isTrial ?? startAsTrial);
  const [trialEndDate, setTrialEndDate] = useState(initial?.trialEndDate ?? defaultTrialDate);
  const [reminderDays, setReminderDays] = useState(initial?.reminderDays ?? 3);
  const [notificationsEnabled, setNotificationsEnabled] = useState(initial?.notificationsEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [showBillingPicker, setShowBillingPicker] = useState(false);
  const [showTrialPicker, setShowTrialPicker] = useState(false);
  const [selectedTrialDays, setSelectedTrialDays] = useState<number | null>(!initial && startAsTrial ? 7 : null);

  const chooseBillingCycle = (selectedCycle: BillingCycle) => {
    setCycle(selectedCycle);
    setBillingDate(
      toLocalISODate(addBillingCycleDate(new Date(), selectedCycle)),
    );
  };

  const chooseTrialDuration = (days: number) => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const date = toLocalISODate(endDate);
    setTrialEndDate(date);
    setBillingDate(date);
    setSelectedTrialDays(days);
  };

  const toggleTrial = (enabled: boolean) => {
    setIsTrial(enabled);
    if (enabled && !isTrial) chooseTrialDuration(7);
  };

  const changeBillingDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowBillingPicker(false);
    if (event.type === 'set' && date) setBillingDate(toLocalISODate(date));
  };

  const changeTrialEndDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowTrialPicker(false);
    if (event.type === 'set' && date) {
      setTrialEndDate(toLocalISODate(date));
      setBillingDate(toLocalISODate(date));
      setSelectedTrialDays(null);
    }
  };

  const submit = async () => {
    const numericPrice = Number(price.replace(/,/g, ''));
    if (!name.trim()) return Alert.alert('Add a name', 'Enter the service or subscription name.');
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return Alert.alert('Check the amount', 'Enter a price greater than zero.');
    if (!isValidISODate(billingDate)) return Alert.alert('Check the billing date', 'Use the YYYY-MM-DD format.');
    if (isTrial && !isValidISODate(trialEndDate)) return Alert.alert('Check the trial end date', 'Use the YYYY-MM-DD format.');
    const meta = categoryMeta[category];
    setSaving(true);
    await onSave({
      name: name.trim(), price: numericPrice, category, billingCycle: cycle,
      nextBillingDate: billingDate, color: meta.color, icon: meta.icon,
      isTrial, trialEndDate: isTrial ? trialEndDate : null,
      reminderDays, notificationsEnabled,
    });
    setSaving(false);
  };

  return (
    <View style={styles.fullScreen}>
      <ScreenHeader title={initial ? (initial.isTrial ? 'Edit free trial' : 'Edit subscription') : (startAsTrial ? 'New free trial' : 'New subscription')} subtitle="Stored privately on this device" onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
          <FieldLabel icon="text-short" label="Subscription name" />
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Netflix" placeholderTextColor="#A2A1A0" autoCapitalize="words" returnKeyType="next" />
          <FieldLabel icon="cash" label="Price in Philippine peso" />
          <View style={styles.amountInputWrap}>
            <Text style={styles.pesoPrefix}>₱</Text>
            <TextInput style={styles.amountInput} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor="#A2A1A0" keyboardType="decimal-pad" />
          </View>
          <FieldLabel icon="shape-outline" label="Category" />
          <View style={styles.chipWrap}>
            {categories.map((item) => <ChoiceChip key={item} selected={item === category} label={item} icon={categoryMeta[item].icon} color={categoryMeta[item].color} onPress={() => setCategory(item)} />)}
          </View>
          <FieldLabel icon="repeat" label="Billing cycle" />
          <View style={styles.chipWrap}>
            {(Object.keys(cycleLabels) as BillingCycle[]).map((item) => <ChoiceChip key={item} selected={item === cycle} label={cycleLabels[item]} onPress={() => chooseBillingCycle(item)} />)}
          </View>
          <FieldLabel icon="calendar-outline" label="Next billing date" />
          <View style={styles.dateInputWrap}>
            <TextInput style={styles.dateTextInput} value={billingDate} onChangeText={setBillingDate} placeholder={todayISO()} placeholderTextColor="#A2A1A0" keyboardType="numbers-and-punctuation" maxLength={10} />
            <PressableScale style={styles.calendarButton} onPress={() => setShowBillingPicker(true)} accessibilityLabel="Choose next billing date from calendar">
              <MaterialCommunityIcons name="calendar-month-outline" size={23} color={colors.rose} />
            </PressableScale>
          </View>
          <Text style={styles.helperText}>Choose from the calendar or use YYYY-MM-DD</Text>
          {showBillingPicker && (
            <DateTimePicker
              value={isValidISODate(billingDate) ? parseLocalDate(billingDate) : new Date()}
              mode="date"
              display={Platform.OS === 'android' ? 'calendar' : 'compact'}
              minimumDate={new Date()}
              onChange={changeBillingDate}
              accentColor={colors.rose}
            />
          )}
          <View style={styles.toggleCard}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.inlineCenter}><MaterialCommunityIcons name="timer-sand" size={21} color={colors.rose} /><Text style={styles.toggleTitle}>This is a free trial</Text></View>
              <Text style={styles.toggleCaption}>Track the last free day before billing starts.</Text>
            </View>
            <Switch value={isTrial} onValueChange={toggleTrial} trackColor={{ false: '#D7D2CB', true: colors.peach }} thumbColor={isTrial ? colors.rose : '#F8F5EF'} />
          </View>
          {isTrial && (
            <>
              <FieldLabel icon="timer-edit-outline" label="Quick trial length" />
              <View style={styles.chipWrap}>
                {[1, 3, 7].map((days) => (
                  <ChoiceChip
                    key={days}
                    selected={selectedTrialDays === days}
                    label={`${days} day${days > 1 ? 's' : ''}`}
                    icon="clock-fast"
                    color={colors.peach}
                    onPress={() => chooseTrialDuration(days)}
                  />
                ))}
              </View>
              <FieldLabel icon="calendar-clock" label="Trial end date" />
              <View style={styles.dateInputWrap}>
                <TextInput
                  style={styles.dateTextInput}
                  value={trialEndDate}
                  onChangeText={(value) => {
                    setTrialEndDate(value);
                    setSelectedTrialDays(null);
                  }}
                  placeholder={todayISO()}
                  placeholderTextColor="#A2A1A0"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                <PressableScale style={styles.calendarButton} onPress={() => setShowTrialPicker(true)} accessibilityLabel="Choose trial end date from calendar">
                  <MaterialCommunityIcons name="calendar-month-outline" size={23} color={colors.rose} />
                </PressableScale>
              </View>
              <Text style={styles.helperText}>Use a quick length, calendar, or enter YYYY-MM-DD</Text>
              {showTrialPicker && (
                <DateTimePicker
                  value={isValidISODate(trialEndDate) ? parseLocalDate(trialEndDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'android' ? 'calendar' : 'compact'}
                  minimumDate={new Date()}
                  onChange={changeTrialEndDate}
                  accentColor={colors.rose}
                />
              )}
            </>
          )}
          <View style={styles.toggleCard}>
            <View style={styles.toggleTextWrap}>
              <View style={styles.inlineCenter}><MaterialCommunityIcons name="bell-outline" size={21} color={colors.slate} /><Text style={styles.toggleTitle}>Renewal reminder</Text></View>
              <Text style={styles.toggleCaption}>A local notification, even when SubTrack is closed.</Text>
            </View>
            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: '#D7D2CB', true: colors.apricot }} thumbColor={notificationsEnabled ? colors.slate : '#F8F5EF'} />
          </View>
          {notificationsEnabled && (
            <>
              <FieldLabel icon="clock-alert-outline" label="Remind me before" />
              <View style={styles.chipWrap}>
                {[0, 1, 3, 7].map((days) => <ChoiceChip key={days} selected={days === reminderDays} label={days === 0 ? 'Same day' : `${days} day${days > 1 ? 's' : ''}`} onPress={() => setReminderDays(days)} />)}
              </View>
            </>
          )}
          <PrimaryButton label={saving ? 'Saving…' : initial ? 'Save changes' : startAsTrial ? 'Track free trial' : 'Start tracking'} icon={saving ? 'timer-sand' : 'check'} onPress={() => void submit()} disabled={saving} />
          <Text style={styles.formFooter}>No account required · Local database only</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldLabel({ icon, label }: { icon: string; label: string }) {
  return <View style={styles.fieldLabelRow}><MaterialCommunityIcons name={icon as never} size={18} color={colors.slate} /><Text style={styles.fieldLabel}>{label}</Text></View>;
}

function ChoiceChip({ selected, label, icon, color = colors.rose, onPress }: { selected: boolean; label: string; icon?: string; color?: string; onPress: () => void }) {
  return (
    <PressableScale style={[styles.choiceChip, selected && { borderColor: color, backgroundColor: `${color}1F` }]} onPress={onPress} accessibilityLabel={`${label}${selected ? ', selected' : ''}`}>
      {icon && <MaterialCommunityIcons name={icon as never} size={17} color={selected ? color : colors.muted} />}
      <Text style={[styles.choiceChipText, selected && { color: colors.ink }]}>{label}</Text>
    </PressableScale>
  );
}

function PrimaryButton({ label, icon, onPress, disabled = false }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale style={styles.primaryButton} onPress={onPress} disabled={disabled} accessibilityLabel={label}>
      <LinearGradient colors={[colors.rose, '#D99B98']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryGradient}>
        <MaterialCommunityIcons name={icon} size={21} color={colors.white} />
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function EmptyState({ icon, title, caption }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; caption: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><MaterialCommunityIcons name={icon} size={38} color={colors.rose} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.cream }, safeArea: { flex: 1 }, screen: { flex: 1 },
  fullScreen: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' }, flexOne: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.35 },
  blobTop: { width: 260, height: 260, backgroundColor: colors.peach, top: -125, right: -95 },
  blobBottom: { width: 230, height: 230, backgroundColor: colors.slate, bottom: -135, left: -110, opacity: 0.15 },
  overviewContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  brandCopy: { flex: 1, paddingRight: 14 },
  eyebrow: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  brandIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.white}C9`, borderWidth: 1, borderColor: `${colors.white}E0` },
  hero: { borderRadius: 28, padding: 24, overflow: 'hidden', ...shadows.card },
  heroGlow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, right: -45, top: -55, backgroundColor: '#FFFFFF25' },
  heroLabel: { color: '#FFF9F3CC', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroAmount: { color: colors.white, fontSize: 37, lineHeight: 47, fontWeight: '800', letterSpacing: -1.1, marginTop: 3 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  heroMetaLabel: { color: '#FFF9F3B8', fontSize: 11, marginBottom: 3 }, heroMetaValue: { color: colors.white, fontSize: 14, fontWeight: '700' },
  heroDivider: { width: 1, height: 34, backgroundColor: '#FFFFFF50', marginHorizontal: 22 },
  sectionHeadingRow: { marginTop: 28, marginBottom: 14 }, sectionTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sectionCaption: { color: colors.muted, fontSize: 13, marginTop: 2 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  menuCard: { width: '48%', maxWidth: 190, aspectRatio: 1, borderRadius: 23, ...shadows.card },
  menuCardContent: { flex: 1, padding: 12, alignItems: 'flex-start', justifyContent: 'flex-start' },
  menuIcon: { alignSelf: 'flex-start', marginBottom: 10 },
  menuTitle: { color: colors.ink, fontSize: 18, lineHeight: 22, fontWeight: '900', letterSpacing: -0.3 }, menuCaption: { color: '#474C59', fontSize: 13, lineHeight: 17, marginTop: 3, fontWeight: '500' },
  nextCard: { flexDirection: 'row', alignItems: 'center', marginTop: 18, padding: 17, borderRadius: 21, backgroundColor: `${colors.surface}E6`, borderWidth: 1, borderColor: '#FFFFFFD5' },
  nextIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: `${colors.slate}1C`, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  nextLabel: { color: colors.rose, fontSize: 9.5, letterSpacing: 1, fontWeight: '800' }, nextTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  nextCaption: { color: colors.muted, fontSize: 11.5, marginTop: 2 }, nextAmount: { color: colors.ink, fontSize: 14, fontWeight: '800', marginLeft: 8 },
  localNote: { alignSelf: 'center', color: colors.muted, fontSize: 11.5, marginTop: 18 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.surface}DE`, borderWidth: 1, borderColor: colors.white },
  headerTextWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 10 }, screenTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.35, textAlign: 'center' },
  screenSubtitle: { color: colors.muted, fontSize: 11.5, marginTop: 2, textAlign: 'center' }, headerSpacer: { width: 44 }, listContent: { paddingHorizontal: 20, paddingBottom: 42 },
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.white, marginBottom: 13 },
  searchInput: { flex: 1, height: '100%', color: colors.ink, fontSize: 15, paddingHorizontal: 10 },
  primaryButton: { borderRadius: 18, overflow: 'hidden', marginVertical: 8, ...shadows.card }, primaryGradient: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 20 },
  primaryButtonText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  subscriptionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.surface}F2`, borderRadius: 22, padding: 15, marginTop: 12, borderWidth: 1, borderColor: colors.white, ...shadows.card },
  subscriptionIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subscriptionName: { color: colors.ink, fontSize: 15.5, fontWeight: '800', flexShrink: 1 }, trialPill: { color: colors.rose, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, backgroundColor: `${colors.rose}1B`, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  subscriptionMeta: { color: colors.muted, fontSize: 11.5, marginTop: 3 }, subscriptionDate: { color: colors.rose, fontSize: 10.5, fontWeight: '700', marginTop: 4 },
  priceActions: { alignItems: 'flex-end', marginLeft: 7 }, subscriptionPrice: { color: colors.ink, fontSize: 13.5, fontWeight: '800' }, actionRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  miniAction: { width: 31, height: 31, borderRadius: 10, backgroundColor: `${colors.slate}12`, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', backgroundColor: `${colors.surface}D9`, borderRadius: 26, paddingHorizontal: 28, paddingVertical: 40, marginTop: 18, borderWidth: 1, borderColor: colors.white },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, backgroundColor: `${colors.rose}1A`, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' }, emptyCaption: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  calendarSection: { backgroundColor: `${colors.surface}E8`, borderRadius: 24, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: colors.white }, calendarMonth: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 13 },
  calendarRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', position: 'relative' }, dateBadge: { width: 47, height: 53, borderRadius: 15, backgroundColor: `${colors.rose}1C`, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  dateBadgeMonth: { color: colors.rose, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.5 }, dateBadgeDay: { color: colors.ink, fontSize: 19, fontWeight: '800', lineHeight: 22 },
  timeline: { position: 'absolute', width: 2, height: 23, left: 22.5, bottom: -1, backgroundColor: `${colors.rose}37` }, timelineLast: { display: 'none' },
  calendarDetails: { flex: 1, paddingHorizontal: 12 }, calendarPrice: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  analyticsSummary: { alignItems: 'center', padding: 25, borderRadius: 27, backgroundColor: `${colors.surface}EE`, borderWidth: 1, borderColor: colors.white, ...shadows.card },
  analyticsIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.rose}19`, marginBottom: 13 },
  analyticsLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, analyticsAmount: { color: colors.ink, fontSize: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 5 },
  analyticsCaption: { color: colors.rose, fontSize: 12, fontWeight: '700', marginTop: 5 }, blockTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 11 },
  chartCard: { backgroundColor: `${colors.surface}EA`, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.white }, barGroup: { marginBottom: 17 },
  barLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, inlineCenter: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' }, barValue: { color: colors.muted, fontSize: 12, fontWeight: '700' }, barTrack: { height: 8, borderRadius: 6, backgroundColor: '#ECE6DE', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 }, emptyInline: { color: colors.muted, textAlign: 'center', paddingVertical: 18 }, insightCard: { flexDirection: 'row', gap: 13, backgroundColor: `${colors.apricot}36`, borderRadius: 21, padding: 17, marginTop: 14 },
  insightTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' }, insightText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }, categoryCard: { width: '48.3%', minHeight: 160, padding: 16, borderRadius: 22, backgroundColor: `${colors.surface}ED`, borderWidth: 1, borderColor: colors.white, ...shadows.card },
  categoryIcon: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, categoryTitle: { color: colors.ink, fontSize: 14.5, fontWeight: '800' },
  categoryCount: { color: colors.muted, fontSize: 11, marginTop: 3 }, categoryAmount: { color: colors.rose, fontSize: 12, fontWeight: '800', marginTop: 10 },
  trialCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.surface}EE`, borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.white, ...shadows.card },
  trialIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, trialDue: { color: colors.rose, fontSize: 11, fontWeight: '800', marginTop: 5 },
  trialPriceWrap: { alignItems: 'flex-end', marginLeft: 8 }, afterTrial: { color: colors.muted, fontSize: 9.5, marginTop: 3 }, formContent: { paddingHorizontal: 20, paddingBottom: 48 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 8 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  input: { height: 54, borderRadius: 17, paddingHorizontal: 16, backgroundColor: colors.surface, color: colors.ink, fontSize: 15, borderWidth: 1, borderColor: colors.white },
  amountInputWrap: { height: 54, flexDirection: 'row', alignItems: 'center', borderRadius: 17, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.white },
  pesoPrefix: { color: colors.rose, fontSize: 20, fontWeight: '800', marginRight: 8 }, amountInput: { flex: 1, height: '100%', color: colors.ink, fontSize: 17, fontWeight: '700' },
  dateInputWrap: { height: 54, flexDirection: 'row', alignItems: 'center', borderRadius: 17, paddingLeft: 16, paddingRight: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.white },
  dateTextInput: { flex: 1, height: '100%', color: colors.ink, fontSize: 15 },
  calendarButton: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.rose}18` },
  helperText: { color: colors.muted, fontSize: 10.5, marginTop: 5, marginLeft: 3 }, chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 13, backgroundColor: `${colors.surface}C9`, borderWidth: 1, borderColor: colors.line },
  choiceChipText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' }, toggleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.surface}D9`, borderRadius: 19, padding: 15, marginTop: 20, borderWidth: 1, borderColor: colors.white },
  toggleTextWrap: { flex: 1, paddingRight: 12 }, toggleTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '800' }, toggleCaption: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 5 },
  formFooter: { color: colors.muted, fontSize: 10.5, textAlign: 'center', marginTop: 8 }, launch: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  launchInner: { alignItems: 'center' },
  launchLogo: { width: 264, height: 271 },
  launchCaption: { color: colors.muted, fontSize: 13, marginTop: 14 },
  welcomeBack: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  welcomeBackInner: { width: '100%', maxWidth: 440, alignItems: 'center' },
  welcomeAvatar: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose, marginBottom: 24, ...shadows.card },
  welcomeEyebrow: { color: colors.rose, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  welcomeTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: 8 },
  welcomeCaption: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  onboarding: { flex: 1 },
  onboardingBrand: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  onboardingBrandText: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  onboardingScroll: { flex: 1 },
  onboardingSlide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 8, paddingBottom: 14 },
  onboardingSlideCompact: { paddingTop: 0, paddingBottom: 4 },
  slideCount: { color: colors.rose, fontSize: 12, fontWeight: '900', letterSpacing: 2.2, marginBottom: 15 },
  slideCountCompact: { marginBottom: 8 },
  slideCircle: { alignItems: 'center', justifyContent: 'center', marginBottom: 30, ...shadows.card },
  slideOrbit: { position: 'absolute', borderWidth: 2, opacity: 0.58 },
  slideTitle: { width: '100%', maxWidth: 420, color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.7, textAlign: 'center' },
  slideTitleCompact: { fontSize: 24, lineHeight: 29 },
  slideCaption: { width: '100%', maxWidth: 390, color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12, paddingHorizontal: 5 },
  slideCaptionCompact: { fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  onboardingFooter: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  slideDots: { height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 11 },
  slideDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: `${colors.slate}55` },
  slideDotActive: { width: 26, borderRadius: 4.5, backgroundColor: colors.rose },
  onboardingButtonSlot: { width: '100%' },
  onboardingButton: { width: '100%', borderRadius: 19, overflow: 'hidden', ...shadows.card },
  onboardingButtonGradient: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 22 },
  onboardingButtonText: { color: colors.white, fontSize: 16, fontWeight: '900' },
});
