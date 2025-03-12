const express = require('express');
const { body, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Post = require('../models/Post');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Store files in uploads/ folder
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });
  
  const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
    fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      if (extname && mimetype) {
        return cb(null, true);
      } else {
        cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
      }
    },
  });

// Post Content API
// router.post(
//   '/posts',
//   auth,
//   [
//     body('userId').notEmpty().withMessage('User ID is required'),
//     body('postName').notEmpty().withMessage('Post name is required'),
//     body('description').notEmpty().withMessage('Description is required'),
//   ],
//   async (req, res, next) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.error('Validation failed:', errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { userId, postName, description, tags, imageUrl } = req.body;

//     if (req.user.id !== userId) {
//       logger.error('Unauthorized post attempt:', userId);
//       return res.status(403).json({ error: 'Unauthorized' });
//     }

//     try {
//       const post = new Post({
//         userId,
//         postName,
//         description,
//         tags,
//         imageUrl,
//       });
//       await post.save();

//       logger.info(`Post created by user: ${userId}`);
//       res.status(201).json(post);
//     } catch (error) {
//       next(error);
//     }
//   }
// );

router.post(
    '/posts',
    auth,
    upload.single('image'), // Handle single image upload with field name 'image'
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('postName').notEmpty().withMessage('Post name is required'),
      body('description').notEmpty().withMessage('Description is required'),
    ],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.error('Validation failed:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }
  
      const { userId, postName, description, tags } = req.body;
  
      if (req.user.id !== userId) {
        logger.error('Unauthorized post attempt:', userId);
        return res.status(403).json({ error: 'Unauthorized' });
      }
  
      try {
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null; // Store relative path
  
        const post = new Post({
          userId,
          postName,
          description,
          uploadTime: Date.now(),
          tags,
          imagePath, // Save the file path
        });
        await post.save();
  
        logger.info(`Post created by user: ${userId} with image: ${imagePath}`);
        res.status(201).json(post);
      } catch (error) {
        next(error);
      }
    }
  );

// Fetch Content with Filters API
router.get('/posts', async (req, res, next) => {
  const { searchText, startDate, endDate, tags, page = 1, limit = 10 } = req.query;

  try {
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
    }

    if (tags) {
      query.tags = { $in: tags.split(',') };
    }

    const posts = await Post.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ uploadTime: -1 });

    const total = await Post.countDocuments(query);

    logger.info(`Fetched posts - Page: ${page}, Limit: ${limit}`);
    res.json({
      posts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;