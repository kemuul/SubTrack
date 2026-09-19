import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const ACCOUNT_KEY = 'subtrack.auth.account.v1';
const SESSION_KEY = 'subtrack.auth.session.v1';
const ATTEMPTS_KEY = 'subtrack.auth.attempts.v1';
const KEYCHAIN_SERVICE = 'com.subtrack.auth';

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 40 * 1024 * 1024;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type AuthUser = {
  id: string;
  displayName: string;
  email: string;
};

type AccountRecord = AuthUser & {
  version: 1;
  passwordHash: string;
  salt: string;
  createdAt: string;
  kdf: {
    name: 'scrypt';
    N: number;
    r: number;
    p: number;
    dkLen: number;
  };
};

type SessionRecord = {
  version: 1;
  accountId: string;
  token: string;
  issuedAt: string;
};

type AttemptRecord = {
  failures: number;
  lockUntil: number;
};

export type AuthSnapshot = {
  registeredUser: AuthUser | null;
  signedInUser: AuthUser | null;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; message: string; retryAfterSeconds?: number };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function publicUser(account: AccountRecord): AuthUser {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
  };
}

function isAccountRecord(value: unknown): value is AccountRecord {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<AccountRecord>;
  return account.version === 1
    && typeof account.id === 'string'
    && /^[0-9a-f-]{36}$/i.test(account.id)
    && typeof account.displayName === 'string'
    && account.displayName.length >= 2
    && account.displayName.length <= 40
    && typeof account.email === 'string'
    && account.email.length <= 254
    && typeof account.passwordHash === 'string'
    && /^[0-9a-f]{64}$/i.test(account.passwordHash)
    && typeof account.salt === 'string'
    && /^[0-9a-f]{32}$/i.test(account.salt)
    && typeof account.createdAt === 'string'
    && account.kdf?.name === 'scrypt'
    && account.kdf.N === SCRYPT_N
    && account.kdf.r === SCRYPT_R
    && account.kdf.p === SCRYPT_P
    && account.kdf.dkLen === SCRYPT_KEY_LENGTH;
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<SessionRecord>;
  return session.version === 1
    && typeof session.accountId === 'string'
    && typeof session.token === 'string'
    && /^[0-9a-f]{64}$/i.test(session.token)
    && typeof session.issuedAt === 'string';
}

function parseRecord<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

async function ensureSecureStorage() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure storage is not available on this device.');
  }
}

async function getAccount() {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY, secureStoreOptions);
  return parseRecord(raw, isAccountRecord);
}

async function derivePassword(password: string, account: Pick<AccountRecord, 'salt' | 'kdf'>) {
  return scryptAsync(password, account.salt, {
    N: account.kdf.N,
    r: account.kdf.r,
    p: account.kdf.p,
    dkLen: account.kdf.dkLen,
    maxmem: SCRYPT_MAX_MEMORY,
    asyncTick: 8,
  });
}

async function createSession(accountId: string) {
  const token = bytesToHex(await Crypto.getRandomBytesAsync(32));
  const session: SessionRecord = {
    version: 1,
    accountId,
    token,
    issuedAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), secureStoreOptions);
}

async function readAttempts(): Promise<AttemptRecord> {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY, secureStoreOptions);
  if (!raw) return { failures: 0, lockUntil: 0 };
  try {
    const value = JSON.parse(raw) as Partial<AttemptRecord>;
    if (typeof value.failures !== 'number' || typeof value.lockUntil !== 'number') {
      return { failures: 0, lockUntil: 0 };
    }
    if (value.lockUntil > 0 && value.lockUntil <= Date.now()) {
      return { failures: 0, lockUntil: 0 };
    }
    return {
      failures: Math.max(0, Math.floor(value.failures)),
      lockUntil: Math.max(0, value.lockUntil),
    };
  } catch {
    return { failures: 0, lockUntil: 0 };
  }
}

