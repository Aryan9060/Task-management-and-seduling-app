import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/auth.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

// Counts only failed attempts, so routine token refreshes and successful
// logins never exhaust the budget for everyone sharing an IP.
const failedAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created, please try again later' },
});

router.post('/register', registerLimiter, auth.register);
router.post('/login', failedAttemptLimiter, auth.login);
router.post('/refresh', failedAttemptLimiter, auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;
