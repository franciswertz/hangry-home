type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
};

type JwtPayload = {
  exp?: number;
  username?: string;
  displayName?: string;
  roles?: string[];
  [key: string]: unknown;
};

type WebAuthnBrowser = {
  startRegistration: (input: { optionsJSON: unknown }) => Promise<unknown>;
  startAuthentication: (input: { optionsJSON: unknown }) => Promise<unknown>;
};

const AUTH_BASE_URL = import.meta.env.VITE_AUTHLOCAL_URL ?? 'https://auth.local';
const ACCESS_TOKEN_KEY = 'hangry.accessToken';
const REFRESH_TOKEN_KEY = 'hangry.refreshToken';
const USERNAME_KEY = 'hangry.username';

const dispatchAuthEvent = (type: 'auth:login' | 'auth:logout') => {
  window.dispatchEvent(new CustomEvent(type));
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
};

const parseJwtPayload = (token: string): JwtPayload | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const decoded = base64UrlDecode(parts[1]);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
};

const isTokenExpired = (token: string) => {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + 30;
};

const getWebAuthnBrowser = () => {
  const browser = window.SimpleWebAuthnBrowser as WebAuthnBrowser | undefined;
  if (!browser) {
    throw new Error('WebAuthn helper not loaded. Check the SimpleWebAuthn script tag.');
  }
  return browser;
};

const fetchJson = async <T>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};

export const getStoredUsername = () => localStorage.getItem(USERNAME_KEY) ?? '';

export const setStoredUsername = (username: string) => {
  if (username.trim()) {
    localStorage.setItem(USERNAME_KEY, username.trim());
  }
};

export const getAccessToken = () => sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? '';

export const getUserProfile = () => {
  const token = getAccessToken();
  const payload = token ? parseJwtPayload(token) : null;
  const username = payload?.username ?? getStoredUsername();
  const displayName = payload?.displayName ?? '';
  return { username, displayName };
};

export const getRefreshToken = () => sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? '';

export const setTokens = (tokens: AuthTokens) => {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
};

export const clearTokens = () => {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  dispatchAuthEvent('auth:logout');
};

export const refreshTokens = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const tokens = await fetchJson<AuthTokens>(`${AUTH_BASE_URL}/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  setTokens(tokens);
  return tokens.accessToken;
};

export const ensureValidAccessToken = async () => {
  const accessToken = getAccessToken();
  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  try {
    const refreshed = await refreshTokens();
    return refreshed ?? '';
  } catch {
    clearTokens();
    return '';
  }
};

export const loginWithWebAuthn = async (username: string) => {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error('Username is required.');
  }

  const options = await fetchJson(`${AUTH_BASE_URL}/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: trimmed }),
  });

  const { startAuthentication } = getWebAuthnBrowser();
  const response = await startAuthentication({ optionsJSON: options });

  const tokens = await fetchJson<AuthTokens>(`${AUTH_BASE_URL}/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: trimmed, response }),
  });

  setTokens(tokens);
  setStoredUsername(trimmed);
  dispatchAuthEvent('auth:login');
  return tokens;
};

export const registerWithWebAuthn = async (username: string) => {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error('Username is required.');
  }

  const options = await fetchJson(`${AUTH_BASE_URL}/webauthn/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: trimmed }),
  });

  const { startRegistration } = getWebAuthnBrowser();
  const response = await startRegistration({ optionsJSON: options });

  await fetchJson(`${AUTH_BASE_URL}/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: trimmed, response }),
  });
};

export const logout = () => {
  clearTokens();
};

declare global {
  interface Window {
    SimpleWebAuthnBrowser?: WebAuthnBrowser;
  }
}
