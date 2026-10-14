import mongoose from 'mongoose';
import Task from '../models/Task.js';
import asyncHandler from '../utils/asyncHandler.js';

const TREND_DAYS = 7;

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date) {
  return new Date(startOfUtcDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export const getSummary = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);
  const visibility = { $or: [{ ownerId: userId }, { assigneeIds: userId }] };
  const base = { ...visibility, isArchived: false };
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

  res.json({
    summary: {
      total,
      todo,
      inProgress,
      completed,
      cancelled,
      overdue,
      dueToday,
      completionRate,
      trend,
    },
  });
});
