import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export const REFRESH_COOKIE = 'tm_refresh';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_TTL || '30d',
  });
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenRecord(token) {
  return {
    tokenHash: hashToken(token),
    expiresAt: new Date(jwt.decode(token).exp * 1000),
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
  };
}

export function setRefreshCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(),
    maxAge: exp * 1000 - Date.now(),
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}
