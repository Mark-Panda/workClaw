import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AuthGuard from './components/guards/AuthGuard';
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ChatPage from './pages/Chat/ChatPage';
import AgentListPage from './pages/Agents/AgentListPage';
import AgentEditorPage from './pages/Agents/AgentEditorPage';
import RuleListPage from './pages/Rules/RuleListPage';
import RuleEditorPage from './pages/Rules/RuleEditorPage';
import KanbanBoardPage from './pages/Kanban/KanbanBoardPage';
import LogsPage from './pages/Logs/LogsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/agents" element={<AgentListPage />} />
        <Route path="/agents/new" element={<AgentEditorPage />} />
        <Route path="/agents/:id" element={<AgentEditorPage />} />
        <Route path="/rules" element={<RuleListPage />} />
        <Route path="/rules/new" element={<RuleEditorPage />} />
        <Route path="/rules/:id" element={<RuleEditorPage />} />
        <Route path="/kanban" element={<KanbanBoardPage />} />
        <Route path="/kanban/:boardId" element={<KanbanBoardPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
