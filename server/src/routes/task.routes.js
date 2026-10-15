import { Router } from 'express';
import * as tasks from '../controllers/task.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/', tasks.createTask);
router.get('/', tasks.listTasks);
router.get('/:taskId/activities', tasks.getTaskActivities);
router.post('/:taskId/subtasks', tasks.createSubtask);
router.get('/:taskId/subtasks', tasks.getSubtasks);
router.post('/:taskId/assignees', tasks.setAssignees);
router.delete('/:taskId/assignees/:userId', tasks.removeAssignee);
router.get('/:taskId', tasks.getTask);
router.patch('/:taskId', tasks.updateTask);
router.delete('/:taskId', tasks.archiveTask);
router.post('/:taskId/restore', tasks.restoreTask);

export default router;
