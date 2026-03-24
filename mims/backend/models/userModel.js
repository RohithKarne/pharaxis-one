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

const pool = require('../database/db');

const userModel = {
  /**
   * Find a user by their email address
   * Used during login to look up the user
   */
  async findByEmail(email) {
    const [[row]] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return row || null;
  },

  /**
   * Find a user by their ID
   * Used after login to fetch user details
   */
  async findById(id) {
    const [[row]] = await pool.execute(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?', [id]
    );
    return row || null;
  },

  /**
   * Get all users (for admin user management)
   * Returns all fields except password for security
   */
  async findAll() {
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },

  /**
   * Create a new user
   * password should already be hashed before calling this
   */
  async create({ name, email, password, role = 'agent' }) {
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, password, role]
    );
    const [[row]] = await pool.execute(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    return row;
  },

  /**
   * Update a user's active status (enable/disable account)
   */
  async setActiveStatus(id, isActive) {
    const [result] = await pool.execute(
      'UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?',
      [isActive ? 1 : 0, id]
    );
    return result;
  },

  /**
   * Check if a user with this email already exists
   */
  async emailExists(email) {
    const [[row]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    return !!row;
  }
};

module.exports = userModel;
