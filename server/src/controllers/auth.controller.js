import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  hashToken,
  refreshTokenRecord,
  setRefreshCookie,
  clearRefreshCookie,
} from '../utils/tokens.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function startSession(res, user) {
  const refreshToken = signRefreshToken(user);
  const now = Date.now();
  user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt.getTime() > now);
  user.refreshTokens.push(refreshTokenRecord(refreshToken));
  await user.save();
  setRefreshCookie(res, refreshToken);
  return signAccessToken(user);
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, timeZone } = req.body ?? {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new HttpError(400, 'Name must be at least 2 characters');
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    ...(typeof timeZone === 'string' && timeZone.trim() ? { timeZone: timeZone.trim() } : {}),
  });

  const accessToken = await startSession(res, user);
  res.status(201).json({ accessToken, user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const accessToken = await startSession(res, user);
  res.json({ accessToken, user: user.toPublic() });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    throw new HttpError(401, 'No refresh token provided');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    clearRefreshCookie(res);
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    clearRefreshCookie(res);
    throw new HttpError(401, 'Account no longer exists');
  }

  const now = Date.now();
  const tokenHash = hashToken(token);
  const stored = user.refreshTokens.some(
    (t) => t.tokenHash === tokenHash && t.expiresAt.getTime() > now
  );
  if (!stored) {
    clearRefreshCookie(res);
    throw new HttpError(401, 'Refresh token has been revoked');
  }

  // Rotate: the presented token is single-use.
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t.tokenHash !== tokenHash && t.expiresAt.getTime() > now
  );
  const nextRefreshToken = signRefreshToken(user);
  user.refreshTokens.push(refreshTokenRecord(nextRefreshToken));
  await user.save();
  setRefreshCookie(res, nextRefreshToken);

  res.json({ accessToken: signAccessToken(user), user: user.toPublic() });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      await User.updateOne(
        { _id: payload.sub },
        { $pull: { refreshTokens: { tokenHash: hashToken(token) } } }
      );
    } catch {
      // Expired/invalid token: nothing to revoke, just clear the cookie.
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPublic() });
});
