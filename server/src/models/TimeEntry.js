import mongoose from 'mongoose';

export const TIME_ENTRY_SOURCES = ['timer', 'manual'];

const timeEntrySchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: TIME_ENTRY_SOURCES, default: 'timer' },
    startedAt: { type: Date, required: true },
    // null while the timer is running; a partial unique index allows only one
    // running entry per user.
    endedAt: { type: Date, default: null },
    durationMinutes: { type: Number, min: 0, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

timeEntrySchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { endedAt: { $type: 10 } } }
);
timeEntrySchema.index({ taskId: 1, startedAt: -1 });
timeEntrySchema.index({ userId: 1, startedAt: -1 });

export default mongoose.model('TimeEntry', timeEntrySchema);
