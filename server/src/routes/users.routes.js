import { Router } from 'express';
import * as users from '../controllers/user.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', users.listUsers);

export default router;
