import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/client/App';

const players = [
  { id: 'player-1', firstName: 'Alex', lastName: 'North', jerseyNumber: '12', photoCount: 1, featuredImageUrl: null, featuredPhotoId: null, crop: { x: 0.5, y: 0.5, zoom: 1 } },
  { id: 'player-2', firstName: 'Sam', lastName: 'South', jerseyNumber: '8', photoCount: 0, featuredImageUrl: null, featuredPhotoId: null, crop: { x: 0.5, y: 0.5, zoom: 1 } },
  { id: 'player-3', firstName: 'Drew', lastName: 'West', jerseyNumber: null, photoCount: 12, featuredImageUrl: null, featuredPhotoId: null, crop: { x: 0.5, y: 0.5, zoom: 1 } },
];
const site = { bannerUrl: null, logoUrl: '/api/site/logo', bannerPosition: { x: 0.5, y: 0.5 } };
const photo = (id: number) => ({ id: `photo-${id}`, filename: `north${id}.jpg`, uploadedAt: '2026-09-27T12:00:00.000Z', displayUrl: `/api/photos/photo-${id}/display`, originalDownloadUrl: `/api/photos/photo-${id}/original` });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function swipeViewer(startX: number, endX: number, startY = 100, endY = 100) {
  const image = within(screen.getByRole('dialog')).getByRole('img');
  fireEvent.touchStart(image, { touches: [{ clientX: startX, clientY: startY }] });
  fireEvent.touchEnd(image, { changedTouches: [{ clientX: endX, clientY: endY }] });
}

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('public pages', () => {
  it('loads the roster and searches by player name or jersey number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith('/api/site') ? site : players), { status: 200 });
    }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alex North' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sam South' })).toBeVisible();
    expect(within(screen.getByRole('link', { name: /Alex North/ })).getByText('1 photo')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /Sam South/ })).getByText('0 photos')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /Drew West/ })).getByText('12 photos')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Players' })).toBeVisible();
    expect(screen.getByRole('link', { name: /View players/ })).toHaveAttribute('href', '#roster');
    expect(screen.queryByText('The team. The moments. All in one place.')).not.toBeInTheDocument();
    expect(screen.queryByText('A season worth remembering.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Miramichi Timberwolves logo' }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search player name or jersey number' }), { target: { value: '12' } });
    expect(screen.getByRole('heading', { name: 'Alex North' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Sam South' })).not.toBeInTheDocument();
  });

  it('keeps team navigation visible without an MT logo fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => json(String(input).endsWith('/api/site') ? { ...site, logoUrl: null } : players)));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Players' })).toBeVisible();
    expect(screen.queryByText('MT')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Miramichi Timberwolves home' })).toBeVisible();
  });

  it('opens a photo viewer and closes it with Escape', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const value = url.endsWith('/api/site') ? site : url.endsWith('/photos')
        ? { items: [photo(1)], nextCursor: null }
        : { id: 'player-1', firstName: 'Alex', lastName: 'North', jerseyNumber: '12' };
      return new Response(JSON.stringify(value), { status: 200 });
    }));
    render(<App />);
    const photoButton = await screen.findByRole('button', { name: 'View photo 1: north1.jpg' });
    expect(screen.getAllByRole('img', { name: 'Miramichi Timberwolves logo' }).length).toBeGreaterThan(0);
    fireEvent.click(photoButton);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 1' })).toBeVisible();
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: /Download original/ })).toHaveAttribute('href', '/api/photos/photo-1/original');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a practical empty gallery message', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).endsWith('/api/site') ? site : String(input).endsWith('/photos') ? { items: [], nextCursor: null } : players[0]), { status: 200 })));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'No photos available yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the roster' })).toBeVisible();
  });

  it('swipes between loaded photos without reacting to short or vertical gestures', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => json(String(input).endsWith('/api/site') ? site : String(input).endsWith('/photos')
      ? { items: [photo(1), photo(2), photo(3)], nextCursor: null } : players[0])));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'View photo 1: north1.jpg' }));
    swipeViewer(200, 100);
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 3' })).toBeVisible();
    swipeViewer(200, 175);
    swipeViewer(200, 100, 100, 240);
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 3' })).toBeVisible();
    swipeViewer(100, 200);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 3' })).toBeVisible();
    swipeViewer(100, 200);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 3' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 3' })).toBeVisible();
  });

  it('loads the next photo page once when swiping past the loaded edge', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    let releasePage: ((response: Response) => void) | undefined;
    const nextPage = new Promise<Response>((resolve) => { releasePage = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/site')) return json(site);
      if (url.includes('cursor=')) return nextPage;
      return json(url.endsWith('/photos') ? { items: [photo(1)], nextCursor: 'second' } : players[0]);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'View photo 1: north1.jpg' }));
    swipeViewer(200, 100);
    swipeViewer(200, 100);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 1' })).toBeVisible();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('cursor='))).toHaveLength(1);
    releasePage?.(json({ items: [photo(2)], nextCursor: null }));
    expect(await screen.findByRole('dialog', { name: 'Photo 2 of 2' })).toBeVisible();
    swipeViewer(200, 100);
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 2' })).toBeVisible();
  });

  it('shows a viewer error and retries a failed swipe page load', async () => {
    window.history.replaceState({}, '', '/player/player-1');
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/site')) return json(site);
      if (url.includes('cursor=')) return ++attempts === 1 ? json({ error: 'Could not load photos' }, 503) : json({ items: [photo(2)], nextCursor: null });
      return json(url.endsWith('/photos') ? { items: [photo(1)], nextCursor: 'second' } : players[0]);
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'View photo 1: north1.jpg' }));
    swipeViewer(200, 100);
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Could not load photos');
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 1' })).toBeVisible();
    swipeViewer(200, 100);
    expect(await screen.findByRole('dialog', { name: 'Photo 2 of 2' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
