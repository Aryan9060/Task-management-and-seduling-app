import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Task from '../models/Task.js';
import HttpError from '../utils/httpError.js';
import asyncHandler from '../utils/asyncHandler.js';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function parseCategoryInput(body, { partial = false } = {}) {
  const result = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 50) {
      throw new HttpError(400, 'Category name must be 2-50 characters');
    }
    result.name = name;
  }

  if (body.color !== undefined) {
    if (!COLOR_RE.test(body.color)) {
      throw new HttpError(400, 'Color must be a hex value like #6366f1');
    }
    result.color = body.color.toLowerCase();
  } else if (!partial) {
    result.color = '#6366f1';
  }

  return result;
}

export const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ ownerId: req.user._id }).sort({ name: 1 });

  const counts = await Task.aggregate([
    {
      $match: {
        ownerId: new mongoose.Types.ObjectId(req.user._id),
        isArchived: false,
        categoryId: { $in: categories.map((c) => c._id) },
      },
    },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  const countByCategory = new Map(counts.map((c) => [String(c._id), c.count]));

  res.json({
    categories: categories.map((c) => ({
      id: c._id,
      name: c.name,
      color: c.color,
      taskCount: countByCategory.get(String(c._id)) ?? 0,
      createdAt: c.createdAt,
    })),
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const input = parseCategoryInput(req.body ?? {});

  const existing = await Category.findOne({ ownerId: req.user._id, name: input.name });
  if (existing) {
    throw new HttpError(409, 'A category with this name already exists');
  }

  const category = await Category.create({ ...input, ownerId: req.user._id });
  res.status(201).json({
    category: { id: category._id, name: category.name, color: category.color, taskCount: 0 },
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    _id: req.params.categoryId,
    ownerId: req.user._id,
  });
  if (!category) {
    throw new HttpError(404, 'Category not found');
  }

  const input = parseCategoryInput(req.body ?? {}, { partial: true });
  Object.assign(category, input);
  await category.save();

  res.json({
    category: { id: category._id, name: category.name, color: category.color },
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    _id: req.params.categoryId,
    ownerId: req.user._id,
  });
  if (!category) {
    throw new HttpError(404, 'Category not found');
  }

  await Task.updateMany(
    { ownerId: req.user._id, categoryId: category._id },
    { $set: { categoryId: null } }
  );
  await category.deleteOne();

  res.json({ ok: true });
});
