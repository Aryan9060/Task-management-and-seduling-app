import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    color: {
      type: String,
      default: '#6366f1',
      match: [/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #6366f1'],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

categorySchema.index({ ownerId: 1, name: 1 }, { unique: true });

export default mongoose.model('Category', categorySchema);
