import mongoose from 'mongoose';
import Task, { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import TaskActivity from '../models/TaskActivity.js';
import TaskOccurrence from '../models/TaskOccurrence.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  HORIZON_DAYS,
  addUtcDays,
  ensureOccurrences,
  parseRecurrenceRule,
  startOfUtcDay,
  sweepMissed,
} from '../utils/recurrence.js';
import {
  MAX_REMINDER_MINUTES,
  clearStaleAlerts,
  notifyAssignees,
} from '../utils/notifications.js';

const MAX_LIMIT = 100;
const MAX_ASSIGNEES = 20;

const SORT_MAP = {
  dueAt: { dueAt: 1 },
  '-dueAt': { dueAt: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  updatedAt: { updatedAt: 1 },
  '-updatedAt': { updatedAt: -1 },
  title: { title: 1 },
  '-title': { title: -1 },
};

export function isOwner(userId, task) {
  return String(task.ownerId) === String(userId);
}

function isAssignee(userId, task) {
  return (task.assigneeIds ?? []).some((id) => String(id) === String(userId));
}

function canViewTask(userId, task) {
  return isOwner(userId, task) || isAssignee(userId, task);
}

function serializeTask(task, viewerId) {
  const t = task.toObject ? task.toObject() : task;
  const isOverdue =
    Boolean(t.dueAt) &&
    !['completed', 'cancelled'].includes(t.status) &&
    new Date(t.dueAt) < new Date();

  return {
    id: t._id,
    title: t.title,
    description: t.description,
    ownerId: t.ownerId?._id ?? t.ownerId,
    isOwner: viewerId ? isOwner(viewerId, t) : false,
    assigneeIds: (t.assigneeIds ?? []).map((u) => String(u._id ?? u)),
    assignees: (t.assigneeIds ?? []).map((u) =>
      u && u.name ? { id: u._id, name: u.name } : { id: u }
    ),
    categoryId: t.categoryId?._id ?? t.categoryId ?? null,
    priority: t.priority,
    status: t.status,
    startAt: t.startAt,
    dueAt: t.dueAt,
    estimatedDurationMinutes: t.estimatedDurationMinutes,
    reminderMinutesBefore: t.reminderMinutesBefore ?? null,
    completedAt: t.completedAt,
    isArchived: t.isArchived,
    isOverdue,
    parentTaskId: t.parentTaskId ?? null,
    recurrenceRule: t.recurrenceRule?.frequency ? t.recurrenceRule : null,
    isRecurring: Boolean(t.recurrenceRule?.frequency),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function serializeOccurrence(occurrence) {
  return {
    id: occurrence._id,
    taskId: occurrence.taskId,
    scheduledFor: occurrence.scheduledFor,
    status: occurrence.status,
    completedAt: occurrence.completedAt,
    actualDurationMinutes: occurrence.actualDurationMinutes,
    notes: occurrence.notes,
    updatedAt: occurrence.updatedAt,
  };
}

function serializeActivity(activity) {
  return {
    id: activity._id,
    action: activity.action,
    field: activity.field,
    oldValue: activity.oldValue,
    newValue: activity.newValue,
    actor: activity.actorId
      ? { id: activity.actorId._id ?? activity.actorId, name: activity.actorId.name ?? 'Unknown' }
      : null,
    createdAt: activity.createdAt,
  };
}

function progressOf(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

function parseDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`);
  }
  return date;
}

function parseDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new HttpError(400, 'estimatedDurationMinutes must be a non-negative number');
  }
  return minutes;
}

function parseReminderMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_REMINDER_MINUTES) {
    throw new HttpError(
      400,
      `reminderMinutesBefore must be between 0 and ${MAX_REMINDER_MINUTES} minutes`
    );
  }
  return Math.round(minutes);
}

async function resolveCategory(categoryId, userId) {
  if (categoryId === null || categoryId === undefined || categoryId === '') return null;
  if (!mongoose.isValidObjectId(categoryId)) {
    throw new HttpError(400, 'categoryId is not a valid id');
  }
  const category = await Category.findOne({ _id: categoryId, ownerId: userId });
  if (!category) {
    throw new HttpError(400, 'Category not found');
  }
  return category._id;
}

async function validateAssignees(assigneeIds) {
  if (!Array.isArray(assigneeIds)) {
    throw new HttpError(400, 'assigneeIds must be an array');
  }
  const unique = [...new Set(assigneeIds.map(String))];
  if (unique.length > MAX_ASSIGNEES) {
    throw new HttpError(400, `A task can have at most ${MAX_ASSIGNEES} assignees`);
  }
  const ids = unique.map((id) => {
    if (!mongoose.isValidObjectId(id)) {
      throw new HttpError(400, 'assigneeIds contains an invalid id');
    }
    return new mongoose.Types.ObjectId(id);
  });
  if (ids.length === 0) return [];
  const users = await User.find({ _id: { $in: ids } }).select('_id');
  if (users.length !== ids.length) {
    throw new HttpError(400, 'One or more assignees do not exist');
  }
  return ids;
}

// Completed tasks record completedAt; any other status clears it.
function syncCompletion(task) {
  if (task.status === 'completed' && !task.completedAt) {
    task.completedAt = new Date();
  } else if (task.status !== 'completed' && task.completedAt) {
    task.completedAt = null;
  }
}

function sameValue(a, b) {
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

function snapshot(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify(value.map(String));
  return String(value);
}

async function logActivity(taskId, actorId, action, { field = null, oldValue = null, newValue = null } = {}) {
  await TaskActivity.create({ taskId, actorId, action, field, oldValue, newValue });
}

async function findOwnedTask(taskId, userId) {
  if (!mongoose.isValidObjectId(taskId)) {
    throw new HttpError(404, 'Task not found');
  }
  const task = await Task.findOne({ _id: taskId, ownerId: userId });
  if (!task) {
    throw new HttpError(404, 'Task not found');
  }
  return task;
}

// A task is visible to its owner and assignees; subtasks are also visible to
// anyone who can view their parent.
export async function findVisibleTask(taskId, userId) {
  if (!mongoose.isValidObjectId(taskId)) {
    throw new HttpError(404, 'Task not found');
  }
  const task = await Task.findById(taskId);
  if (!task) {
    throw new HttpError(404, 'Task not found');
  }
  if (canViewTask(userId, task)) {
    return task;
  }
  if (task.parentTaskId) {
    const parent = await Task.findById(task.parentTaskId);
    if (parent && canViewTask(userId, parent)) {
      return task;
    }
  }
  throw new HttpError(404, 'Task not found');
}

// Tasks the user can see: owned, assigned, or subtasks of a visible parent.
async function visibilityClause(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const visibleParentIds = await Task.distinct('_id', {
    parentTaskId: null,
    $or: [{ ownerId: uid }, { assigneeIds: uid }],
  });
  return {
    $or: [
      { ownerId: uid },
      { assigneeIds: uid },
      { parentTaskId: { $in: visibleParentIds } },
    ],
  };
}

export const createTask = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new HttpError(400, 'Title is required');
  if (title.length > 200) throw new HttpError(400, 'Title must be at most 200 characters');

  if (body.priority !== undefined && !TASK_PRIORITIES.includes(body.priority)) {
    throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }
  if (body.status !== undefined && !TASK_STATUSES.includes(body.status)) {
    throw new HttpError(400, `status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  if (body.parentTaskId) {
    throw new HttpError(400, 'Use POST /api/tasks/:taskId/subtasks to create subtasks');
  }

  const assigneeIds = await validateAssignees(body.assigneeIds ?? []);
  const recurrenceRule =
    body.recurrenceRule !== undefined ? parseRecurrenceRule(body.recurrenceRule) : undefined;
  const dueAt = body.dueAt ? parseDate(body.dueAt, 'dueAt') : null;
  const reminderMinutesBefore = parseReminderMinutes(body.reminderMinutesBefore);
  if (reminderMinutesBefore !== null && !dueAt) {
    throw new HttpError(400, 'A reminder requires a due date');
  }

  const task = new Task({
    title,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    ownerId: req.user._id,
    assigneeIds,
    categoryId: await resolveCategory(body.categoryId, req.user._id),
    priority: body.priority ?? 'medium',
    status: body.status ?? 'todo',
    startAt: body.startAt ? parseDate(body.startAt, 'startAt') : null,
    dueAt,
    estimatedDurationMinutes: parseDuration(body.estimatedDurationMinutes),
    reminderMinutesBefore,
    recurrenceRule,
  });
  syncCompletion(task);
  await task.save();

  await logActivity(task._id, req.user._id, 'created', { newValue: task.title });
  if (recurrenceRule) {
    await ensureOccurrences(task, addUtcDays(startOfUtcDay(), HORIZON_DAYS));
    await logActivity(task._id, req.user._id, 'recurrence_set', {
      field: 'recurrenceRule',
      newValue: JSON.stringify(recurrenceRule),
    });
  }
  if (assigneeIds.length > 0) {
    await logActivity(task._id, req.user._id, 'assigned', {
      field: 'assigneeIds',
      newValue: snapshot(assigneeIds),
    });
    await notifyAssignees(task, assigneeIds, req.user._id);
  }

  res.status(201).json({ task: serializeTask(task, req.user._id) });
});

export const listTasks = asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    categoryId,
    search,
    archived,
    overdue,
    scope,
    sort,
    dueBefore,
    dueAfter,
    page = '1',
    limit = '50',
  } = req.query;

  if (status && !TASK_STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  if (priority && !TASK_PRIORITIES.includes(priority)) {
    throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }
  if (scope && !['owned', 'assigned'].includes(scope)) {
    throw new HttpError(400, "scope must be 'owned' or 'assigned'");
  }
  if (categoryId && !mongoose.isValidObjectId(categoryId)) {
    throw new HttpError(400, 'categoryId is not a valid id');
  }

  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 50));

  const filter = {
    parentTaskId: null,
    isArchived: archived === 'true',
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  const and = [await visibilityClause(req.user._id)];

  if (scope === 'owned') {
    and.push({ ownerId: new mongoose.Types.ObjectId(String(req.user._id)) });
  } else if (scope === 'assigned') {
    and.push({ assigneeIds: new mongoose.Types.ObjectId(String(req.user._id)) });
  }

  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    and.push({
      $or: [{ title: new RegExp(escaped, 'i') }, { description: new RegExp(escaped, 'i') }],
    });
  }

  if (overdue === 'true') {
    filter.status = { $in: ['todo', 'in_progress'] };
    filter.dueAt = { $ne: null, $lt: new Date() };
  } else if (dueBefore || dueAfter) {
    filter.dueAt = {
      ...(dueAfter ? { $gte: parseDate(dueAfter, 'dueAfter') } : {}),
      ...(dueBefore ? { $lte: parseDate(dueBefore, 'dueBefore') } : {}),
    };
  }

  filter.$and = and;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assigneeIds', 'name')
      .sort(SORT_MAP[sort] ?? { createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Task.countDocuments(filter),
  ]);

  const parentIds = tasks.map((t) => t._id);
  const progressRows =
    parentIds.length > 0
      ? await Task.aggregate([
          { $match: { parentTaskId: { $in: parentIds } } },
          {
            $group: {
              _id: '$parentTaskId',
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
              },
            },
          },
        ])
      : [];
  const progressMap = new Map(
    progressRows.map((row) => [
      String(row._id),
      {
        total: row.total,
        completed: row.completed,
        percent: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
      },
    ])
  );

  res.json({
    tasks: tasks.map((t) => ({
      ...serializeTask(t, req.user._id),
      subtaskProgress: progressMap.get(String(t._id)) ?? {
        total: 0,
        completed: 0,
        percent: 0,
      },
    })),
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  });
});

