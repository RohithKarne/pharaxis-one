'use strict';

/**
 * services/jiraService.js — Atlassian Jira Cloud Integration Service
 * Serves Jira issue creation, status querying, and project listing for CP Portal.
 */

const JIRA_HOST = (process.env.JIRA_HOST || 'https://rohithkarne.atlassian.net').replace(/\/+$/, '');
const JIRA_EMAIL = process.env.JIRA_EMAIL || 'rohithreddy480@gmail.com';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || '';
const DEFAULT_PROJECT = process.env.JIRA_DEFAULT_PROJECT || 'CP';

function getAuthHeader() {
  const authStr = `${JIRA_EMAIL}:${JIRA_API_TOKEN}`;
  return `Basic ${Buffer.from(authStr).toString('base64')}`;
}

async function fetchJira(endpoint, options = {}) {
  const url = `${JIRA_HOST}${endpoint}`;
  const headers = {
    'Authorization': getAuthHeader(),
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Jira API Error (${res.status}): ${errorText.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * List all projects accessible on the Jira Cloud instance.
 */
async function listProjects() {
  return fetchJira('/rest/api/3/project');
}

/**
 * Search issues for a given project key (default: 'CP').
 */
async function searchIssues(projectKey = DEFAULT_PROJECT, maxResults = 10) {
  return fetchJira('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify({
      jql: `project = ${projectKey} ORDER BY created DESC`,
      maxResults,
      fields: ['summary', 'status', 'assignee', 'created', 'updated'],
    }),
  });
}

/**
 * Create a new Jira issue.
 */
async function createIssue({ projectKey = DEFAULT_PROJECT, summary, description, issueType = 'Task' }) {
  return fetchJira('/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: String(summary || ''),
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: String(description || summary || '') }],
            },
          ],
        },
        issuetype: { name: issueType },
      },
    }),
  });
}

/**
 * Add a comment to a Jira issue.
 */
async function addComment(issueKey, commentText) {
  return fetchJira(`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: String(commentText || '') }],
          },
        ],
      },
    }),
  });
}

/**
 * Update fields of an existing Jira issue.
 */
async function updateIssue(issueKey, fields) {
  return fetchJira(`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
}

/**
 * Transition an issue status (e.g. To Do -> In Progress -> Done).
 */
async function transitionIssue(issueKey, transitionId) {
  return fetchJira(`/rest/api/3/issue/${issueKey}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: String(transitionId) } }),
  });
}

module.exports = {
  listProjects,
  searchIssues,
  createIssue,
  addComment,
  updateIssue,
  transitionIssue,
};
