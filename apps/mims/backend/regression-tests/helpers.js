'use strict';

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function getFirstCase(makeRequest, token) {
  const res = await makeRequest('GET', '/api/cases?limit=1&include_meta=true', null, token);
  const rows = Array.isArray(res.body?.rows)
    ? res.body.rows
    : Array.isArray(res.body)
      ? res.body
      : [];
  return rows[0] || null;
}

async function getFirstInquiry(makeRequest, token) {
  const res = await makeRequest('GET', '/api/inbox', null, token);
  const inquiries = Array.isArray(res.body?.inquiries) ? res.body.inquiries : [];
  return inquiries[0] || null;
}

async function getFirstUser(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/users', null, token);
  const users = Array.isArray(res.body?.users) ? res.body.users : [];
  return users[0] || null;
}

async function getFirstFolder(makeRequest, token) {
  const res = await makeRequest('GET', '/api/cm/folders', null, token);
  const folders = Array.isArray(res.body?.folders) ? res.body.folders : [];
  return folders[0] || null;
}

async function getFirstSecurityGroup(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/security-groups', null, token);
  const groups = Array.isArray(res.body?.groups) ? res.body.groups : [];
  return groups[0] || null;
}

module.exports = {
  getFirstFolder,
  getFirstSecurityGroup,
  uniqueName,
  getFirstCase,
  getFirstInquiry,
  getFirstUser,
};
