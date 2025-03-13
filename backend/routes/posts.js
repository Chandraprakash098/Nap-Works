
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Post = require('../models/Post');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
  },
});

// Async handler middleware
const asyncHandler = (fn) => (req, res, next) => 
  Promise.resolve(fn(req, res, next)).catch(next);

// Validation for post creation
const postValidation = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('postName').trim().notEmpty().withMessage('Post name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('tags').optional().isArray().withMessage('Tags must be an array of strings'),
];

// Validation for post search
const searchValidation = [
  query('searchText').optional().trim().escape(),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  query('tags').optional().trim(),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

// Create Post API
router.post(
  '/posts',
  auth,
  upload.single('image'),
  postValidation,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId, postName, description, tags } = req.body;

    // Log for debugging
    logger.info('Request body:', req.body);
    logger.info('Authenticated user:', req.user);

    if (!req.user || !req.user.id) {
      logger.error('Authentication middleware failed to set req.user');
      return res.status(401).json({
        success: false,
        message: 'Authentication failed',
        error: 'No authenticated user found'
      });
    }

    if (req.user.id !== userId) {
      logger.error('Unauthorized post attempt:', { requestedUserId: userId, authUserId: req.user.id });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
        error: 'You can only create posts for yourself'
      });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const post = new Post({
      userId,
      postName,
      description,
      uploadTime: new Date(),
      tags: Array.isArray(tags) ? tags : [],
      imagePath,
    });

    await post.save();
    logger.info(`Post created by user: ${userId} with image: ${imagePath}`);
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: post
    });
  })
);

// Fetch Posts with Filters API
router.get(
  '/posts',
  searchValidation,  // Now properly defined
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Query validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: errors.array()
      });
    }

    const { searchText, startDate, endDate, tags, page = 1, limit = 10 } = req.query;
    const query = {};

    if (searchText) {
      query.$or = [
        { postName: { $regex: searchText, $options: 'i' } },
        { description: { $regex: searchText, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.uploadTime = {};
      if (startDate) query.uploadTime.$gte = new Date(startDate);
      if (endDate) query.uploadTime.$lte = new Date(endDate);
      
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range',
          error: 'startDate cannot be after endDate'
        });
      }
    }

    if (tags) {
      const tagsArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagsArray };
    }

    const skip = (page - 1) * limit;
    const posts = await Post.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ uploadTime: -1 })
      .lean();

    const total = await Post.countDocuments(query);

    logger.info(`Fetched ${posts.length} posts - Page: ${page}, Limit: ${limit}`);
    res.json({
      success: true,
      message: 'Posts retrieved successfully',
      data: {
        posts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  })
);

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: 'File upload error',
      error: error.message
    });
  }
  logger.error('Server error:', { message: error.message, stack: error.stack });
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;