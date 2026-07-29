import { useEffect, useState, useRef } from 'react';
import toast from '../utils/toast';

/**
 * Polling for unread notifications and displaying toast alerts.
 * We avoid `new Audio()` spam by tracking seen notification IDs.
 */
export default function ToastNotificationListener() {
  const seenIdsRef = useRef(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, audioCtx.currentTime); // High pitched chime
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn('Failed to play chime', e);
    }
  };

  useEffect(() => {
    if (!mounted) return;

    let pollInterval;

    // A toast means "this just happened", not "you have unread items".
    //
    // seenIds lives in a ref, so it emptied on every mount — and unread
    // notifications stay unread until the user opens them. The result was that
    // every page load replayed the entire unread list as a stack of toasts over
    // the header, day after day. The first poll now only records what already
    // exists; toasts fire from the second poll onward, for genuinely new items.
    // The unread backlog belongs in the notification bell, not on top of the UI.
    let primed = false;

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications?unread_only=true');
        if (!res.ok) return;

        const data = await res.json();
        const unread = Array.isArray(data) ? data : data.notifications || [];

        if (!primed) {
          unread.forEach(n => seenIdsRef.current.add(n.id));
          primed = true;
          return;
        }

        unread.forEach(notif => {
          if (!seenIdsRef.current.has(notif.id)) {
            seenIdsRef.current.add(notif.id);

            // Determine severity
            const category = notif.category || '';
            const isCritical = category === 'sla_breach' || category === 'escalation';
            const isWarning = category === 'sla_warning';
            
            if (isCritical) {
              playChime();
            }

            const message = notif.message || notif.title || 'New Notification';
            const targetUrl = notif.link_url || (notif.case_id ? `/cases/${notif.case_id}` : null);
            const prefix = category ? `[${category.replace('_', ' ').toUpperCase()}] ` : '';

            const action = targetUrl ? { label: 'View', url: targetUrl } : null;

            if (isCritical) {
              toast.error(prefix + message, 8000, action);
            } else if (isWarning) {
              toast.warn(prefix + message, 6000, action);
            } else {
              toast.info(prefix + message, 4000, action);
            }
          }
        });
      } catch (err) {
        console.error('Notification polling error:', err);
      }
    };

    fetchNotifications(); // Initial fetch
    pollInterval = setInterval(fetchNotifications, 15000); // 15 seconds

    return () => clearInterval(pollInterval);
  }, [mounted]);

  return null; // Headless component
}
