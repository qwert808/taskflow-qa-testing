import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/authCrypto.ts';
import { findUserById, getOrCreateGoogleUser } from '../db/repository.ts';
import type { UserProfile } from '../lib/types.ts';

export const SESSION_COOKIE_NAME = 'taskflow_session';

export interface AuthRequest extends Request {
  authUser?: UserProfile;
  authToken?: string;
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Authentication token is required.' });
    return;
  }

  try {
    // 1. Check local TaskFlow signed session token
    if (token.startsWith('tf_')) {
      const payload = verifySessionToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Unauthorized: Session expired or invalid.' });
        return;
      }
      const user = await findUserById(payload.userId);
      if (!user) {
        res.status(401).json({ error: 'Unauthorized: Account no longer exists.' });
        return;
      }
      req.authUser = user;
      req.authToken = token;
      next();
      return;
    }

    // 2. Verify Firebase Auth ID token (Google Sign-In)
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      res.status(401).json({ error: 'Unauthorized: Account email is required.' });
      return;
    }
    const user = await getOrCreateGoogleUser(
      decoded.uid,
      decoded.email,
      typeof decoded.name === 'string' ? decoded.name : undefined
    );
    req.authUser = user;
    req.authToken = token;
    next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
  }
};
