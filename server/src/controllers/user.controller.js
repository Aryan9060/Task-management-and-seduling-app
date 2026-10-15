import User from '../models/User.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    return res.json({ users: [] });
  }
  if (q.length > 100) {
    throw new HttpError(400, 'Search query is too long');
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const users = await User.find({ $or: [{ name: re }, { email: re }] })
    .select('name email')
    .limit(10);

  res.json({
    users: users.map((u) => ({ id: u._id, name: u.name, email: u.email })),
  });
});
