import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import * as authApi from '../api/auth';
import { showError } from '../utils/toast';
import type { LoginRequest, RegisterRequest } from '../types/auth';

export function useAuth() {
  const { setAuth, logout: storeLogout, isAuthenticated } = useStore();
  const navigate = useNavigate();

  const login = useCallback(
    async (data: LoginRequest) => {
      try {
        const res = await authApi.login(data);
        setAuth({ id: res.userId, username: data.username, email: '' }, res.token);
        navigate('/dashboard');
      } catch {
        showError('登录失败，请检查用户名和密码');
      }
    },
    [setAuth, navigate],
  );

  const registerUser = useCallback(
    async (data: RegisterRequest) => {
      try {
        await authApi.register(data);
        navigate('/login');
      } catch {
        showError('注册失败，用户名可能已被占用');
      }
    },
    [navigate],
  );

  const logout = useCallback(() => {
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { login, register: registerUser, logout, isAuthenticated };
}