export const getTask = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const subtasks = await Task.find({ parentTaskId: task._id })
    .populate('assigneeIds', 'name')
    .sort({ createdAt: 1 });
  res.json({
    task: {
      ...serializeTask(task, req.user._id),
      subtaskProgress: progressOf(subtasks),
    },
    subtasks: subtasks.map((s) => serializeTask(s, req.user._id)),
  });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const body = req.body ?? {};

  // Assignees may update status and record time spent; everything else is owner-only.
  const ASSIGNEE_EDITABLE = ['status', 'estimatedDurationMinutes'];
  const isAssigneeOnly = !isOwner(req.user._id, task);
  if (isAssigneeOnly) {
    const attempted = Object.keys(body).filter((key) => !ASSIGNEE_EDITABLE.includes(key));
    if (attempted.length > 0) {
      throw new HttpError(403, 'Only the owner can change task details; assignees can update status');
    }
  }

  const changes = [];
  const oldDueAt = task.dueAt;
  const oldReminderOffset = task.reminderMinutesBefore ?? null;
  let addedAssignees = [];

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw new HttpError(400, 'Title cannot be empty');
    if (title.length > 200) throw new HttpError(400, 'Title must be at most 200 characters');
    if (!sameValue(task.title, title)) changes.push({ field: 'title', from: task.title, to: title });
    task.title = title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      throw new HttpError(400, 'description must be a string');
    }
    const description = body.description.trim();
    if (!sameValue(task.description, description)) {
      changes.push({ field: 'description', from: task.description, to: description });
    }
    task.description = description;
  }
  if (body.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(body.priority)) {
      throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
    }
    if (!sameValue(task.priority, body.priority)) {
      changes.push({ field: 'priority', from: task.priority, to: body.priority });
    }
    task.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) {
      throw new HttpError(400, `status must be one of: ${TASK_STATUSES.join(', ')}`);
    }
    if (!sameValue(task.status, body.status)) {
      changes.push({ field: 'status', from: task.status, to: body.status });
    }
    task.status = body.status;
  }
  if (!isAssigneeOnly && body.assigneeIds !== undefined) {
    const assigneeIds = await validateAssignees(body.assigneeIds);
    const before = (task.assigneeIds ?? []).map(String);
    const after = assigneeIds.map(String);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field: 'assigneeIds', from: snapshot(before), to: snapshot(after) });
      task.assigneeIds = assigneeIds;
      addedAssignees = after.filter((id) => !before.includes(id));
    }
  }
  if (!isAssigneeOnly && body.categoryId !== undefined) {
    const categoryId = await resolveCategory(body.categoryId, req.user._id);
    if (!sameValue(task.categoryId, categoryId)) {
      changes.push({ field: 'categoryId', from: task.categoryId, to: categoryId });
    }
    task.categoryId = categoryId;
  }
  if (body.startAt !== undefined) {
    const startAt = body.startAt ? parseDate(body.startAt, 'startAt') : null;
    if (!sameValue(task.startAt, startAt)) {
      changes.push({ field: 'startAt', from: task.startAt, to: startAt });
    }
    task.startAt = startAt;
  }
  if (body.dueAt !== undefined) {
    const dueAt = body.dueAt ? parseDate(body.dueAt, 'dueAt') : null;
    if (!sameValue(task.dueAt, dueAt)) {
      changes.push({ field: 'dueAt', from: task.dueAt, to: dueAt });
    }
    task.dueAt = dueAt;
  }
  // A reminder cannot outlive its due date: clearing dueAt clears the offset.
  if (task.dueAt === null && task.reminderMinutesBefore != null) {
    changes.push({
      field: 'reminderMinutesBefore',
      from: task.reminderMinutesBefore,
      to: null,
    });
    task.reminderMinutesBefore = null;
  }
  if (!isAssigneeOnly && body.reminderMinutesBefore !== undefined) {
    const minutes = parseReminderMinutes(body.reminderMinutesBefore);
    if (minutes !== null && !task.dueAt) {
      throw new HttpError(400, 'A reminder requires a due date');
    }
    if (minutes !== (task.reminderMinutesBefore ?? null)) {
      changes.push({
        field: 'reminderMinutesBefore',
        from: task.reminderMinutesBefore,
        to: minutes,
      });
      task.reminderMinutesBefore = minutes;
    }
  }
  if (body.estimatedDurationMinutes !== undefined) {
    const duration = parseDuration(body.estimatedDurationMinutes);
    if (!sameValue(task.estimatedDurationMinutes, duration)) {
      changes.push({
        field: 'estimatedDurationMinutes',
        from: task.estimatedDurationMinutes,
        to: duration,
      });
    }
    task.estimatedDurationMinutes = duration;
  }

  // Recurrence is owner-only (assignees were already rejected above). Changing
  // or clearing the rule rebuilds future, not-yet-completed occurrences so the
  // schedule always reflects the current rule; past history is kept.
  let recurrenceChanged = null;
  if (!isAssigneeOnly && body.recurrenceRule !== undefined) {
    const rule = parseRecurrenceRule(body.recurrenceRule);
    // Re-normalize the stored rule so key order can't fake a difference.
    const stored = task.recurrenceRule?.frequency
      ? parseRecurrenceRule(
          task.recurrenceRule.toObject ? task.recurrenceRule.toObject() : task.recurrenceRule
        )
      : null;
    const before = stored ? JSON.stringify(stored) : null;
    const after = rule ? JSON.stringify(rule) : null;
    if (before !== after) {
      recurrenceChanged = { before, after };
      task.recurrenceRule = rule;
    }
  }

  syncCompletion(task);
  await task.save();

  for (const change of changes) {
    const action =
      change.field === 'status'
        ? 'status_changed'
        : change.field === 'dueAt'
          ? 'due_at_changed'
          : change.field === 'priority'
            ? 'priority_changed'
            : change.field === 'assigneeIds'
              ? 'assigned'
              : 'updated';
    await logActivity(task._id, req.user._id, action, {
      field: change.field,
      oldValue: snapshot(change.from),
      newValue: snapshot(change.to),
    });
  }

  if (recurrenceChanged) {
    const today = startOfUtcDay();
    await TaskOccurrence.deleteMany({
      taskId: task._id,
      scheduledFor: { $gte: today },
      status: { $ne: 'completed' },
    });
    if (task.recurrenceRule) {
      await ensureOccurrences(task, addUtcDays(today, HORIZON_DAYS));
    }
    await logActivity(
      task._id,
      req.user._id,
      task.recurrenceRule ? 'recurrence_set' : 'recurrence_cleared',
      { field: 'recurrenceRule', oldValue: recurrenceChanged.before, newValue: recurrenceChanged.after }
    );
  }

  const reminderScheduleChanged =
    !sameValue(oldDueAt, task.dueAt) || (task.reminderMinutesBefore ?? null) !== oldReminderOffset;
  const leftActive = ['completed', 'cancelled'].includes(task.status);
  if (reminderScheduleChanged || leftActive) {
    // Unread alerts tied to an old schedule (or to a now-finished task) would
    // mislead; already-read ones stay as history.
    await clearStaleAlerts(task._id);
  }

  if (addedAssignees.length > 0) {
    await notifyAssignees(task, addedAssignees, req.user._id);
  }

  await task.populate('assigneeIds', 'name');
  res.json({ task: serializeTask(task, req.user._id) });
});

