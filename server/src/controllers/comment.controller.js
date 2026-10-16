import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { notifyComment } from '../utils/notifications.js';
import { findVisibleTask, isOwner } from './task.controller.js';

function serializeComment(comment, viewerId, task) {
  const author = comment.authorId;
  const authorId = author?._id ?? author;
  return {
    id: comment._id,
    taskId: comment.taskId,
    body: comment.body,
    author: author && author.name !== undefined ? { id: authorId, name: author.name } : { id: authorId },
    createdAt: comment.createdAt,
    canDelete: String(authorId) === String(viewerId) || isOwner(viewerId, task),
  };
}

export const listComments = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  const comments = await Comment.find({ taskId: task._id })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('authorId', 'name');
  res.json({ comments: comments.map((c) => serializeComment(c, req.user._id, task)) });
});

export const createComment = asyncHandler(async (req, res) => {
  const task = await findVisibleTask(req.params.taskId, req.user._id);
  if (task.isArchived) {
    throw new HttpError(400, 'Cannot comment on an archived task');
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new HttpError(400, 'Comment body is required');
  if (body.length > 1000) throw new HttpError(400, 'Comment must be at most 1000 characters');

  const comment = await Comment.create({ taskId: task._id, authorId: req.user._id, body });
  await notifyComment(task, comment._id, req.user._id);
  await comment.populate('authorId', 'name');
  res.status(201).json({ comment: serializeComment(comment, req.user._id, task) });
});

export const deleteComment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.commentId)) {
    throw new HttpError(404, 'Comment not found');
  }
  const comment = await Comment.findById(req.params.commentId);
  if (!comment) throw new HttpError(404, 'Comment not found');

  // Anyone who cannot view the task gets a 404 before permission is checked.
  const task = await findVisibleTask(comment.taskId, req.user._id);
  const isAuthor = String(comment.authorId) === String(req.user._id);
  if (!isAuthor && !isOwner(req.user._id, task)) {
    throw new HttpError(403, 'Only the comment author or the task owner can delete a comment');
  }

  await comment.deleteOne();
  await Notification.deleteMany({ dedupeKey: `comment:${task._id}:${comment._id}` });
  res.status(204).end();
});
