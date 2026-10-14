import { Router } from 'express';
import * as categories from '../controllers/category.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', categories.listCategories);
router.post('/', categories.createCategory);
router.patch('/:categoryId', categories.updateCategory);
router.delete('/:categoryId', categories.deleteCategory);

export default router;
