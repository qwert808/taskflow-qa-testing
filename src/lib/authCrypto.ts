import crypto from 'node:crypto';

const TOKEN_SECRET =
  process.env.SESSION_SECRET || 'taskflow-qa-lab-hmac-session-secret-v1';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const revokedTokenIds = new Set<string>();

export interface SessionTokenPayload {
  jti: string;
  userId: number;
  email: string;
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

export function signSessionToken(userId: number, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: SessionTokenPayload = {
    jti: crypto.randomUUID(),
    userId,
    email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(`${header}.${encodedPayload}`)
      .digest()
  );
  return `tf_${header}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  if (!token.startsWith('tf_')) return null;
  const raw = token.slice(3);
  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [header, encodedPayload, signature] = parts;
  const expectedSig = base64UrlEncode(
    crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(`${header}.${encodedPayload}`)
      .digest()
  );

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.userId || !payload.jti || payload.exp <= now) {
      return null;
    }
    if (revokedTokenIds.has(payload.jti)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string): void {
  const payload = verifySessionToken(token);
  if (payload?.jti) {
    revokedTokenIds.add(payload.jti);
  }
}