export const archiveTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  task.isArchived = true;
  await task.save();

  const cascade = await Task.updateMany(
    { parentTaskId: task._id, isArchived: false },
    { $set: { isArchived: true } }
  );

  await logActivity(task._id, req.user._id, 'archived', {
    newValue: cascade.modifiedCount > 0 ? `${cascade.modifiedCount} subtask(s) also archived` : null,
  });
  await clearStaleAlerts(task._id);
  res.json({ task: serializeTask(task, req.user._id) });
});

export const restoreTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  task.isArchived = false;
  await task.save();

  const cascade = await Task.updateMany(
    { parentTaskId: task._id, isArchived: true },
    { $set: { isArchived: false } }
  );

  await logActivity(task._id, req.user._id, 'restored', {
    newValue: cascade.modifiedCount > 0 ? `${cascade.modifiedCount} subtask(s) also restored` : null,
  });
  res.json({ task: serializeTask(task, req.user._id) });
});

export const createSubtask = asyncHandler(async (req, res) => {
  const parent = await findVisibleTask(req.params.taskId, req.user._id);
  if (!isOwner(req.user._id, parent)) {
    throw new HttpError(403, 'Only the task owner can add subtasks');
  }
  if (parent.parentTaskId) {
    throw new HttpError(400, 'Subtasks cannot have their own subtasks');
  }

  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new HttpError(400, 'Title is required');
  if (title.length > 200) throw new HttpError(400, 'Title must be at most 200 characters');

  if (body.recurrenceRule !== undefined) {
    throw new HttpError(400, 'Subtasks cannot be recurring');
  }
  if (body.priority !== undefined && !TASK_PRIORITIES.includes(body.priority)) {
    throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }

  const subtask = new Task({
    title,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    ownerId: req.user._id,
    parentTaskId: parent._id,
    priority: body.priority ?? parent.priority,
    status: 'todo',
    dueAt: body.dueAt ? parseDate(body.dueAt, 'dueAt') : null,
  });
  await subtask.save();

  await logActivity(parent._id, req.user._id, 'subtask_created', { newValue: subtask.title });

  res.status(201).json({ task: serializeTask(subtask, req.user._id) });
});

