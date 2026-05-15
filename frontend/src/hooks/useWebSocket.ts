import { useEffect, useRef, useCallback } from 'react';

interface WsOptions {
  onMessage: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(url: string | null, options: WsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!url) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}${url}`);
    wsRef.current = ws;

    ws.onopen = () => optionsRef.current.onOpen?.();
    ws.onclose = () => optionsRef.current.onClose?.();
    ws.onerror = (e) => optionsRef.current.onError?.(e);
    ws.onmessage = (e) => optionsRef.current.onMessage(e);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
