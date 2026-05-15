import client from './client';
import type { Conversation } from '../types/chat';

export async function listConversations(): Promise<{ conversations: Conversation[] }> {
  const res = await client.get('/chat/conversations');
  return res.data;
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await client.get(`/chat/conversations/${id}`);
  return res.data;
}

export async function deleteConversation(id: string): Promise<void> {
  await client.delete(`/chat/conversations/${id}`);
}

export async function sendMessage(
  conversationId: string,
  content: string,
  agentId: string,
): Promise<{ messageId: string; content: string }> {
  const res = await client.post('/chat/send', { conversationId, content, agentId });
  return res.data;
}