export const getSubtasks = asyncHandler(async (req, res) => {
  const parent = await findVisibleTask(req.params.taskId, req.user._id);
  const subtasks = await Task.find({ parentTaskId: parent._id })
    .populate('assigneeIds', 'name')
    .sort({ createdAt: 1 });
  res.json({ subtasks: subtasks.map((s) => serializeTask(s, req.user._id)), progress: progressOf(subtasks) });
});

export const setAssignees = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  const assigneeIds = await validateAssignees(req.body?.assigneeIds);

  const before = (task.assigneeIds ?? []).map(String);
  const after = assigneeIds.map(String);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return res.json({ task: serializeTask(task, req.user._id) });
  }

  task.assigneeIds = assigneeIds;
  await task.save();

  await logActivity(task._id, req.user._id, 'assigned', {
    field: 'assigneeIds',
    oldValue: snapshot(before),
    newValue: snapshot(after),
  });

  const added = after.filter((id) => !before.includes(id));
  if (added.length > 0) {
    await notifyAssignees(task, added, req.user._id);
  }

  await task.populate('assigneeIds', 'name');
  res.json({ task: serializeTask(task, req.user._id) });
});

export const removeAssignee = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  const userId = req.params.userId;
  if (!mongoose.isValidObjectId(userId)) {
    throw new HttpError(404, 'Assignee not found');
  }

  const before = (task.assigneeIds ?? []).map(String);
  const remaining = before.filter((id) => id !== String(userId));
  if (remaining.length === before.length) {
    throw new HttpError(404, 'Assignee not found');
  }

  task.assigneeIds = remaining.map((id) => new mongoose.Types.ObjectId(id));
  await task.save();

  await logActivity(task._id, req.user._id, 'assigned', {
    field: 'assigneeIds',
    oldValue: snapshot(before),
    newValue: snapshot(remaining),
  });

  await task.populate('assigneeIds', 'name');
  res.json({ task: serializeTask(task, req.user._id) });
});

