import mongoose from 'mongoose';

export const OCCURRENCE_STATUSES = ['pending', 'completed', 'missed', 'skipped'];

const occurrenceSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: OCCURRENCE_STATUSES, default: 'pending' },
    completedAt: { type: Date, default: null },
    actualDurationMinutes: { type: Number, min: 0, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

occurrenceSchema.index({ taskId: 1, scheduledFor: 1 }, { unique: true });
occurrenceSchema.index({ status: 1, scheduledFor: 1 });

export default mongoose.model('TaskOccurrence', occurrenceSchema);
