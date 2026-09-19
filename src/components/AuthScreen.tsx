import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  registerLocalAccount,
  signInLocalAccount,
  type AuthUser,
} from '../auth';
import { colors, shadows } from '../theme';
import { PressableScale } from './PressableScale';

type Props = {
  registeredUser: AuthUser | null;
  onAuthenticated: (user: AuthUser) => void;
};

export function AuthScreen({ registeredUser, onAuthenticated }: Props) {
  const isRegistration = registeredUser === null;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(registeredUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = isRegistration
        ? await registerLocalAccount({ displayName, email, password, confirmPassword })
        : await signInLocalAccount(email, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onAuthenticated(result.user);
    } catch {
      setError('Secure sign-in is unavailable right now. Please restart the app and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <MaterialCommunityIcons name="shield-lock-outline" size={29} color={colors.rose} />
            </View>
            <Text style={styles.brandText}>SubTrack</Text>
          </View>

          <View style={styles.headingWrap}>
            <Text style={styles.eyebrow}>{isRegistration ? 'FIRST, SECURE YOUR APP' : 'SECURE SIGN IN'}</Text>
            <Text style={styles.title}>{isRegistration ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.caption}>
              {isRegistration
                ? 'Register your own account before tracking subscriptions. There are no demo or test accounts.'
                : `Sign in to continue as ${registeredUser.displayName}.`}
            </Text>
          </View>

          <View style={styles.card}>
            {isRegistration && (
              <AuthField
                label="Name"
                icon="account-outline"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
            )}
            <AuthField
              label="Email"
              icon="email-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
            />
            <AuthField
              label="Password"
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder={isRegistration ? 'At least 10 characters' : 'Enter your password'}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isRegistration ? 'new-password' : 'current-password'}
              textContentType={isRegistration ? 'newPassword' : 'password'}
              onSubmitEditing={isRegistration ? undefined : () => void submit()}
              rightAction={(
                <PressableScale
                  haptic={false}
                  style={styles.eyeButton}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  <MaterialCommunityIcons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                    color={colors.slate}
                  />
                </PressableScale>
              )}
            />
            {isRegistration && (
              <>
                <Text style={styles.passwordHint}>Use 10-128 characters with at least one letter and one number.</Text>
                <AuthField
                  label="Confirm password"
                  icon="lock-check-outline"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Enter it again"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  onSubmitEditing={() => void submit()}
                />
              </>
            )}

            {error && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <PressableScale
              containerStyle={styles.buttonSlot}
              style={styles.button}
              disabled={busy}
              onPress={() => void submit()}
              accessibilityLabel={isRegistration ? 'Create secure account' : 'Sign in securely'}
            >
              <LinearGradient
                colors={[colors.rose, colors.peach]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Text style={styles.buttonText}>{isRegistration ? 'Create Account' : 'Sign In'}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={21} color={colors.white} />
                  </>
                )}
              </LinearGradient>
            </PressableScale>
          </View>

          <View style={styles.securityNote}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.success} />
            <Text style={styles.securityText}>
              Your password is hardened and protected by this device's secure storage. It is never saved as plain text.
            </Text>
          </View>
          <Text style={styles.localOnlyNote}>
            Local account only | Uninstalling on Android removes the account and local data
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type AuthFieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  rightAction?: React.ReactNode;
};

function AuthField({ label, icon, rightAction, ...inputProps }: AuthFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <MaterialCommunityIcons name={icon} size={21} color={colors.slate} />
        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor="#999AA1"
          selectionColor={colors.rose}
          importantForAutofill="yes"
          returnKeyType={inputProps.onSubmitEditing ? 'done' : 'next'}
          maxLength={label === 'Email' ? 254 : label === 'Name' ? 40 : 128}
        />
        {rightAction}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flexOne: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingTop: 22, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 28 },
  brandIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.rose}1E` },
  brandText: { color: colors.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.55 },
  headingWrap: { marginBottom: 20 },
  eyebrow: { color: colors.rose, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.75, textAlign: 'center', marginTop: 7 },
  caption: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  card: { backgroundColor: `${colors.surface}F5`, borderRadius: 25, borderWidth: 1, borderColor: colors.white, padding: 18, ...shadows.card },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { color: colors.ink, fontSize: 12.5, fontWeight: '800', marginBottom: 7, marginLeft: 2 },
  inputWrap: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 17, borderWidth: 1, borderColor: colors.line, paddingLeft: 15, paddingRight: 6 },
  input: { flex: 1, height: '100%', color: colors.ink, fontSize: 15, paddingVertical: 0 },
  eyeButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  passwordHint: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: -7, marginBottom: 13, paddingHorizontal: 3 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, backgroundColor: `${colors.danger}12`, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  buttonSlot: { width: '100%', marginTop: 4 },
  button: { width: '100%', borderRadius: 18, overflow: 'hidden', ...shadows.card },
  buttonGradient: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 20 },
  buttonText: { color: colors.white, fontSize: 15.5, fontWeight: '900' },
  securityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${colors.success}13`, borderRadius: 16, padding: 14, marginTop: 18 },
  securityText: { flex: 1, color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  localOnlyNote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 13, paddingHorizontal: 12 },
});