export const getTaskActivities = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const activities = await TaskActivity.find({ taskId: task._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('actorId', 'name');
  res.json({ activities: activities.map(serializeActivity) });
});

const MAX_OCCURRENCE_SPAN_MS = 366 * 24 * 60 * 60 * 1000;

export const getOccurrences = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  // Mongoose nested paths return a truthy wrapper even when stored as null,
  // so the guard keys off `frequency` rather than truthiness.
  if (!task.recurrenceRule?.frequency) {
    return res.json({ occurrences: [] });
  }

  const today = startOfUtcDay();
  const from = req.query.from
    ? startOfUtcDay(parseDate(req.query.from, 'from'))
    : addUtcDays(today, -7);
  const to = req.query.to
    ? startOfUtcDay(parseDate(req.query.to, 'to'))
    : addUtcDays(today, HORIZON_DAYS);
  if (from > to) throw new HttpError(400, 'from must be on or before to');
  if (to.getTime() - from.getTime() > MAX_OCCURRENCE_SPAN_MS) {
    throw new HttpError(400, 'from/to span must be at most 366 days');
  }

  await ensureOccurrences(task, to);
  await sweepMissed(task._id);

  const occurrences = await TaskOccurrence.find({
    taskId: task._id,
    scheduledFor: { $gte: from, $lte: to },
  }).sort({ scheduledFor: 1 });
  res.json({ occurrences: occurrences.map(serializeOccurrence) });
});

