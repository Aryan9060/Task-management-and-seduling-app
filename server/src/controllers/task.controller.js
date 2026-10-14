import mongoose from 'mongoose';
import Task, { TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import Category from '../models/Category.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';

const MAX_LIMIT = 100;

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

function visibilityClause(userId) {
  return { $or: [{ ownerId: userId }, { assigneeIds: userId }] };
}

function serializeTask(task) {
  const t = task.toObject ? task.toObject() : task;
  const isOverdue =
    Boolean(t.dueAt) &&
    !['completed', 'cancelled'].includes(t.status) &&
    new Date(t.dueAt) < new Date();

  return {
    id: t._id,
    title: t.title,
    description: t.description,
    ownerId: t.ownerId,
    assigneeIds: t.assigneeIds,
    categoryId: t.categoryId,
    priority: t.priority,
    status: t.status,
    startAt: t.startAt,
    dueAt: t.dueAt,
    estimatedDurationMinutes: t.estimatedDurationMinutes,
    completedAt: t.completedAt,
    isArchived: t.isArchived,
    isOverdue,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
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

// Completed tasks record completedAt; any other status clears it.
function syncCompletion(task) {
  if (task.status === 'completed' && !task.completedAt) {
    task.completedAt = new Date();
  } else if (task.status !== 'completed' && task.completedAt) {
    task.completedAt = null;
  }
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

  const task = new Task({
    title,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    ownerId: req.user._id,
    categoryId: await resolveCategory(body.categoryId, req.user._id),
    priority: body.priority ?? 'medium',
    status: body.status ?? 'todo',
    startAt: body.startAt ? parseDate(body.startAt, 'startAt') : null,
    dueAt: body.dueAt ? parseDate(body.dueAt, 'dueAt') : null,
    estimatedDurationMinutes: parseDuration(body.estimatedDurationMinutes),
  });
  syncCompletion(task);
  await task.save();

  res.status(201).json({ task: serializeTask(task) });
});

export const listTasks = asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    categoryId,
    search,
    archived,
    overdue,
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
  if (categoryId && !mongoose.isValidObjectId(categoryId)) {
    throw new HttpError(400, 'categoryId is not a valid id');
  }

  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 50));

  const filter = {
    isArchived: archived === 'true',
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  const and = [visibilityClause(req.user._id)];

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
      .sort(SORT_MAP[sort] ?? { createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Task.countDocuments(filter),
  ]);

  res.json({
    tasks: tasks.map(serializeTask),
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  });
});

export const getTask = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.taskId)) {
    throw new HttpError(404, 'Task not found');
  }
  const task = await Task.findOne({
    _id: req.params.taskId,
    $or: [{ ownerId: req.user._id }, { assigneeIds: req.user._id }],
  });
  if (!task) {
    throw new HttpError(404, 'Task not found');
  }
  res.json({ task: serializeTask(task) });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  const body = req.body ?? {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw new HttpError(400, 'Title cannot be empty');
    if (title.length > 200) throw new HttpError(400, 'Title must be at most 200 characters');
    task.title = title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      throw new HttpError(400, 'description must be a string');
    }
    task.description = body.description.trim();
  }
  if (body.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(body.priority)) {
      throw new HttpError(400, `priority must be one of: ${TASK_PRIORITIES.join(', ')}`);
    }
    task.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) {
      throw new HttpError(400, `status must be one of: ${TASK_STATUSES.join(', ')}`);
    }
    task.status = body.status;
  }
  if (body.categoryId !== undefined) {
    task.categoryId = await resolveCategory(body.categoryId, req.user._id);
  }
  if (body.startAt !== undefined) {
    task.startAt = body.startAt ? parseDate(body.startAt, 'startAt') : null;
  }
  if (body.dueAt !== undefined) {
    task.dueAt = body.dueAt ? parseDate(body.dueAt, 'dueAt') : null;
  }
  if (body.estimatedDurationMinutes !== undefined) {
    task.estimatedDurationMinutes = parseDuration(body.estimatedDurationMinutes);
  }

  syncCompletion(task);
  await task.save();

  res.json({ task: serializeTask(task) });
});

export const archiveTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  task.isArchived = true;
  await task.save();
  res.json({ task: serializeTask(task) });
});

export const restoreTask = asyncHandler(async (req, res) => {
  const task = await findOwnedTask(req.params.taskId, req.user._id);
  task.isArchived = false;
  await task.save();
  res.json({ task: serializeTask(task) });
});
