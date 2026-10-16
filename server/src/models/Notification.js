import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = ['assigned', 'comment', 'reminder', 'overdue'];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // Identifies the event that produced this notification (assignment, a
    // specific comment, a specific reminder time, or the task's overdue state).
    // The unique index below makes generation idempotent: retried requests and
    // repeated sweeps can never create a duplicate row.
    dedupeKey: { type: String, required: true },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
