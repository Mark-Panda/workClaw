import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Breadcrumb from './Breadcrumb';

export default function Header() {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <Breadcrumb pathname={location.pathname} />
      <div className="flex items-center gap-3">
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
