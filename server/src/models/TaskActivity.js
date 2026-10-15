import mongoose from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'created',
  'updated',
  'status_changed',
  'deadline_changed',
  'archived',
  'restored',
  'assigned',
  'subtask_created',
];

const taskActivitySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    field: { type: String, default: null },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

taskActivitySchema.index({ taskId: 1, createdAt: -1 });

export default mongoose.model('TaskActivity', taskActivitySchema);
