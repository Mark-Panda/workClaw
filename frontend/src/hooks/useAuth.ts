import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import * as authApi from '../api/auth';
import type { LoginRequest, RegisterRequest } from '../types/auth';

export function useAuth() {
  const { setAuth, logout: storeLogout, isAuthenticated } = useStore();
  const navigate = useNavigate();

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await authApi.login(data);
      setAuth({ id: res.userId, username: data.username, email: '' }, res.token);
      navigate('/dashboard');
    },
    [setAuth, navigate],
  );

  const registerUser = useCallback(
    async (data: RegisterRequest) => {
      const res = await authApi.register(data);
      navigate('/login');
    },
    [navigate],
  );

  const logout = useCallback(() => {
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { login, register: registerUser, logout, isAuthenticated };
}
