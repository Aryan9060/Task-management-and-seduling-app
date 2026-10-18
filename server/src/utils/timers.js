import Task from '../models/Task.js';
import TimeEntry from '../models/TimeEntry.js';

// Closes a running entry and folds its duration into the task's logged total.
export async function closeRunningEntry(entry, stoppedAt = new Date()) {
  const durationMinutes = Math.max(
    1,
    Math.round((stoppedAt.getTime() - entry.startedAt.getTime()) / 60000)
  );
  entry.endedAt = stoppedAt;
  entry.durationMinutes = durationMinutes;
  await entry.save();
  await Task.updateOne({ _id: entry.taskId }, { $inc: { timeSpentMinutes: durationMinutes } });
  return entry;
}

export function findRunningEntry(userId) {
  return TimeEntry.findOne({ userId, endedAt: null });
}

/** Stops whatever timer the user has running (used when switching tasks). */
export async function stopUserRunningTimer(userId) {
  const running = await findRunningEntry(userId);
  if (!running) return null;
  return closeRunningEntry(running);
}

/** Called by task updates/archiving so a running timer never outlives its task. */
export async function stopTimerForTask(taskId) {
  const running = await TimeEntry.findOne({ taskId, endedAt: null });
  if (!running) return null;
  return closeRunningEntry(running);
}
