/**
 * middleware/auth.js — JWT Authentication Middleware
 *
 * WHAT IS MIDDLEWARE?
 * Middleware is code that runs BETWEEN receiving a request and sending a response.
 * Think of it as a security checkpoint — the request must pass through it first.
 *
 * WHAT THIS FILE DOES:
 * - Reads the JWT token from the request's Authorization header
 * - Verifies it's valid and not expired
 * - If valid: attaches the user info to the request and allows it through
 * - If invalid: immediately rejects the request with a 401 Unauthorized error
 *
 * HOW TO USE:
 * Add `authenticate` as a parameter to any route that requires login:
 *   router.get('/protected-route', authenticate, myController.handler)
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mims-dev-secret-change-in-production';

function authenticate(req, res, next) {
  // Tokens are sent in the Authorization header as: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // Verify the token signature and expiry
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email, role }
    next(); // Pass control to the next function (the actual route handler)
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

/**
 * requireRole(role)
 * Use after `authenticate` to restrict access by role.
 * Example: router.delete('/users/:id', authenticate, requireRole('admin'), ...)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
