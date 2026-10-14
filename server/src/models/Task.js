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
    completedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ ownerId: 1, status: 1 });
taskSchema.index({ assigneeIds: 1, status: 1 });
taskSchema.index({ dueAt: 1 });

export default mongoose.model('Task', taskSchema);
