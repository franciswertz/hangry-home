import type { IncomingMessage } from 'http';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const authBaseUrl = process.env.AUTHLOCAL_URL ?? 'https://auth.local';
const authIssuer = process.env.AUTH_ISSUER ?? authBaseUrl;
const authAudience = process.env.AUTH_AUDIENCE ?? 'authlocal';
const requiredRole = process.env.AUTH_REQUIRED_ROLE ?? 'hangry-user';
const jwks = createRemoteJWKSet(new URL(`${authBaseUrl}/.well-known/jwks.json`));

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) return '';
  if (!authorizationHeader.startsWith('Bearer ')) return '';
  return authorizationHeader.slice('Bearer '.length).trim();
};

const getTokenFromUrl = (url?: string) => {
  if (!url) return '';
  const parsed = new URL(url, 'http://localhost');
  return parsed.searchParams.get('access_token') ?? parsed.searchParams.get('token') ?? '';
};

const verifyAccessToken = async (token: string) => {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: authIssuer,
    audience: authAudience,
  });
  return payload;
};

const hasRequiredRole = (payload: JWTPayload) => {
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  return roles.includes(requiredRole);
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    if (!hasRequiredRole(payload)) {
      res.status(403).json({ error: 'Missing required role' });
      return;
    }
    (req as Request & { user?: JWTPayload }).user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid access token' });
  }
};

export const verifyRequestAuth = async (req: IncomingMessage) => {
  const token = getBearerToken(req.headers.authorization) || getTokenFromUrl(req.url);
  if (!token) {
    return { ok: false as const, status: 401, message: 'Missing access token' };
  }

  try {
    const payload = await verifyAccessToken(token);
    if (!hasRequiredRole(payload)) {
      return { ok: false as const, status: 403, message: 'Missing required role' };
    }
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, status: 401, message: 'Invalid access token' };
  }
};
