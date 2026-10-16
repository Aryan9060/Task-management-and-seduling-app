import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import Task from '../models/Task.js';

// Reminders can be set up to 7 days before the due date.
export const MAX_REMINDER_MINUTES = 10080;

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

// Everyone expected to act on a task: the owner and all assignees.
function recipientsOf(task) {
  const ids = [String(task.ownerId), ...(task.assigneeIds ?? []).map(String)];
  return [...new Set(ids)];
}

// Concurrent sweeps or retried requests can race on the unique
// (userId, dedupeKey) index; a duplicate-key error just means the row exists.
async function runUpserts(ops) {
  if (ops.length === 0) return;
  try {
    await Notification.bulkWrite(ops, { ordered: false });
  } catch (err) {
    const duplicate =
      err?.code === 11000 || (err?.writeErrors ?? []).some((e) => e?.code === 11000);
    if (!duplicate) throw err;
  }
}

function upsertOp({ userId, taskId, type, dedupeKey, scheduledAt, now }) {
  return {
    updateOne: {
      filter: { userId: toObjectId(userId), dedupeKey },
      update: {
        $setOnInsert: { taskId, type, scheduledAt, sentAt: now },
      },
      upsert: true,
    },
  };
}

/**
 * Creates `assigned` notifications for newly added assignees. Skips the actor
 * and the owner (assigning yourself to your own task needs no alert).
 */
export async function notifyAssignees(task, addedUserIds, actorId) {
  const now = new Date();
  const targets = addedUserIds
    .map(String)
    .filter((id) => id !== String(task.ownerId) && id !== String(actorId));
  await runUpserts(
    targets.map((id) =>
      upsertOp({
        userId: id,
        taskId: task._id,
        type: 'assigned',
        dedupeKey: `assigned:${task._id}:${id}`,
        scheduledAt: now,
        now,
      })
    )
  );
}

/**
 * Creates `comment` notifications for the owner and every assignee except the
 * comment's author. Keyed by comment id, so one comment notifies each person
 * at most once.
 */
export async function notifyComment(task, commentId, authorId) {
  const now = new Date();
  const targets = recipientsOf(task).filter((id) => id !== String(authorId));
  await runUpserts(
    targets.map((id) =>
      upsertOp({
        userId: id,
        taskId: task._id,
        type: 'comment',
        dedupeKey: `comment:${task._id}:${commentId}`,
        scheduledAt: now,
        now,
      })
    )
  );
}

/**
 * Lazy, idempotent replacement for a reminder background job: materializes
 * `reminder` notifications once `dueAt - reminderMinutesBefore` has passed and
 * `overdue` notifications once `dueAt` has passed, for the task's owner and
 * assignees. Called on notification reads; re-running never duplicates rows.
 */
export async function materializeDueNotifications(userId) {
  const uid = toObjectId(userId);
  const now = new Date();
  const nowMs = now.getTime();
  const horizon = new Date(nowMs + MAX_REMINDER_MINUTES * 60 * 1000);

  const tasks = await Task.find({
    isArchived: false,
    status: { $nin: ['completed', 'cancelled'] },
    dueAt: { $ne: null, $lte: horizon },
    $or: [{ ownerId: uid }, { assigneeIds: uid }],
  }).select('_id ownerId assigneeIds dueAt reminderMinutesBefore');

  const ops = [];
  for (const task of tasks) {
    const dueMs = task.dueAt.getTime();
    const recipients = recipientsOf(task);

    if (dueMs < nowMs) {
      // Overdue supersedes the reminder: one "you missed it" alert per task.
      for (const id of recipients) {
        ops.push(
          upsertOp({
            userId: id,
            taskId: task._id,
            type: 'overdue',
            dedupeKey: `overdue:${task._id}`,
            scheduledAt: task.dueAt,
            now,
          })
        );
      }
      continue;
    }

    const offset = task.reminderMinutesBefore;
    if (offset == null) continue;
    const remindAt = new Date(dueMs - offset * 60 * 1000);
    if (remindAt.getTime() > nowMs) continue;

    for (const id of recipients) {
      ops.push(
        upsertOp({
          userId: id,
          taskId: task._id,
          type: 'reminder',
          dedupeKey: `reminder:${task._id}:${remindAt.toISOString()}`,
          scheduledAt: remindAt,
          now,
        })
      );
    }
  }

  await runUpserts(ops);
}

/** Removes unread schedule-dependent alerts for a task (reminder edits, completion, archive). */
export async function clearStaleAlerts(taskId, { types = ['reminder'] } = {}) {
  await Notification.deleteMany({ taskId, type: { $in: types }, readAt: null });
}
