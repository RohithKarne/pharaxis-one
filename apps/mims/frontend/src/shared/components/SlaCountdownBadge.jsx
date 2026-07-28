import { useState, useEffect } from 'react';

export default function SlaCountdownBadge({ dueAt, slaDue, compact }) {
  const targetDateStr = dueAt || slaDue;
  
  const [timeLeft, setTimeLeft] = useState({
    diffH: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    isBreached: false,
    hasTarget: false
  });

  useEffect(() => {
    if (!targetDateStr) {
      setTimeLeft({ hasTarget: false });
      return;
    }

    const calculateTimeLeft = () => {
      const due = new Date(targetDateStr);
      const now = new Date();
      const diffMs = due - now;
      const diffH = diffMs / (1000 * 60 * 60);
      
      const isBreached = diffMs < 0;
      const absDiffMs = Math.abs(diffMs);
      
      const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absDiffMs / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((absDiffMs / (1000 * 60)) % 60);

      setTimeLeft({
        diffH,
        days,
        hours,
        minutes,
        isBreached,
        hasTarget: true
      });
    };

    calculateTimeLeft();
    const intervalId = setInterval(calculateTimeLeft, 60000); // tick every 60s

    return () => clearInterval(intervalId);
  }, [targetDateStr]);

  if (!timeLeft.hasTarget) return null;

  const { diffH, days, hours, minutes, isBreached } = timeLeft;

  let badgeClass = '';
  let statusText = '';
  let timeString = '';
  let icon = '';

  if (isBreached) {
    badgeClass = 'cf-sla-badge-red';
    statusText = 'BREACHED';
    timeString = `(-${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m)`;
    icon = '🚨';
  } else if (diffH <= 48) {
    badgeClass = 'cf-sla-badge-amber';
    statusText = compact ? '' : 'remaining';
    timeString = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`;
    icon = '⚠️';
  } else {
    badgeClass = 'cf-sla-badge-green';
    statusText = compact ? '' : 'remaining';
    timeString = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`;
    icon = '✓';
  }

  return (
    <span className={`cf-sla-badge ${badgeClass} ${compact ? 'compact' : ''}`}>
      SLA {icon} {isBreached ? statusText : timeString} {isBreached ? timeString : statusText}
    </span>
  );
}
