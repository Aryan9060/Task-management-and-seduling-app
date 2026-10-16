import mongoose from 'mongoose';
import Task from '../models/Task.js';
import TaskOccurrence from '../models/TaskOccurrence.js';
import asyncHandler from '../utils/asyncHandler.js';
import { startOfUtcDay } from '../utils/recurrence.js';

const TREND_DAYS = 7;

function endOfUtcDay(date) {
  return new Date(startOfUtcDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export const getSummary = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);
  const visibility = { $or: [{ ownerId: userId }, { assigneeIds: userId }] };
  const base = { ...visibility, isArchived: false, parentTaskId: null };
  const now = new Date();

  const trendStart = startOfUtcDay(now);
  trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));

  const [total, todo, inProgress, completed, cancelled, overdue, dueToday, trendRaw] =
    await Promise.all([
      Task.countDocuments(base),
      Task.countDocuments({ ...base, status: 'todo' }),
      Task.countDocuments({ ...base, status: 'in_progress' }),
      Task.countDocuments({ ...base, status: 'completed' }),
      Task.countDocuments({ ...base, status: 'cancelled' }),
      Task.countDocuments({
        ...base,
        status: { $in: ['todo', 'in_progress'] },
        dueAt: { $ne: null, $lt: now },
      }),
      Task.countDocuments({
        ...base,
        status: { $in: ['todo', 'in_progress'] },
        dueAt: { $gte: startOfUtcDay(now), $lte: endOfUtcDay(now) },
      }),
      Task.aggregate([
        {
          $match: {
            $and: [
              visibility,
              { isArchived: false },
              { parentTaskId: null },
              { status: 'completed' },
              { completedAt: { $gte: trendStart } },
            ],
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

  const trendCounts = new Map(trendRaw.map((entry) => [entry._id, entry.count]));
  const trend = [];
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const day = new Date(trendStart);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    trend.push({ date: key, count: trendCounts.get(key) ?? 0 });
  }

  const active = total - cancelled;
  const completionRate = active > 0 ? Math.round((completed / active) * 100) : 0;

  // Missed recurring-work count: occurrences marked missed plus pending ones
  // whose scheduled day has already elapsed (same rule as the occurrence sweep,
  // evaluated here without mutating so the dashboard stays a read-only view).
  const recurringIds = await Task.distinct('_id', {
    ...base,
    recurrenceRule: { $ne: null },
  });
  const missedOccurrences =
    recurringIds.length > 0
      ? await TaskOccurrence.countDocuments({
          taskId: { $in: recurringIds },
          $or: [
            { status: 'missed' },
            { status: 'pending', scheduledFor: { $lt: startOfUtcDay() } },
          ],
        })
      : 0;

  res.json({
    summary: {
      total,
      todo,
      inProgress,
      completed,
      cancelled,
      overdue,
      dueToday,
      missedOccurrences,
      completionRate,
      trend,
    },
  });
});
