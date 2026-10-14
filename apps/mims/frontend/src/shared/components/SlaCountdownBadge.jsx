import { useState, useEffect } from 'react';

function timeLeftUntil(targetDateStr, now) {
  const diffMs = new Date(targetDateStr) - now;
  const diffH = diffMs / (1000 * 60 * 60);
  const absDiffMs = Math.abs(diffMs);
  return {
    diffH,
    days: Math.floor(absDiffMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((absDiffMs / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((absDiffMs / (1000 * 60)) % 60),
    isBreached: diffMs < 0,
    hasTarget: true,
  };
}

export default function SlaCountdownBadge({ dueAt, slaDue, compact }) {
  const targetDateStr = dueAt || slaDue;
  
  // The time now, moved on every minute; what is left is worked out from it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetDateStr) return;
    const intervalId = setInterval(() => setNow(Date.now()), 60000); // tick every 60s
    return () => clearInterval(intervalId);
  }, [targetDateStr]);

  const timeLeft = targetDateStr ? timeLeftUntil(targetDateStr, now) : { hasTarget: false };

  if (!timeLeft.hasTarget) return null;

  const { diffH, days, hours, minutes, isBreached } = timeLeft;

  let badgeClass = '';
  let statusText = '';
  let timeString = '';

  if (isBreached) {
    badgeClass = 'cf-sla-badge-red';
    statusText = 'BREACHED';
    timeString = `(-${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m)`;
  } else if (diffH <= 48) {
    badgeClass = 'cf-sla-badge-amber';
    statusText = compact ? '' : 'remaining';
    timeString = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`;
  } else {
    badgeClass = 'cf-sla-badge-green';
    statusText = compact ? '' : 'remaining';
    timeString = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`;
  }

  return (
    <span className={`cf-sla-badge ${badgeClass} ${compact ? 'compact' : ''}`}>
      SLA {isBreached ? statusText : timeString} {isBreached ? timeString : statusText}
    </span>
  );
}
