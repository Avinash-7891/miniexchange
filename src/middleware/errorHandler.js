/**
 * middleware/errorHandler.js
 * 
 * CENTRALIZED CONSISTENT ERROR HANDLING MIDDLEWARE
 */

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test' && statusCode === 500) {
    console.error(`[Error Handler] ${req.method} ${req.url}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    details: err.details || null
  });
}

module.exports = errorHandler;
