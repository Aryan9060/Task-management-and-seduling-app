import { Router } from 'express';
import authRoutes from './auth.routes.js';
import taskRoutes from './task.routes.js';
import occurrenceRoutes from './occurrence.routes.js';
import categoryRoutes from './category.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import userRoutes from './user.routes.js';
import notificationRoutes from './notification.routes.js';
import timerRoutes from './timer.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/occurrences', occurrenceRoutes);
router.use('/categories', categoryRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);
router.use('/timer', timerRoutes);

export default router;
