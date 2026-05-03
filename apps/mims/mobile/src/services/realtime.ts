import { buildRealtimeWebSocketUrl } from './api';
import { AppRealtimeMessage, RealtimeConnectionState } from '../types/mims';

type RealtimeClientOptions = {
  onMessage: (message: AppRealtimeMessage) => void;
  onStatusChange?: (status: RealtimeConnectionState) => void;
  token: string;
};

type RealtimeClient = {
  close: () => void;
};

function parseRealtimeMessage(raw: string): AppRealtimeMessage | null {
  try {
    return JSON.parse(raw) as AppRealtimeMessage;
  } catch (_) {
    return null;
  }
}

export function connectAppRealtime(options: RealtimeClientOptions): RealtimeClient {
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const notifyStatus = (status: RealtimeConnectionState) => {
    options.onStatusChange?.(status);
  };

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    if (closed) return;
    clearReconnectTimer();
    attempts += 1;
    notifyStatus('reconnecting');
    const delay = Math.min(10000, 1000 * attempts);
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    clearReconnectTimer();
    notifyStatus(attempts === 0 ? 'connecting' : 'reconnecting');
    socket = new WebSocket(buildRealtimeWebSocketUrl(options.token));

    socket.onopen = () => {
      attempts = 0;
      notifyStatus('connected');
    };

    socket.onmessage = (event) => {
      const next = parseRealtimeMessage(String(event.data || ''));
      if (next) options.onMessage(next);
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onclose = () => {
      socket = null;
      if (closed) {
        notifyStatus('disconnected');
        return;
      }
      scheduleReconnect();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      clearReconnectTimer();
      if (socket) {
        try {
          socket.close();
        } catch (_) {
          // best-effort only
        }
      }
      notifyStatus('disconnected');
    },
  };
}
