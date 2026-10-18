import Task from '../models/Task.js';
import TimeEntry from '../models/TimeEntry.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { closeRunningEntry, findRunningEntry, stopUserRunningTimer } from '../utils/timers.js';
import { findVisibleTask } from './task.controller.js';

const MAX_MANUAL_MINUTES = 24 * 60;

function serializeEntry(entry) {
  const user = entry.userId;
  const task = entry.taskId;
  const populatedUser = user && user.name !== undefined ? user : null;
  const populatedTask = task && task.title !== undefined ? task : null;
  return {
    id: entry._id,
    taskId: populatedTask ? task._id : task,
    task: populatedTask ? { id: task._id, title: task.title } : undefined,
    userId: populatedUser ? populatedUser._id : user,
    user: populatedUser ? { id: populatedUser._id, name: populatedUser.name } : undefined,
    source: entry.source,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    durationMinutes: entry.durationMinutes,
    notes: entry.notes,
    running: entry.endedAt === null,
  };
}

function assertTimeable(task) {
  if (task.isArchived) throw new HttpError(400, 'Archived tasks cannot be timed');
  if (['completed', 'cancelled'].includes(task.status)) {
    throw new HttpError(400, 'Completed or cancelled tasks cannot be timed');
  }
}

export const getActiveTimer = asyncHandler(async (req, res) => {
  const entry = await findRunningEntry(req.user._id);
  if (!entry) return res.json({ entry: null });
  await entry.populate('taskId', 'title');
  res.json({ entry: serializeEntry(entry) });
});

export const startTimer = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  assertTimeable(task);

  const stopped = await stopUserRunningTimer(req.user._id);
  let stoppedTask = null;
  if (stopped) {
    stoppedTask = await Task.findById(stopped.taskId).select('title');
  }

  const entry = await TimeEntry.create({
    taskId: task._id,
    userId: req.user._id,
    source: 'timer',
    startedAt: new Date(),
  });
  await entry.populate('taskId', 'title');

  res.status(201).json({
    entry: serializeEntry(entry),
    stopped: stopped ? { entry: serializeEntry(stopped), task: stoppedTask ? { id: stoppedTask._id, title: stoppedTask.title } : null } : null,
  });
});

export const stopTimer = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const running = await TimeEntry.findOne({
    taskId: task._id,
    userId: req.user._id,
    endedAt: null,
  });
  if (!running) throw new HttpError(404, 'No running timer for this task');

  await closeRunningEntry(running);
  await running.populate('taskId', 'title');
  res.json({ entry: serializeEntry(running) });
});

export const listTimeEntries = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const entries = await TimeEntry.find({ taskId: task._id })
    .sort({ startedAt: -1 })
    .limit(100)
    .populate('userId', 'name');
  res.json({
    entries: entries.map(serializeEntry),
    totalMinutes: task.timeSpentMinutes ?? 0,
  });
});

export const createManualEntry = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  if (task.isArchived) throw new HttpError(400, 'Archived tasks cannot be timed');

  const minutes = Number(req.body?.minutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MANUAL_MINUTES) {
    throw new HttpError(400, `Minutes must be between 1 and ${MAX_MANUAL_MINUTES}`);
  }
  const rounded = Math.round(minutes);
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
  if (notes.length > 500) throw new HttpError(400, 'Notes must be at most 500 characters');

  const now = new Date();
  const entry = await TimeEntry.create({
    taskId: task._id,
    userId: req.user._id,
    source: 'manual',
    startedAt: now,
    endedAt: now,
    durationMinutes: rounded,
    notes,
  });
  await Task.updateOne({ _id: task._id }, { $inc: { timeSpentMinutes: rounded } });
  await entry.populate('userId', 'name');

  res.status(201).json({ entry: serializeEntry(entry) });
});
