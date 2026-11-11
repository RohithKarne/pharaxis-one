/**
 * textDiff.js — Lightweight, pure word/token diffing utility for document reviews.
 * Computes longest common subsequence (LCS) to generate additions, deletions, and unchanged tokens.
 */

export function computeWordDiff(textA = '', textB = '') {
  const strA = String(textA || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const strB = String(textB || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  if (strA === strB) {
    return strA ? [{ type: 'unchanged', text: strA }] : [];
  }

  const wordsA = strA ? strA.split(' ') : [];
  const wordsB = strB ? strB.split(' ') : [];

  const m = wordsA.length;
  const n = wordsB.length;

  // LCS Matrix
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (wordsA[i] === wordsB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff tokens
  const tokens = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      tokens.unshift({ type: 'unchanged', text: wordsA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ type: 'added', text: wordsB[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      tokens.unshift({ type: 'removed', text: wordsA[i - 1] });
      i--;
    }
  }

  return tokens;
}

export function summarizeDiff(tokens = []) {
  let additions = 0;
  let deletions = 0;
  for (const t of tokens) {
    if (t.type === 'added') additions++;
    if (t.type === 'removed') deletions++;
  }
  return { additions, deletions, hasChanges: additions > 0 || deletions > 0 };
}
