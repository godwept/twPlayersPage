import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/client/App';

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('application shell', () => {
  it('starts with a clean DOM', () => {
    expect(screen.queryByRole('heading', { name: 'Miramichi Timberwolves' })).not.toBeInTheDocument();
  });

  it('shows the team name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Miramichi Timberwolves' })).toBeVisible();
  });

  it('uses the team logo and practical title on admin login', async () => {
    window.history.replaceState({}, '', '/admin');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).endsWith('/api/site')
      ? { bannerUrl: null, logoUrl: '/api/site/logo', bannerPosition: { x: 0.5, y: 0.5 } }
      : { error: 'Authentication required' }), { status: String(input).endsWith('/api/admin/session') ? 401 : 200 })));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Photographer login' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Miramichi Timberwolves logo' })).toBeVisible();
    expect(screen.getByLabelText('Administrator password')).toBeVisible();
    expect(screen.getByRole('link', { name: /Public gallery/ })).toBeVisible();
  });

  it('keeps authenticated admin sections available', async () => {
    window.history.replaceState({}, '', '/admin');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).endsWith('/api/site')
      ? { bannerUrl: null, logoUrl: '/api/site/logo', bannerPosition: { x: 0.5, y: 0.5 } }
      : String(input).endsWith('/api/players') ? [] : { authenticated: true }), { status: 200 })));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Photographer admin' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Miramichi Timberwolves logo' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Manage players' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Manage photographs' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Website artwork' })).toBeVisible();
  });
});
