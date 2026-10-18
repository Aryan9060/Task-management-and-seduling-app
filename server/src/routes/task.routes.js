import { Router } from 'express';
import * as tasks from '../controllers/task.controller.js';
import * as comments from '../controllers/comment.controller.js';
import * as timeEntries from '../controllers/timeEntry.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/', tasks.createTask);
router.get('/', tasks.listTasks);
router.get('/:taskId/activities', tasks.getTaskActivities);
router.get('/:taskId/comments', comments.listComments);
router.post('/:taskId/comments', comments.createComment);
router.delete('/:taskId/comments/:commentId', comments.deleteComment);
router.post('/:taskId/subtasks', tasks.createSubtask);
router.get('/:taskId/subtasks', tasks.getSubtasks);
router.get('/:taskId/occurrences', tasks.getOccurrences);
router.post('/:taskId/occurrences', tasks.createOccurrence);
router.post('/:taskId/timer/start', timeEntries.startTimer);
router.post('/:taskId/timer/stop', timeEntries.stopTimer);
router.get('/:taskId/time-entries', timeEntries.listTimeEntries);
router.post('/:taskId/time-entries', timeEntries.createManualEntry);
router.post('/:taskId/assignees', tasks.setAssignees);
router.delete('/:taskId/assignees/:userId', tasks.removeAssignee);
router.get('/:taskId', tasks.getTask);
router.patch('/:taskId', tasks.updateTask);
router.delete('/:taskId', tasks.archiveTask);
router.post('/:taskId/restore', tasks.restoreTask);

export default router;
