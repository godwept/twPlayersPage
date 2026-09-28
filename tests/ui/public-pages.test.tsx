import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/client/App';

const players = [
  { id: 'player-1', firstName: 'Alex', lastName: 'North', jerseyNumber: '12', featuredImageUrl: null, featuredPhotoId: null, crop: { x: 0.5, y: 0.5, zoom: 1 } },
  { id: 'player-2', firstName: 'Sam', lastName: 'South', jerseyNumber: '8', featuredImageUrl: null, featuredPhotoId: null, crop: { x: 0.5, y: 0.5, zoom: 1 } },
];

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('public pages', () => {
  it('loads the roster and searches by player name or jersey number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith('/api/site') ? { bannerUrl: null, logoUrl: null, bannerPosition: { x: 0.5, y: 0.5 } } : players), { status: 200 });
    }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alex North' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sam South' })).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search player name or jersey number' }), { target: { value: '12' } });
    expect(screen.getByRole('heading', { name: 'Alex North' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Sam South' })).not.toBeInTheDocument();
  });

  it('opens a photo viewer and closes it with Escape', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const value = url.endsWith('/photos')
        ? { items: [{ id: 'photo-1', filename: 'north1.jpg', uploadedAt: '2026-09-27T12:00:00.000Z', displayUrl: '/api/photos/photo-1/display', originalDownloadUrl: '/api/photos/photo-1/original' }], nextCursor: null }
        : { id: 'player-1', firstName: 'Alex', lastName: 'North', jerseyNumber: '12' };
      return new Response(JSON.stringify(value), { status: 200 });
    }));
    render(<App />);
    const photo = await screen.findByRole('button', { name: 'View photo 1: north1.jpg' });
    fireEvent.click(photo);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 1' })).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
