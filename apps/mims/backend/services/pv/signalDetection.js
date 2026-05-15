'use strict';

function computePrRor(matrix) {
  const a = Number(matrix.a || 0), b = Number(matrix.b || 0), c = Number(matrix.c || 0), d = Number(matrix.d || 0);
  const prr = a && (a + b) && (c + d) ? (a / (a + b)) / (c / (c + d) || 1) : 0;
  const ror = b && c ? (a * d) / (b * c) : 0;
  return { prr: Number(prr.toFixed(3)), ror: Number(ror.toFixed(3)), review_required: prr >= 2 || ror >= 2 };
}

module.exports = { computePrRor };
