import mongoose from 'mongoose';

export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'cancelled'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    assigneeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    startAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    estimatedDurationMinutes: { type: Number, min: 0, default: null },
    // Denormalized sum of TimeEntry.durationMinutes for quick list/dashboard reads.
    timeSpentMinutes: { type: Number, min: 0, default: 0 },
    // Minutes before dueAt to alert the owner and assignees; null = no reminder.
    reminderMinutesBefore: { type: Number, min: 0, max: 10080, default: null },
    completedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
    recurrenceRule: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
      interval: { type: Number, min: 1, max: 365, default: 1 },
      byWeekday: [{ type: Number, min: 0, max: 6 }],
      until: { type: Date, default: null },
      timeZone: { type: String, default: 'UTC' },
    },
  },
  { timestamps: true }
);

taskSchema.index({ ownerId: 1, status: 1 });
taskSchema.index({ assigneeIds: 1, status: 1 });
taskSchema.index({ dueAt: 1 });

export default mongoose.model('Task', taskSchema);
