import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useWebSocket } from './useWebSocket';

export function useStreamingChat() {
  const { isStreaming, appendStreamToken, setIsStreaming, clearStreamingMessage, addMessage } =
    useStore();
  const agentIdRef = useRef<string>('');

  const { send } = useWebSocket(isStreaming ? '/ws/chat' : null, {
    onMessage: (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'chat:token':
            appendStreamToken(msg.token);
            break;
          case 'chat:done':
            addMessage({
              id: msg.messageId,
              role: 'assistant',
              content: useStore.getState().streamingMessage,
              createdAt: new Date().toISOString(),
            });
            clearStreamingMessage();
            setIsStreaming(false);
            break;
          case 'chat:error':
            setIsStreaming(false);
            break;
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    },
    onOpen: () => {
      send({
        type: 'chat:send',
        payload: {
          conversationId: '',
          content: useStore.getState().streamingMessage,
          agentId: agentIdRef.current,
        },
      });
    },
    onClose: () => setIsStreaming(false),
  });

  const startStream = useCallback(
    (content: string, agentId: string) => {
      agentIdRef.current = agentId;
      setIsStreaming(true);
    },
    [setIsStreaming],
  );

  return { startStream, isStreaming, send };
}
