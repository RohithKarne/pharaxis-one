/**
 * userModel.js — User Database Operations
 *
 * WHAT THIS FILE DOES:
 * - Defines all database queries related to users
 * - Acts as the "data layer" — the only place that touches the users table directly
 *
 * WHY SEPARATE MODELS?
 * Keeping database queries in one place (models) makes code easier to maintain.
 * If the database structure changes, you only update this file — not every controller.
 */

const db = require('../database/db');

const userModel = {
  /**
   * Find a user by their email address
   * Used during login to look up the user
   */
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  /**
   * Find a user by their ID
   * Used after login to fetch user details
   */
  findById(id) {
    return db.prepare('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?').get(id);
  },

  /**
   * Get all users (for admin user management)
   * Returns all fields except password for security
   */
  findAll() {
    return db.prepare('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC').all();
  },

  /**
   * Create a new user
   * password should already be hashed before calling this
   */
  create({ name, email, password, role = 'agent' }) {
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, password, role);
    return { id: result.lastInsertRowid, name, email, role };
  },

  /**
   * Update a user's active status (enable/disable account)
   */
  setActiveStatus(id, isActive) {
    return db.prepare('UPDATE users SET is_active = ?, updated_at = datetime("now") WHERE id = ?').run(isActive ? 1 : 0, id);
  },

  /**
   * Check if a user with this email already exists
   */
  emailExists(email) {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    return !!user;
  }
};

module.exports = userModel;
