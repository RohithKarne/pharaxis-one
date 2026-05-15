'use strict';

function resolveDataRegion(org = {}) {
  return org.data_region || process.env.MIMS_DEFAULT_DATA_REGION || 'us-east';
}

function regionRouter(req, _res, next) {
  req.dataRegion = req.user?.data_region || req.headers['x-mims-data-region'] || process.env.MIMS_DEFAULT_DATA_REGION || 'us-east';
  next();
}

module.exports = { regionRouter, resolveDataRegion };
