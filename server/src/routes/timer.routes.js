import { Router } from 'express';
import * as timeEntries from '../controllers/timeEntry.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/active', timeEntries.getActiveTimer);

export default router;
