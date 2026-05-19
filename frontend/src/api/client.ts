import axios from 'axios';
import { showError } from '../utils/toast';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to requests
client.interceptors.request.use((config) => {
  const raw = localStorage.getItem('herness-store');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const token = parsed?.state?.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch { /* ignore */ }
  }
  return config;
});

// Handle auth errors + global error toast
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.response?.data?.message;

    if (status === 401) {
      localStorage.removeItem('herness-store');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (status === 403) {
      showError(message || '没有权限执行此操作');
      return Promise.reject(error);
    }

    if (status === 404) {
      showError(message || '请求的资源不存在');
      return Promise.reject(error);
    }

    if (status && status >= 500) {
      showError(message || '服务器错误，请稍后重试');
      return Promise.reject(error);
    }

    if (status && status >= 400) {
      showError(message || '请求失败');
      return Promise.reject(error);
    }

    if (!error.response) {
      showError('网络连接失败，请检查网络');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default client;
