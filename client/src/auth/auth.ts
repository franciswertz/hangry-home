type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  scope?: string;
  tokenType?: string;
};

type OidcTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
};

type JwtPayload = {
  exp?: number;
  username?: string;
  displayName?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
};

const AUTH_BASE_URL = import.meta.env.VITE_AUTHLOCAL_URL ?? 'https://auth.local';
const AUTH_CLIENT_ID = import.meta.env.VITE_AUTHLOCAL_CLIENT_ID ?? 'g8SFQTVjiN0wEBIbAMNhd';
const ACCESS_TOKEN_KEY = 'hangry.accessToken';
const REFRESH_TOKEN_KEY = 'hangry.refreshToken';
const ID_TOKEN_KEY = 'hangry.idToken';
const OIDC_STATE_KEY = 'hangry.oidc.state';
const OIDC_VERIFIER_KEY = 'hangry.oidc.verifier';
const OIDC_NONCE_KEY = 'hangry.oidc.nonce';

const dispatchAuthEvent = (type: 'auth:login' | 'auth:logout') => {
  window.dispatchEvent(new CustomEvent(type));
};

const getRedirectUri = () =>
  import.meta.env.VITE_AUTHLOCAL_REDIRECT_URI ?? `${window.location.origin}/auth/callback`;

const base64UrlEncode = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
};

const createCodeVerifier = () => {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
};

const createCodeChallenge = async (verifier: string) => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
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

const fetchJson = async <T>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};

const postForm = async <T>(url: string, params: Record<string, string>) => {
  const body = new URLSearchParams(params);
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
};

const normalizeTokenResponse = (response: OidcTokenResponse): AuthTokens => ({
  accessToken: response.access_token,
  refreshToken: response.refresh_token,
  idToken: response.id_token,
  expiresIn: response.expires_in,
  refreshExpiresIn: response.refresh_expires_in,
  scope: response.scope,
  tokenType: response.token_type,
});

export const getAccessToken = () => sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? '';

export const getIdToken = () => sessionStorage.getItem(ID_TOKEN_KEY) ?? '';

export const getUserProfile = () => {
  const idToken = getIdToken();
  const accessToken = getAccessToken();
  const payload = idToken ? parseJwtPayload(idToken) : accessToken ? parseJwtPayload(accessToken) : null;
  const username = payload?.preferred_username ?? payload?.username ?? payload?.email ?? '';
  const displayName = payload?.name ?? payload?.displayName ?? '';
  return { username, displayName };
};

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY) ?? '';

export const setTokens = (tokens: AuthTokens) => {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.idToken) {
    sessionStorage.setItem(ID_TOKEN_KEY, tokens.idToken);
  } else {
    sessionStorage.removeItem(ID_TOKEN_KEY);
  }
  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
};

export const clearTokens = () => {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(OIDC_STATE_KEY);
  sessionStorage.removeItem(OIDC_VERIFIER_KEY);
  sessionStorage.removeItem(OIDC_NONCE_KEY);
  dispatchAuthEvent('auth:logout');
};

export const startOidcLogin = async () => {
  if (!AUTH_CLIENT_ID) {
    throw new Error('Missing OIDC client id. Set VITE_AUTHLOCAL_CLIENT_ID.');
  }
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = window.crypto.randomUUID();
  const nonce = window.crypto.randomUUID();

  sessionStorage.setItem(OIDC_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OIDC_STATE_KEY, state);
  sessionStorage.setItem(OIDC_NONCE_KEY, nonce);

  const params = new URLSearchParams({
    client_id: AUTH_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'openid profile email offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  const authorizeUrl = `${AUTH_BASE_URL}/authorize?${params.toString()}`;
  window.location.assign(authorizeUrl);
};

export const completeOidcLogin = async (search: string) => {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) {
    throw new Error(params.get('error_description') ?? error);
  }
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  if (!code) {
    throw new Error('Missing authorization code.');
  }
  const expectedState = sessionStorage.getItem(OIDC_STATE_KEY);
  if (!expectedState || expectedState !== state) {
    throw new Error('State mismatch.');
  }
  const codeVerifier = sessionStorage.getItem(OIDC_VERIFIER_KEY) ?? '';
  if (!codeVerifier) {
    throw new Error('Missing PKCE verifier.');
  }

  const tokenResponse = await postForm<OidcTokenResponse>(`${AUTH_BASE_URL}/token`, {
    grant_type: 'authorization_code',
    client_id: AUTH_CLIENT_ID,
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier,
  });

  const tokens = normalizeTokenResponse(tokenResponse);
  const refreshToken = tokens.refreshToken ?? getRefreshToken();
  setTokens({ ...tokens, refreshToken });

  sessionStorage.removeItem(OIDC_STATE_KEY);
  sessionStorage.removeItem(OIDC_VERIFIER_KEY);
  sessionStorage.removeItem(OIDC_NONCE_KEY);

  dispatchAuthEvent('auth:login');
  return tokens;
};

export const refreshTokens = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const tokenResponse = await postForm<OidcTokenResponse>(`${AUTH_BASE_URL}/token`, {
    grant_type: 'refresh_token',
    client_id: AUTH_CLIENT_ID,
    refresh_token: refreshToken,
  });
  const tokens = normalizeTokenResponse(tokenResponse);
  setTokens({ ...tokens, refreshToken: tokens.refreshToken ?? refreshToken });
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

export const logout = () => {
  clearTokens();
};
