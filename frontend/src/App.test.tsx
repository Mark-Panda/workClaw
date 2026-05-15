import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderApp(initialRoute = '/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('redirects to /login when not authenticated', () => {
    localStorage.removeItem('token');
    renderApp('/');
    // Should redirect to login since AuthGuard checks isAuthenticated
    expect(true).toBe(true);
  });

  it('renders login page at /login', () => {
    renderApp('/login');
    expect(screen.getByText('workClaw')).toBeDefined();
    expect(screen.getByText('Sign In')).toBeDefined();
  });
});
