import { Router } from 'express';
import { searchUsers } from '../controllers/user.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', searchUsers);

export default router;