async function recordFailedAttempt(previous: AttemptRecord) {
  const failures = previous.failures + 1;
  const next: AttemptRecord = failures >= MAX_FAILED_ATTEMPTS
    ? { failures: 0, lockUntil: Date.now() + LOCK_DURATION_MS }
    : { failures, lockUntil: 0 };
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(next), secureStoreOptions);
  return next;
}

function passwordValidationMessage(password: string) {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 128) return 'Use no more than 128 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

function emailIsValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function readAuthSnapshot(): Promise<AuthSnapshot> {
  await ensureSecureStorage();
  const [account, rawSession] = await Promise.all([
    getAccount(),
    SecureStore.getItemAsync(SESSION_KEY, secureStoreOptions),
  ]);
  const session = parseRecord(rawSession, isSessionRecord);

  if (!account) {
    if (rawSession) await SecureStore.deleteItemAsync(SESSION_KEY, secureStoreOptions);
    return { registeredUser: null, signedInUser: null };
  }

  const user = publicUser(account);
  if (!session || session.accountId !== account.id) {
    if (rawSession) await SecureStore.deleteItemAsync(SESSION_KEY, secureStoreOptions);
    return { registeredUser: user, signedInUser: null };
  }
  return { registeredUser: user, signedInUser: user };
}

export async function registerLocalAccount(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthResult> {
  await ensureSecureStorage();
  if (await getAccount()) {
    return { ok: false, message: 'An account already exists on this device. Sign in instead.' };
  }

  const displayName = input.displayName.trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(input.email);
  if (displayName.length < 2 || displayName.length > 40) {
    return { ok: false, message: 'Enter a name between 2 and 40 characters.' };
  }
  if (!emailIsValid(email)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const passwordProblem = passwordValidationMessage(input.password);
  if (passwordProblem) return { ok: false, message: passwordProblem };
  if (input.password !== input.confirmPassword) {
    return { ok: false, message: 'Passwords do not match.' };
  }

  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const kdf: AccountRecord['kdf'] = {
    name: 'scrypt',
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: SCRYPT_KEY_LENGTH,
  };
  const passwordHash = bytesToHex(await derivePassword(input.password, { salt, kdf }));
  const account: AccountRecord = {
    version: 1,
    id: Crypto.randomUUID(),
    displayName,
    email,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    kdf,
  };

  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(account), secureStoreOptions);
  try {
    await createSession(account.id);
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY, secureStoreOptions);
  } catch (error) {
    await SecureStore.deleteItemAsync(ACCOUNT_KEY, secureStoreOptions).catch(() => undefined);
    throw error;
  }
  return { ok: true, user: publicUser(account) };
}

export async function signInLocalAccount(emailInput: string, password: string): Promise<AuthResult> {
  await ensureSecureStorage();
  const account = await getAccount();
  if (!account) {
    return { ok: false, message: 'Register an account on this device before signing in.' };
  }

  const attempts = await readAttempts();
  if (attempts.lockUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((attempts.lockUntil - Date.now()) / 1000);
    return {
      ok: false,
      message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    };
  }

  const derived = await derivePassword(password, account);
  let passwordMatches = false;
  try {
    passwordMatches = constantTimeEqual(derived, hexToBytes(account.passwordHash));
  } catch {
    passwordMatches = false;
  }
  const credentialsMatch = normalizeEmail(emailInput) === account.email && passwordMatches;

  if (!credentialsMatch) {
    const nextAttempts = await recordFailedAttempt(attempts);
    if (nextAttempts.lockUntil > 0) {
      return {
        ok: false,
        message: 'Too many attempts. Sign-in is locked for 30 seconds.',
        retryAfterSeconds: 30,
      };
    }
    return { ok: false, message: 'Email or password is incorrect.' };
  }

  await createSession(account.id);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY, secureStoreOptions);
  return { ok: true, user: publicUser(account) };
}

export async function signOutLocalAccount() {
  await SecureStore.deleteItemAsync(SESSION_KEY, secureStoreOptions);
}
