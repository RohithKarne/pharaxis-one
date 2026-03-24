/**
 * authController.js — Authentication Logic
 *
 * WHAT THIS FILE DOES:
 * - Handles the business logic for login and registration
 * - Uses bcrypt to securely hash and compare passwords
 * - Uses JWT (JSON Web Token) to issue a session token after login
 *
 * HOW IT FITS TOGETHER:
 *   Browser → routes/auth.js → authController.js → userModel.js → MySQL DB
 *
 * KEY CONCEPTS:
 * - bcrypt: Never store plain passwords. bcrypt hashes them so even if the DB
 *   is leaked, passwords can't be read.
 * - JWT: A signed token the browser stores and sends with every request to prove
 *   the user is logged in. Think of it like a signed hall pass.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const pool = require('../database/db');

// Helper: write to login_audit table (21 CFR Part 11 — AUD-02, AUD-03, AUD-04)
async function logLoginAudit({ userId, userName, role, status, failReason }) {
  try {
    await pool.execute(
      `INSERT INTO login_audit (user_id, user_name, role, status, fail_reason) VALUES (?, ?, ?, ?, ?)`,
      [userId || null, userName || null, role || null, status, failReason || null]
    );
  } catch (_) {}
}

// Secret key used to sign JWT tokens — in production this goes in a .env file
const JWT_SECRET = process.env.JWT_SECRET || 'mims-dev-secret-change-in-production';
const SALT_ROUNDS = 10; // bcrypt work factor — higher = more secure but slower

const authController = {
  /**
   * POST /api/auth/register
   * Creates a new user account
   */
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body;

      // --- Validation ---
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      // Valid roles in MIMS
      const validRoles = ['admin', 'agent', 'reviewer', 'content_manager', 'superadmin'];
      const userRole = role && validRoles.includes(role) ? role : 'agent';

      // Check if email is already registered
      if (await userModel.emailExists(email)) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      // --- Hash the password ---
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // --- Save to database ---
      const newUser = await userModel.create({
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: userRole
      });

      return res.status(201).json({
        message: 'Account created successfully.',
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
      });

    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  },

  /**
   * POST /api/auth/login
   * Authenticates a user and returns a JWT token
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // --- Validation ---
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      // --- Look up user ---
      const user = await userModel.findByEmail(email.toLowerCase().trim());

      if (!user) {
        // Log failed attempt — email not found (AUD-04)
        logLoginAudit({ userName: email, status: 'failed', failReason: 'User not found' });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (!user.is_active) {
        logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Account deactivated' });
        return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });
      }

      // --- Compare password with stored hash ---
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        // Log failed attempt — wrong password (AUD-04)
        logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Wrong password' });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // --- Issue JWT token (valid for 8 hours) ---
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      // Log successful login (AUD-02)
      logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'success' });

      // Fetch module permissions for this user (assigned by Superadmin)
      const [userModulesRows] = await pool.execute(
        'SELECT module FROM user_module_permissions WHERE user_id = ? AND can_access = 1',
        [user.id]
      );
      const userModules = userModulesRows.map(r => r.module);

      let modules;
      if (user.role === 'superadmin') {
        const [distRows] = await pool.execute('SELECT DISTINCT module FROM role_permissions');
        modules = distRows.map(r => r.module);
      } else {
        modules = userModules;
      }

      return res.status(200).json({
        message: 'Login successful.',
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        modules
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  },

  /**
   * GET /api/auth/me
   * Returns the currently logged-in user's details (requires valid JWT)
   */
  async me(req, res) {
    // req.user is set by the auth middleware (see server.js)
    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user });
  }
};

module.exports = authController;
