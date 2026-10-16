import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { materializeDueNotifications } from '../utils/notifications.js';

function serializeNotification(notification) {
  const task = notification.taskId;
  return {
    id: notification._id,
    type: notification.type,
    task:
      task && task.title !== undefined
        ? { id: task._id, title: task.title }
        : task
          ? { id: task, title: null }
          : null,
    scheduledAt: notification.scheduledAt,
    sentAt: notification.sentAt,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export const listNotifications = asyncHandler(async (req, res) => {
  // Materialize due reminders/overdue alerts before reading; the generation is
  // upsert-based, so repeated reads never duplicate notifications.
  await materializeDueNotifications(req.user._id);

  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { userId: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).populate('taskId', 'title'),
    Notification.countDocuments({ userId: req.user._id, readAt: null }),
  ]);

  res.json({
    notifications: notifications.map(serializeNotification),
    unreadCount,
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.notificationId)) {
    throw new HttpError(404, 'Notification not found');
  }
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    userId: req.user._id,
  });
  if (!notification) throw new HttpError(404, 'Notification not found');

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  await notification.populate('taskId', 'title');
  res.json({ notification: serializeNotification(notification) });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ updated: result.modifiedCount });
});
