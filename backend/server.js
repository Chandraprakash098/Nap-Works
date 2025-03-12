// require('dotenv').config();
// const express = require('express');
// const helmet = require('helmet');
// const rateLimit = require('express-rate-limit');
// const morgan = require('morgan');
// const connectDB = require('./config/db');
// const authRoutes = require('./routes/auth');
// const postRoutes = require('./routes/posts');
// const errorHandler = require('./middleware/errorHandler');
// const logger = require('./utils/logger');

// const app = express();

// const cors = require('cors');
// app.use(cors()); // Add this after app.use(express.json());

// // Middleware
// app.use(helmet());
// app.use(express.json());
// app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
// app.use(
//   rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // Limit each IP to 100 requests per windowMs
//   })
// );

// // Connect to MongoDB
// connectDB();

// // Routes
// app.use('/api', authRoutes);
// app.use('/api', postRoutes);

// // Error Handler
// app.use(errorHandler);

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   logger.info(`Server running on port ${PORT}`);
// });


require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path'); // Add path module
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

const cors = require('cors');
app.use(cors()); // Add this after app.use(express.json());

// Middleware
app.use(helmet());
app.use(express.json());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
  })
);

// Serve static files from the uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
connectDB();

// Routes
app.use('/api', authRoutes);
app.use('/api', postRoutes);

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});