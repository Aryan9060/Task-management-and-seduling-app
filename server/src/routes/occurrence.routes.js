import { Router } from 'express';
import * as tasks from '../controllers/task.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.patch('/:occurrenceId', tasks.updateOccurrence);

export default router;
