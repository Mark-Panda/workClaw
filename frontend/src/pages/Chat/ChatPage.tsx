import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store';
import { useStreamingChat } from '../../hooks/useStreamingChat';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';

export default function ChatPage() {
  const { conversationId } = useParams();
  const { currentConversation } = useStore();
  const { startStream, isStreaming, send } = useStreamingChat();
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    startStream(input, currentConversation?.agentId ?? 'agent-1');
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          Chat {conversationId ? `#${conversationId.slice(0, 8)}` : ''}
        </h1>
      </div>

      <div className="flex-1 overflow-auto card mb-4 p-4">
        <MessageList
          messages={currentConversation?.messages ?? []}
        />
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
      />
    </div>
  );
}
