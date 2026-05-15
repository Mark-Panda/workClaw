import type { Conversation, Message } from '../../types/chat';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface ChatSlice {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  streamingMessage: string;
  isStreaming: boolean;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  addMessage: (message: Message) => void;
  appendStreamToken: (token: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  clearStreamingMessage: () => void;
}

export const createChatSlice: StateCreator<AppStore, [], [], ChatSlice> = (set) => ({
  conversations: [],
  currentConversation: null,
  streamingMessage: '',
  isStreaming: false,

  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),

  addMessage: (message) =>
    set((state) => {
      if (!state.currentConversation) return state;
      return {
        currentConversation: {
          ...state.currentConversation,
          messages: [...state.currentConversation.messages, message],
        },
      };
    }),

  appendStreamToken: (token) => set((s) => ({ streamingMessage: s.streamingMessage + token })),

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  clearStreamingMessage: () => set({ streamingMessage: '' }),
});
