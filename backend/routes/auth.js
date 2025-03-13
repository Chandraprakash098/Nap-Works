const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = express.Router();

// Configuration constants
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '1h';

// Middleware to handle async errors
const asyncHandler = (fn) => (req, res, next) => 
  Promise.resolve(fn(req, res, next)).catch(next);

// Middleware to check HTTP method
const requirePost = (req, res, next) => {
  if (req.method !== 'POST') {
    logger.error(`Invalid method ${req.method} used for ${req.path}`);
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed',
      error: `Only POST method is supported for this endpoint. Received ${req.method}`
    });
  }
  next();
};

// Validation middleware
const signupValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
];

const loginValidation = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// 1. Signup API
router.post('/signup', requirePost, signupValidation, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('Validation failed', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    logger.error('Email already exists:', email);
    return res.status(400).json({
      success: false,
      message: 'Email already exists',
      error: 'User already registered with this email'
    });
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = new User({ name, email, password: hashedPassword });
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { 
    expiresIn: TOKEN_EXPIRY 
  });

  logger.info(`User signed up successfully: ${email}`);
  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: { 
        id: user._id,  
        name, 
        email 
      }
    }
  });
}));

// 2. Login API (Modified to include userId)
router.post('/login', requirePost, loginValidation, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('Validation failed', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    logger.error('Login failed - User not found:', email);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: 'Invalid email or password'
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    logger.error('Login failed - Invalid password:', email);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: 'Invalid email or password'
    });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { 
    expiresIn: TOKEN_EXPIRY 
  });

  logger.info(`User logged in successfully: ${email}`);
  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: { 
        id: user._id,  
        name: user.name, 
        email 
      }
    }
  });
}));

// Handle GET requests to /signup and /login
router.get('/signup', (req, res) => {
  logger.error('GET request attempted on signup endpoint');
  res.status(405).json({
    success: false,
    message: 'Method Not Allowed',
    error: 'Signup requires POST method with user credentials in request body'
  });
});

router.get('/login', (req, res) => {
  logger.error('GET request attempted on login endpoint');
  res.status(405).json({
    success: false,
    message: 'Method Not Allowed',
    error: 'Login requires POST method with email and password in request body'
  });
});

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error('Server error:', error.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;