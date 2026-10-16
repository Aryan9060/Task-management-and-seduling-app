import { Router } from 'express';
import * as notifications from '../controllers/notification.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', notifications.listNotifications);
router.post('/read-all', notifications.markAllNotificationsRead);
router.patch('/:notificationId/read', notifications.markNotificationRead);

export default router;
