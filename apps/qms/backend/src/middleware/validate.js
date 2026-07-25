/**
 * QMS Input Validation Middleware
 * Enforces strict request body, query, and parameter validation across API endpoints.
 */

export function validateSchema(schema) {
  return (req, res, next) => {
    const errors = [];

    if (schema.body) {
      const body = req.body || {};
      for (const [field, rules] of Object.entries(schema.body)) {
        const val = body[field];

        if (rules.required && (val === undefined || val === null || val === '')) {
          errors.push({ field, message: `${field} is required` });
          continue;
        }

        if (val !== undefined && val !== null && val !== '') {
          if (rules.type === 'string' && typeof val !== 'string') {
            errors.push({ field, message: `${field} must be a string` });
          } else if (rules.type === 'number' && typeof val !== 'number') {
            errors.push({ field, message: `${field} must be a number` });
          } else if (rules.type === 'boolean' && typeof val !== 'boolean') {
            errors.push({ field, message: `${field} must be a boolean` });
          } else if (rules.type === 'array' && !Array.isArray(val)) {
            errors.push({ field, message: `${field} must be an array` });
          }

          if (rules.minLength && typeof val === 'string' && val.length < rules.minLength) {
            errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
          }

          if (rules.maxLength && typeof val === 'string' && val.length > rules.maxLength) {
            errors.push({ field, message: `${field} cannot exceed ${rules.maxLength} characters` });
          }

          if (rules.enum && Array.isArray(rules.enum) && !rules.enum.includes(val)) {
            errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    return next();
  };
}

export const SCHEMAS = {
  USER_LOGIN: {
    body: {
      userId: { required: true, type: 'string', minLength: 1 },
      password: { required: true, type: 'string', minLength: 1 },
      orgCode: { required: true, type: 'string', minLength: 1 }
    }
  },
  SUPERADMIN_LOGIN: {
    body: {
      userId: { required: true, type: 'string', minLength: 1 },
      password: { required: true, type: 'string', minLength: 1 }
    }
  },
  CREATE_DOCUMENT: {
    body: {
      title: { required: true, type: 'string', minLength: 3, maxLength: 255 },
      docType: { required: true, type: 'string' }
    }
  },
  CREATE_CAPA: {
    body: {
      title: { required: true, type: 'string', minLength: 3, maxLength: 255 },
      sourceType: { required: true, type: 'string' }
    }
  }
};
