import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/client/App';

const player = { id: 'photo-player', firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: '12345' };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.history.replaceState({}, '', '/admin');
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PATCH') return Response.json({ ok: true });
    if (url === '/api/players') return Response.json([player]);
    if (url === '/api/site') return Response.json({ bannerUrl: null, logoUrl: null, bannerPosition: { x: 0.5, y: 0.5 } });
    if (url.includes('/photos')) return Response.json({ items: [], nextCursor: null });
    return Response.json({ authenticated: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

async function beginEdit() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Alex Example' }));
  return screen.getByLabelText('HockeyTech player ID');
}

describe('admin HockeyTech link editing', () => {
  it('loads the stored ID and saves a manual override with the existing player fields', async () => {
    const field = await beginEdit();
    expect(field).toHaveValue('12345');
    fireEvent.change(field, { target: { value: '67890' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/players/photo-player', expect.objectContaining({ method: 'PATCH',
      body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: '67890' }),
    })));
  });

  it('sends null when the manually editable field is emptied', async () => {
    fireEvent.change(await beginEdit(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/players/photo-player', expect.objectContaining({ method: 'PATCH',
      body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: null }),
    })));
  });
});

describe('current roster picker', () => {
  const roster = [
    { id: '67890', name: 'Roster Defender', jerseyNumber: '24', position: 'D', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/67890.jpg' },
    { id: '67891', name: 'Roster Goalie', jerseyNumber: '30', position: 'G', imageUrl: 'https://assets.leaguestat.com/mhl/240x240/67891.jpg' },
  ];
  function mockRoster(fail = false) {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/admin/hockeytech/roster') return Response.json(fail ? { error: 'Roster lookup unavailable. Enter the ID manually.' } : { players: roster }, { status: fail ? 502 : 200 });
      return original(input, init);
    });
  }

  it('loads on request, displays headshots and roster details, searches and selects without copying names or numbers', async () => {
    mockRoster();
    const field = await beginEdit();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/hockeytech/roster');
    fireEvent.click(screen.getByRole('button', { name: 'Find from current roster' }));
    expect(await screen.findByRole('img', { name: 'Roster Defender headshot' })).toHaveAttribute('src', roster[0].imageUrl);
    expect(screen.getByText('Roster Defender')).toBeVisible();
    expect(screen.getByText('#24 · D')).toBeVisible();
    expect(screen.getByText('#30 · G')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search current roster'), { target: { value: 'defender' } });
    expect(screen.queryByText('Roster Goalie')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search current roster'), { target: { value: '30' } });
    expect(screen.queryByText('Roster Defender')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search current roster'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select Roster Defender' }));
    expect(field).toHaveValue('67890');
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/players/photo-player', expect.objectContaining({
      body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: '67890' }),
    })));
  });

  it('clears the link explicitly without deleting the player or photographs', async () => {
    const field = await beginEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Clear link' }));
    expect(field).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/players/photo-player', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: null }),
    })));
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
  });

  it('leaves manual override usable after a failed lookup', async () => {
    mockRoster(true);
    const field = await beginEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Find from current roster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Roster lookup unavailable. Enter the ID manually.');
    expect(field).toBeEnabled();
    fireEvent.change(field, { target: { value: '98765' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/players/photo-player', expect.objectContaining({
      body: JSON.stringify({ firstName: 'Alex', lastName: 'Example', jerseyNumber: '14', hockeyTechPlayerId: '98765' }),
    })));
  });

  it('discards picker results and unsaved IDs when editing is cancelled', async () => {
    mockRoster();
    await beginEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Find from current roster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Roster Defender' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('HockeyTech player ID')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex Example' }));
    expect(screen.getByLabelText('HockeyTech player ID')).toHaveValue('12345');
    expect(screen.queryByText('Roster Defender')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/admin/hockeytech/roster')).toHaveLength(1);
  });
});
