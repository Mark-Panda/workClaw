import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AuthGuard from './components/guards/AuthGuard';
import Spinner from './components/common/Spinner';

const LoginPage = lazy(() => import('./pages/Login/LoginPage'));
const RegisterPage = lazy(() => import('./pages/Register/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));
const ChatPage = lazy(() => import('./pages/Chat/ChatPage'));
const AgentListPage = lazy(() => import('./pages/Agents/AgentListPage'));
const AgentEditorPage = lazy(() => import('./pages/Agents/AgentEditorPage'));
const RuleListPage = lazy(() => import('./pages/Rules/RuleListPage'));
const RuleEditorPage = lazy(() => import('./pages/Rules/RuleEditorPage'));
const KanbanBoardPage = lazy(() => import('./pages/Kanban/KanbanBoardPage'));
const LogsPage = lazy(() => import('./pages/Logs/LogsPage'));
const ModelManagementPage = lazy(() => import('./pages/Models/ModelManagementPage'));
const SkillsPage = lazy(() => import('./pages/Skills/SkillsPage'));
const McpServersPage = lazy(() => import('./pages/McpServers/McpServersPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
          <Route path="/models" element={<ModelManagementPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/mcp-servers" element={<McpServersPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