export const createOccurrence = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  if (!task.recurrenceRule) {
    throw new HttpError(400, 'Task is not recurring');
  }
  const raw = req.body?.scheduledFor;
  if (raw === undefined || raw === null || raw === '') {
    throw new HttpError(400, 'scheduledFor is required');
  }
  const scheduledFor = startOfUtcDay(parseDate(raw, 'scheduledFor'));

  const existing = await TaskOccurrence.findOne({ taskId: task._id, scheduledFor });
  if (existing) {
    return res.status(200).json({ occurrence: serializeOccurrence(existing) });
  }
  const occurrence = await TaskOccurrence.create({ taskId: task._id, scheduledFor });
  res.status(201).json({ occurrence: serializeOccurrence(occurrence) });
});

export const updateOccurrence = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.occurrenceId)) {
    throw new HttpError(404, 'Occurrence not found');
  }
  const occurrence = await TaskOccurrence.findById(req.params.occurrenceId);
  if (!occurrence) {
    throw new HttpError(404, 'Occurrence not found');
  }
  // Owner and assignees may act on occurrences; anyone else gets a 404.
  const task = await findVisibleTask(occurrence.taskId, req.user._id);

  const body = req.body ?? {};
  let action = null;

  if (body.status !== undefined) {
    const next = body.status;
    if (!['pending', 'completed', 'skipped'].includes(next)) {
      throw new HttpError(400, 'status must be one of: pending, completed, skipped');
    }
    if (next === 'completed') {
      if (!['pending', 'missed'].includes(occurrence.status)) {
        throw new HttpError(400, 'Only a pending or missed occurrence can be completed');
      }
      occurrence.status = 'completed';
      occurrence.completedAt = new Date();
      action = 'occurrence_completed';
    } else if (next === 'skipped') {
      if (!['pending', 'missed'].includes(occurrence.status)) {
        throw new HttpError(400, 'Only a pending or missed occurrence can be skipped');
      }
      occurrence.status = 'skipped';
      action = 'occurrence_skipped';
    } else if (occurrence.status === 'missed') {
      // Historical record: a missed occurrence stays missed unless completed
      // or skipped, so past schedule truth is never silently rewritten.
      throw new HttpError(400, 'A missed occurrence cannot be reopened; complete or skip it instead');
    } else if (['completed', 'skipped'].includes(occurrence.status)) {
      occurrence.status = 'pending';
      occurrence.completedAt = null;
      action = 'occurrence_reopened';
    }
  }

  if (body.actualDurationMinutes !== undefined) {
    const minutes = body.actualDurationMinutes === null ? null : Number(body.actualDurationMinutes);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) {
      throw new HttpError(400, 'actualDurationMinutes must be a non-negative number');
    }
    occurrence.actualDurationMinutes = minutes;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 500) {
      throw new HttpError(400, 'notes must be a string of at most 500 characters');
    }
    occurrence.notes = body.notes.trim();
  }

  await occurrence.save();
  if (action) {
    await logActivity(task._id, req.user._id, action, {
      field: 'occurrence',
      newValue: occurrence.scheduledFor.toISOString().slice(0, 10),
    });
  }
  res.json({ occurrence: serializeOccurrence(occurrence) });
});
