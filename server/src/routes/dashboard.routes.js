import { Router } from 'express';
import * as dashboard from '../controllers/dashboard.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/summary', dashboard.getSummary);

export default router;
