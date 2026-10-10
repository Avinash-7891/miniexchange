/**
 * middleware/rateLimiter.js
 * 
 * IN-MEMORY SLIDING WINDOW RATE LIMITER FOR SENSITIVE ENDPOINTS (e.g. Login)
 */

function createRateLimiter({ windowMs = 60000, maxRequests = 20, message = 'Too many requests, please try again later.' } = {}) {
  const requests = new Map(); // ip -> [timestamps]

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const timestamps = requests.get(ip) || [];

    // Filter out timestamps outside window
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: message });
    }

    recent.push(now);
    requests.set(ip, recent);
    next();
  };
}

module.exports = {
  createRateLimiter
};
