import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, TouchEvent } from 'react';
import { matchPhotoFilename } from '../shared/photo-filename';
import { formatCrc32, photoChecksums } from '../../shared/photo-checksum';
import { parseRosterCsv, type RosterCsvPlayer } from '../shared/roster-csv';
import './styles.css';

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  hockeyTechPlayerId?: string | null;
  featuredImageUrl?: string | null;
  featuredPhotoId?: string | null;
  crop?: { x: number; y: number; zoom: number };
};
type RosterPlayer = Player & { photoCount: number };
type Photo = { id: string; filename: string; uploadedAt: string; displayUrl: string; originalDownloadUrl: string };
type GalleryPage = { items: Photo[]; nextCursor: string | null };
type HockeyTechRosterPlayer = { id: string; name: string; jerseyNumber: string; position: string; imageUrl: string };
type SiteSettings = { bannerUrl: string | null; logoUrl: string | null; bannerPosition: { x: number; y: number } };
type UploadItem = { id: string; file: File; display: Blob | null; sha256: string; crc32: number; playerId: string; duplicate: boolean; duplicateChoice: '' | 'keep' | 'skip'; status: 'review' | 'publishing' | 'published' | 'skipped' | 'failed'; error?: string };

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.clone().json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch { /* A proxy or runtime limit can return HTML instead of API JSON. */ }
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]*>/g, ' ').replace(/&[^;\s]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const ray = response.headers.get('cf-ray');
    return `${fallback} (HTTP ${response.status})${title ? `: ${title.slice(0, 160)}` : ''}${ray ? ` [Cloudflare Ray ID ${ray}]` : ''}`;
  }
  return `${fallback} (HTTP ${response.status})`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await responseError(response, response.status === 404 ? 'This page could not be found.' : 'The page could not load. Please try again.'));
  return response.json() as Promise<T>;
}

function TeamMark({ logoUrl }: { logoUrl?: string | null }) {
  return logoUrl ? <img className="team-mark" src={logoUrl} alt="Miramichi Timberwolves logo" /> : null;
}

function HomePage() {
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [site, setSite] = useState<SiteSettings>({ bannerUrl: null, logoUrl: null, bannerPosition: { x: 0.5, y: 0.5 } });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getJson<RosterPlayer[]>('/api/players'), getJson<SiteSettings>('/api/site')])
      .then(([roster, settings]) => { setPlayers(roster); setSite(settings); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return players;
    return players.filter((player) => `${player.firstName} ${player.lastName} ${player.jerseyNumber ?? ''}`.toLocaleLowerCase().includes(term));
  }, [players, query]);

  return (
    <>
      <header className={`hero${site.bannerUrl ? ' hero--photo' : ''}`} style={site.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.76), rgba(0,0,0,.08)), url("${site.bannerUrl}")`, backgroundPosition: `${site.bannerPosition.x * 100}% ${site.bannerPosition.y * 100}%` } : undefined}>
        <div className="hero__top"><a className="wordmark" href="/" aria-label="Miramichi Timberwolves home"><TeamMark logoUrl={site.logoUrl} /><span>Timberwolves</span></a><a className="admin-link" href="/admin">Photographer login <span aria-hidden="true">↗</span></a></div>
        <div className="hero__content"><p className="eyebrow">Player photo gallery</p><h1 aria-label="Miramichi Timberwolves">Miramichi<br />Timberwolves</h1></div>
        <div className="hero__foot"><span>Find and download your photos</span><a href="#roster">View players <span aria-hidden="true">↓</span></a></div>
      </header>

      <main className="roster-section" id="roster">
        <div className="section-heading"><div><p className="eyebrow eyebrow--dark">Photo roster</p><h2>Players</h2></div><p className="section-note">Search by name or jersey number.</p></div>
        <label className="search-box"><span className="sr-only">Search player name or jersey number</span><span aria-hidden="true" className="search-box__icon">⌕</span><input aria-label="Search player name or jersey number" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or number" /><kbd>↵</kbd></label>
        {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
        <div className="roster-grid">
          {filtered.map((player) => <a className="player-card" href={`/player/${encodeURIComponent(player.id)}`} key={player.id}>
            <div className="player-card__image">{player.featuredImageUrl ? <img loading="lazy" src={player.featuredImageUrl} alt={`${player.firstName} ${player.lastName}`} style={{ objectPosition: `${(player.crop?.x ?? 0.5) * 100}% ${(player.crop?.y ?? 0.5) * 100}%`, transform: `scale(${player.crop?.zoom ?? 1})`, transformOrigin: `${(player.crop?.x ?? 0.5) * 100}% ${(player.crop?.y ?? 0.5) * 100}%` }} /> : <div className="player-card__placeholder"><span>{player.jerseyNumber ? `#${player.jerseyNumber}` : `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`}</span><small>No photos yet</small></div>}<span className="player-card__number">{player.jerseyNumber ? `#${player.jerseyNumber}` : 'PLAYER'}</span></div>
            <div className="player-card__details"><h3>{player.firstName} {player.lastName}</h3><span className="player-card__count">{player.photoCount} {player.photoCount === 1 ? 'photo' : 'photos'}</span></div>
          </a>)}
        </div>
        {!error && filtered.length === 0 ? <p className="empty-state">{players.length ? 'No players match that search.' : 'The roster will appear here soon.'}</p> : null}
        <footer className="site-footer"><TeamMark logoUrl={site.logoUrl} /><span>Miramichi Timberwolves</span><span className="site-footer__right">Player photo gallery</span></footer>
      </main>
    </>
  );
}

function PlayerPage({ playerId }: { playerId: string }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [viewerError, setViewerError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getJson<Player>(`/api/players/${encodeURIComponent(playerId)}`), getJson<GalleryPage>(`/api/players/${encodeURIComponent(playerId)}/photos`)]).then(([record, gallery]) => {
      if (!active) return;
      setPlayer(record); setPhotos(gallery.items); setCursor(gallery.nextCursor);
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [playerId]);

  useEffect(() => {
    let active = true;
    void getJson<SiteSettings>('/api/site').then((settings) => { if (active) setLogoUrl(settings.logoUrl); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'ArrowRight') setSelected((index) => index === null ? null : Math.min(index + 1, photos.length - 1));
      if (event.key === 'ArrowLeft') setSelected((index) => index === null ? null : Math.max(index - 1, 0));
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.classList.add('viewer-open');
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.classList.remove('viewer-open'); };
  }, [selected, photos.length]);

  async function loadMore(advanceViewer = false) {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true); setViewerError('');
    try {
      const page = await getJson<GalleryPage>(`/api/players/${encodeURIComponent(playerId)}/photos?cursor=${encodeURIComponent(cursor)}`);
      setPhotos((current) => [...current, ...page.items]); setCursor(page.nextCursor);
      if (advanceViewer && page.items.length) setSelected((current) => current === null ? null : photos.length);
    } catch (reason) {
      if (advanceViewer) setViewerError((reason as Error).message);
      else setError((reason as Error).message);
    } finally { loadingMoreRef.current = false; setLoadingMore(false); }
  }

  function showNextPhoto() {
    if (selected === null) return;
    if (selected < photos.length - 1) setSelected(selected + 1);
    else if (cursor) void loadMore(true);
  }

  function onViewerTouchEnd(event: TouchEvent<HTMLImageElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) showNextPhoto();
    else if (selected !== null && selected > 0) setSelected(selected - 1);
  }

  if (error) return <main className="page-error"><a className="back-link" href="/">← All players</a><p className="notice notice--error" role="alert">{error}</p></main>;
  if (!player) return <main className="page-loading" aria-label="Loading player"><span className="loader" /></main>;

  return <main className="player-page">
    <nav className="player-nav"><a className="back-link" href="/">← <span>All players</span></a><a className="wordmark wordmark--dark" href="/" aria-label="Miramichi Timberwolves home"><TeamMark logoUrl={logoUrl} /><span>Timberwolves</span></a><a className="admin-link admin-link--dark" href="/admin">Admin <span aria-hidden="true">↗</span></a></nav>
    <header className="player-heading"><p className="eyebrow eyebrow--dark">Player gallery</p><h1>{player.firstName} {player.lastName}<span>{player.jerseyNumber ? `#${player.jerseyNumber}` : ''}</span></h1><p>{photos.length ? `${photos.length}${cursor ? '+' : ''} photos` : 'No photos available yet'}</p></header>
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    {photos.length ? <>
      <div className="gallery-grid">{photos.map((photo, index) => <button className="gallery-tile" key={photo.id} onClick={() => { setViewerError(''); setSelected(index); }} aria-label={`View photo ${index + 1}: ${photo.filename}`}><img src={photo.displayUrl} alt={`${player.firstName} ${player.lastName}, photo ${index + 1}`} loading={index < 6 ? 'eager' : 'lazy'} /><span className="gallery-tile__download" aria-hidden="true">↗</span></button>)}</div>
      <div className="gallery-actions">{cursor ? <button className="button button--outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more photos'}</button> : null}<a className="button button--dark" href={`/api/players/${encodeURIComponent(playerId)}/download.zip`} aria-disabled={!photos.length}>Download all photos <span aria-hidden="true">↓</span></a></div>
    </> : <div className="gallery-empty"><h2>No photos available yet</h2><p>Check back for photos of {player.firstName}.</p><a className="button button--outline" href="/">Back to the roster</a></div>}
    <footer className="site-footer site-footer--player"><TeamMark logoUrl={logoUrl} /><span>Miramichi Timberwolves</span><span className="site-footer__right">Download original photos from the viewer.</span></footer>
    {selected !== null && photos[selected] ? <div className="viewer" role="dialog" aria-modal="true" aria-label={`Photo ${selected + 1} of ${photos.length}`} onClick={() => setSelected(null)}><button className="viewer__close" onClick={() => setSelected(null)} aria-label="Close photo viewer">×</button><button className="viewer__arrow viewer__arrow--prev" aria-label="Previous photo" disabled={selected === 0} onClick={(event) => { event.stopPropagation(); setSelected(selected - 1); }}>←</button><img src={photos[selected].displayUrl} alt={`${player.firstName} ${player.lastName}, ${photos[selected].filename}`} onClick={(event) => event.stopPropagation()} onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }; }} onTouchEnd={onViewerTouchEnd} /><button className="viewer__arrow viewer__arrow--next" aria-label="Next photo" disabled={loadingMore || (selected === photos.length - 1 && !cursor)} onClick={(event) => { event.stopPropagation(); showNextPhoto(); }}>→</button>{viewerError ? <p className="viewer__error" role="alert" onClick={(event) => event.stopPropagation()}>{viewerError}</p> : null}<div className="viewer__bottom" onClick={(event) => event.stopPropagation()}><span>{String(selected + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span><a href={photos[selected].originalDownloadUrl} download>Download original ↓</a></div></div> : null}
  </main>;
}

async function createDisplayJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the display image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('This browser could not prepare the display image.')), 'image/jpeg', 0.84));
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

function PhotoManager({ players }: { players: Player[] }) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function updateItem(id: string, updates: Partial<UploadItem>) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item));
  }

  async function stageFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true); setMessage('Preparing originals and display images…');
    const existingHashes = new Set(queue.map((item) => item.sha256));
    const batchHashes = new Set<string>();
    const additions: UploadItem[] = [];
    for (const file of Array.from(fileList)) {
      const id = crypto.randomUUID();
      if (!/\.jpe?g$/i.test(file.name) || (file.type && file.type !== 'image/jpeg')) {
        additions.push({ id, file, display: null, sha256: '', crc32: 0, playerId: '', duplicate: false, duplicateChoice: '', status: 'failed', error: 'Only JPEG files can be uploaded.' });
        continue;
      }
      try {
        const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
        if (signature.length < 3 || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) throw new Error('File content is not a JPEG image.');
        const { sha256, crc32 } = await photoChecksums(await file.arrayBuffer());
        const match = matchPhotoFilename(file.name, players.map((player) => ({ id: player.id, firstName: player.firstName, lastName: player.lastName, jerseyNumber: player.jerseyNumber })));
        const assignment = match.status === 'matched' ? match.playerId : '';
        const response = await fetch('/api/admin/photos/duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha256 }) });
        if (!response.ok) throw new Error(await responseError(response, 'Could not check for duplicate photos.'));
        const found = (await response.json() as { duplicates: unknown[] }).duplicates.length > 0;
        const duplicate = found || batchHashes.has(sha256) || existingHashes.has(sha256);
        batchHashes.add(sha256);
        additions.push({ id, file, display: null, sha256, crc32, playerId: assignment, duplicate, duplicateChoice: '', status: 'review' });
      } catch (reason) {
        additions.push({ id, file, display: null, sha256: '', crc32: 0, playerId: '', duplicate: false, duplicateChoice: '', status: 'failed', error: (reason as Error).message });
      }
    }
    setQueue((current) => [...current, ...additions]); setMessage(`${additions.length} file${additions.length === 1 ? '' : 's'} ready for review.`); setBusy(false);
  }

  async function publishQueue() {
    setBusy(true); setMessage('Publishing selected photos…');
    const items = [...queue];
    for (const item of items) {
      if (item.status !== 'review') continue;
      if (item.duplicate && !item.duplicateChoice) { updateItem(item.id, { error: 'Choose Keep or Skip for this duplicate.' }); continue; }
      if (item.duplicate && item.duplicateChoice === 'skip') { updateItem(item.id, { status: 'skipped' }); continue; }
      if (!item.playerId) { updateItem(item.id, { error: 'Choose a player before publishing.' }); continue; }
      updateItem(item.id, { status: 'publishing', error: undefined });
      const uploadId = crypto.randomUUID();
      try {
        const display = await createDisplayJpeg(item.file);
        const displayChecksums = await photoChecksums(await display.arrayBuffer());
        for (const kind of ['original', 'display'] as const) {
          const body = kind === 'original' ? item.file : display;
          const checksums = kind === 'original' ? { sha256: item.sha256, crc32: item.crc32 } : displayChecksums;
          const headers = { 'Content-Type': 'image/jpeg', 'X-Photo-SHA256': checksums.sha256, 'X-Photo-CRC32': formatCrc32(checksums.crc32) };
          const response = await fetch(`/api/admin/uploads/${uploadId}/${kind}`, { method: 'PUT', headers, body });
          if (!response.ok) throw new Error(await responseError(response, `${kind === 'original' ? 'Original photo' : 'Display copy'} upload failed.`));
        }
        const response = await fetch('/api/admin/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId, playerId: item.playerId, filename: item.file.name, sha256: item.sha256, keepDuplicate: item.duplicateChoice === 'keep' }) });
        if (!response.ok) throw new Error(await responseError(response, 'Publication failed.'));
        updateItem(item.id, { status: 'published' });
      } catch (reason) {
        await fetch(`/api/admin/uploads/${uploadId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
        updateItem(item.id, { status: 'failed', error: (reason as Error).message });
      }
    }
    setMessage('Review complete. Published photos appear in the public gallery immediately.'); setBusy(false);
  }

  const pending = queue.some((item) => item.status === 'review');
  return <>
    <div className="upload-drop"><label><span className="upload-drop__symbol">＋</span><strong>Add JPEG photos</strong><span>Select one or more images. Original files are kept unchanged.</span><input type="file" accept="image/jpeg,.jpg,.jpeg" multiple disabled={busy} onChange={(event) => { void stageFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /></label></div>
    {message ? <p className="upload-message" role="status">{message}</p> : null}
    {queue.length ? <>
      <div className="upload-review-heading"><strong>Review uploads <span>{queue.length}</span></strong><button className="text-button" onClick={() => setQueue([])} disabled={busy}>Clear list</button></div>
      <div className="upload-queue">{queue.map((item) => <div className={`upload-item upload-item--${item.status}`} key={item.id}>
        <div className="upload-item__filename"><span className="upload-item__state" aria-hidden="true">{item.status === 'published' ? '✓' : item.status === 'skipped' ? '–' : item.status === 'failed' ? '!' : '·'}</span><strong title={item.file.name}>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB</small></div>
        <label className="upload-item__player"><span className="sr-only">Assign {item.file.name} to a player</span><select value={item.playerId} disabled={item.status !== 'review' || busy} onChange={(event) => updateItem(item.id, { playerId: event.target.value, error: undefined })}><option value="">Select player…</option>{players.map((player) => <option value={player.id} key={player.id}>#{player.jerseyNumber ?? '—'} · {player.firstName} {player.lastName}</option>)}</select></label>
        {item.duplicate && item.status === 'review' ? <label className="duplicate-choice"><span>Duplicate found</span><select aria-label={`Choose Keep or Skip for ${item.file.name}`} value={item.duplicateChoice} onChange={(event) => updateItem(item.id, { duplicateChoice: event.target.value as UploadItem['duplicateChoice'], error: undefined })}><option value="">Choose…</option><option value="keep">Keep as separate photo</option><option value="skip">Skip this photo</option></select></label> : null}
        <span className="upload-item__result">{item.status === 'review' ? item.error ?? 'Needs review' : item.status === 'publishing' ? 'Publishing…' : item.status === 'published' ? 'Published' : item.status === 'skipped' ? 'Skipped' : item.error}</span>
        {item.status === 'review' ? <button className="text-button" onClick={() => setQueue((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label={`Remove ${item.file.name} from upload list`}>Remove</button> : item.status === 'failed' ? <button className="text-button" onClick={() => updateItem(item.id, { status: 'review', error: undefined })}>Review again</button> : null}
      </div>)}</div>
      {pending ? <button className="button button--dark upload-publish" onClick={publishQueue} disabled={busy}>{busy ? 'Working…' : 'Publish reviewed photos'} <span aria-hidden="true">→</span></button> : null}
    </> : null}
  </>;
}

function ExistingPhotoManager({ players }: { players: Player[] }) {
  const [playerId, setPlayerId] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const player = players.find((entry) => entry.id === playerId);

  async function refresh(id = playerId) {
    if (!id) return;
    setBusy(true);
    try {
      const page = await getJson<GalleryPage>(`/api/players/${encodeURIComponent(id)}/photos?limit=60`);
      setPhotos(page.items); setCursor(page.nextCursor);
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => { setPhotos([]); setCursor(null); if (playerId) void refresh(playerId); }, [playerId]);

  async function loadMore() {
    if (!player || !cursor) return;
    setBusy(true);
    try {
      const page = await getJson<GalleryPage>(`/api/players/${encodeURIComponent(player.id)}/photos?limit=60&cursor=${encodeURIComponent(cursor)}`);
      setPhotos((current) => [...current, ...page.items]); setCursor(page.nextCursor);
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function reassign(photo: Photo) {
    const playerId = destinations[photo.id];
    if (!playerId || playerId === player?.id) return;
    const response = await fetch(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId }) });
    if (!response.ok) { setMessage((await response.json() as { error?: string }).error ?? 'Could not reassign photo.'); return; }
    setMessage(`${photo.filename} reassigned.`); await refresh();
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Permanently delete ${photo.filename}? This cannot be undone.`)) return;
    const response = await fetch(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    if (!response.ok) { setMessage((await response.json() as { error?: string }).error ?? 'Could not delete photo.'); return; }
    setMessage('Photo permanently deleted.'); await refresh();
  }

  return <div className="existing-photos"><label>Browse player gallery<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Select a player…</option>{players.map((entry) => <option value={entry.id} key={entry.id}>{entry.firstName} {entry.lastName}</option>)}</select></label>
    {player ? photos.length ? <div className="existing-photo-list">{photos.map((photo) => <article className="existing-photo" key={photo.id}><img src={photo.displayUrl} alt="" loading="lazy" /><div className="existing-photo__detail"><strong>{photo.filename}</strong><small>{new Date(photo.uploadedAt).toLocaleDateString()}</small><label><span className="sr-only">Reassign {photo.filename}</span><select value={destinations[photo.id] ?? ''} onChange={(event) => setDestinations((current) => ({ ...current, [photo.id]: event.target.value }))}><option value="">Reassign to…</option>{players.filter((entry) => entry.id !== player.id).map((entry) => <option value={entry.id} key={entry.id}>{entry.firstName} {entry.lastName}</option>)}</select></label></div><div className="existing-photo__actions"><button className="text-button" onClick={() => void reassign(photo)}>Reassign</button><button className="text-button" onClick={() => void deletePhoto(photo)}>Delete</button></div></article>)}</div> : <p className="empty-state">{busy ? 'Loading photos…' : 'No active photos in this gallery.'}</p> : null}
    {cursor ? <button className="button button--outline" onClick={() => void loadMore()} disabled={busy}>Load more photos</button> : null}
    {message ? <p className="upload-message" role="status">{message}</p> : null}
  </div>;
}

function AppearanceManager() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const next = await getJson<SiteSettings>('/api/site');
    setSettings(next); setPosition(next.bannerPosition);
  }
  useEffect(() => { void refresh().catch((reason: Error) => setMessage(reason.message)); }, []);

  async function upload(kind: 'banner' | 'logo', file?: File) {
    if (!file) return;
    setBusy(true); setMessage(`Uploading ${kind}…`);
    try {
      const response = await fetch(`/api/admin/site/${kind}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Upload failed.');
      await refresh(); setMessage(`${kind === 'banner' ? 'Banner' : 'Logo'} saved.`);
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function savePosition() {
    setBusy(true); setMessage('Saving position…');
    try {
      const response = await fetch('/api/admin/site/position', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(position) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Could not save position.');
      setMessage('Banner position saved.');
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="appearance-grid">
      <label className="appearance-upload"><span className="eyebrow eyebrow--dark">Team banner</span>{settings?.bannerUrl ? <img src={settings.bannerUrl} alt="Current team banner" /> : <span className="appearance-placeholder">Banner image not set</span>}<span className="button button--outline">{busy ? 'Working…' : 'Replace banner'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload('banner', event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>
      <label className="appearance-upload appearance-upload--logo"><span className="eyebrow eyebrow--dark">Team logo</span>{settings?.logoUrl ? <img src={settings.logoUrl} alt="Current team logo" /> : <span className="appearance-placeholder">Logo image not set</span>}<span className="button button--outline">{busy ? 'Working…' : 'Replace logo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload('logo', event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>
    </div>
    <div className="banner-position"><p className="eyebrow eyebrow--dark">Banner crop position</p><label>Horizontal <input type="range" min="0" max="1" step="0.01" value={position.x} onChange={(event) => setPosition((current) => ({ ...current, x: Number(event.target.value) }))} /></label><label>Vertical <input type="range" min="0" max="1" step="0.01" value={position.y} onChange={(event) => setPosition((current) => ({ ...current, y: Number(event.target.value) }))} /></label><button className="button button--dark" onClick={savePosition} disabled={busy}>Save position</button></div>
    {message ? <p className="upload-message" role="status">{message}</p> : null}
  </>;
}

function FeaturedPhotoManager({ players, onSaved }: { players: Player[]; onSaved: () => void }) {
  const [playerId, setPlayerId] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState('');
  const [crop, setCrop] = useState({ x: 0.5, y: 0.5, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const player = players.find((entry) => entry.id === playerId);

  useEffect(() => {
    if (!player) { setPhotos([]); setPhotoId(''); return; }
    setBusy(true); setMessage(''); setCrop(player.crop ?? { x: 0.5, y: 0.5, zoom: 1 });
    getJson<GalleryPage>(`/api/players/${encodeURIComponent(player.id)}/photos?limit=60`).then((page) => {
      setPhotos(page.items); setCursor(page.nextCursor); setPhotoId(player.featuredPhotoId && page.items.some((photo) => photo.id === player.featuredPhotoId) ? player.featuredPhotoId : page.items[0]?.id ?? '');
    }).catch((reason: Error) => setMessage(reason.message)).finally(() => setBusy(false));
  }, [playerId, player?.featuredPhotoId]);

  async function loadMore() {
    if (!player || !cursor) return;
    const page = await getJson<GalleryPage>(`/api/players/${encodeURIComponent(player.id)}/photos?limit=60&cursor=${encodeURIComponent(cursor)}`);
    setPhotos((current) => [...current, ...page.items]); setCursor(page.nextCursor);
  }

  async function save() {
    if (!player || !photoId) return;
    setBusy(true); setMessage('Saving roster portrait…');
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(player.id)}/featured`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, ...crop }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Could not save portrait.');
      onSaved(); setMessage('Roster portrait saved.');
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  const selectedPhoto = photos.find((photo) => photo.id === photoId);
  return <div className="featured-manager"><div className="featured-manager__top"><label>Choose player<select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Select a player…</option>{players.map((entry) => <option value={entry.id} key={entry.id}>{entry.firstName} {entry.lastName}</option>)}</select></label>{player ? <span>{player.jerseyNumber ? `#${player.jerseyNumber}` : 'Roster photo'}</span> : null}</div>
    {player ? photos.length ? <><div className="featured-picks">{photos.map((photo) => <button type="button" key={photo.id} className={photo.id === photoId ? 'featured-pick featured-pick--selected' : 'featured-pick'} aria-pressed={photo.id === photoId} onClick={() => setPhotoId(photo.id)}><img src={photo.displayUrl} alt={`Select ${photo.filename} as featured photo`} /></button>)}</div>
      {cursor ? <button className="text-button" onClick={() => void loadMore()}>Load more gallery photos</button> : null}
      {selectedPhoto ? <div className="featured-crop"><div className="featured-preview"><img src={selectedPhoto.displayUrl} alt="Roster portrait preview" style={{ objectPosition: `${crop.x * 100}% ${crop.y * 100}%`, transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x * 100}% ${crop.y * 100}%` }} /></div><div className="featured-crop__controls"><label>Horizontal position <input type="range" min="0" max="1" step="0.01" value={crop.x} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) }))} /></label><label>Vertical position <input type="range" min="0" max="1" step="0.01" value={crop.y} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) }))} /></label><label>Zoom <input type="range" min="1" max="4" step="0.05" value={crop.zoom} onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} /></label><button className="button button--dark" disabled={busy} onClick={save}>Save roster portrait</button></div></div> : null}
    </> : <p className="empty-state">This player has no gallery photos to use yet.</p> : <p className="empty-state">Select a player to choose their roster image and crop.</p>}
    {message ? <p className="upload-message" role="status">{message}</p> : null}
  </div>;
}

function RosterCsvImport({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<RosterCsvPlayer[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function selectFile(file?: File) {
    if (!file) return;
    setMessage('');
    try {
      const parsed = parseRosterCsv(await file.text());
      setRows(parsed.players); setErrors(parsed.errors);
      if (parsed.players.length > 500) { setRows([]); setErrors(['This import contains more than 500 rows. Split it into smaller CSV files.']); }
    } catch { setRows([]); setErrors(['Could not read this CSV file.']); }
  }

  async function importRows() {
    setBusy(true); setMessage('Importing roster…');
    try {
      const response = await fetch('/api/admin/players/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players: rows }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Roster import failed.');
      setMessage(`${rows.length} players added.`); setRows([]); setErrors([]); onImported();
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="roster-import"><div><strong>Import roster CSV</strong><p>Uses columns <code>jersey_number,first_name,last_name</code>. This adds rows to the current roster.</p></div><label className="button button--outline">Choose CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { void selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>
    {errors.length ? <ul className="roster-import__errors" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    {rows.length ? <><p className="upload-message">Reviewing {rows.length} rows before import</p><div className="roster-import__preview">{rows.slice(0, 8).map((row, index) => <span key={`${row.firstName}-${row.lastName}-${index}`}>{row.jerseyNumber ? `#${row.jerseyNumber}` : '—'} · {row.firstName} {row.lastName}</span>)}{rows.length > 8 ? <span>…and {rows.length - 8} more</span> : null}</div><button className="button button--dark" disabled={busy} onClick={importRows}>{busy ? 'Importing…' : `Add ${rows.length} players`} <span aria-hidden="true">→</span></button></> : null}
    {message ? <p className="upload-message" role="status">{message}</p> : null}
  </div>;
}

function HockeyTechRosterPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const [players, setPlayers] = useState<HockeyTechRosterPlayer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function loadRoster() {
    setLoading(true); setError('');
    try {
      const roster = await getJson<{ players: HockeyTechRosterPlayer[] }>('/api/admin/hockeytech/roster');
      setPlayers(roster.players);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }

  const query = search.trim().toLowerCase();
  const matches = players?.filter((player) => `${player.name} ${player.jerseyNumber} ${player.position}`.toLowerCase().includes(query));
  return <div className="hockeytech-picker">
    <button type="button" className="button button--outline" disabled={loading} onClick={loadRoster}>{loading ? 'Loading roster…' : 'Find from current roster'}</button>
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    {players ? <>
      <label>Search current roster<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="hockeytech-picker__results">{matches?.map((player) => <button type="button" key={player.id} className="hockeytech-picker__player" aria-label={`Select ${player.name}`} onClick={() => onSelect(player.id)}>
        <img src={player.imageUrl} alt={`${player.name} headshot`} loading="lazy" />
        <span><strong>{player.name}</strong><small>#{player.jerseyNumber || '—'} · {player.position || '—'}</small></span>
      </button>)}</div>
      {!matches?.length ? <p role="status">No current roster players match.</p> : null}
    </> : null}
  </div>;
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ firstName: '', lastName: '', jerseyNumber: '', hockeyTechPlayerId: '' });
  const [busy, setBusy] = useState(false);

  async function checkSession() {
    const response = await fetch('/api/admin/session');
    setAuthenticated(response.ok);
    if (response.ok) setPlayers(await getJson<Player[]>('/api/players'));
  }
  useEffect(() => { void checkSession(); }, []);
  useEffect(() => {
    let active = true;
    void getJson<SiteSettings>('/api/site').then((settings) => { if (active) setLogoUrl(settings.logoUrl); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Unable to sign in.');
      setPassword(''); await checkSession();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function addRosterPlayer(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, lastName, jerseyNumber: jerseyNumber || null }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Unable to add player.');
      setFirstName(''); setLastName(''); setJerseyNumber(''); setPlayers(await getJson<Player[]>('/api/players'));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function removeRosterPlayer(player: Player) {
    if (!window.confirm(`Remove ${player.firstName} ${player.lastName}? Players with photos must have those photos reassigned or deleted first.`)) return;
    const response = await fetch(`/api/admin/players/${encodeURIComponent(player.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (response.ok) setPlayers(await getJson<Player[]>('/api/players'));
    else setError((await response.json() as { error?: string }).error ?? 'Unable to remove player.');
  }

  function beginEdit(player: Player) {
    setEditingId(player.id);
    setEditFields({ firstName: player.firstName, lastName: player.lastName, jerseyNumber: player.jerseyNumber ?? '', hockeyTechPlayerId: player.hockeyTechPlayerId ?? '' });
  }

  async function savePlayerEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(editingId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editFields, hockeyTechPlayerId: editFields.hockeyTechPlayerId.trim() || null }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Unable to update player.');
      setPlayers(await getJson<Player[]>('/api/players')); setEditingId(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setAuthenticated(false);
  }

  return <main className="admin-page"><a className="back-link" href="/">← Public gallery</a><div className="admin-brand"><TeamMark logoUrl={logoUrl} /><span>Miramichi Timberwolves</span></div>
    {authenticated === null ? <p>Checking session…</p> : !authenticated ? <section className="login-panel"><p className="eyebrow eyebrow--dark">Administration</p><h1>Photographer login</h1><p>Sign in to manage the team gallery.</p><form onSubmit={submitLogin}><label>Administrator password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="notice notice--error" role="alert">{error}</p> : null}<button className="button button--dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span></button></form></section> : <>
      <header className="admin-header"><div><p className="eyebrow eyebrow--dark">Administration</p><h1>Photographer admin</h1></div><button className="button button--outline" onClick={logout}>Sign out</button></header>
      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      <section className="admin-section"><div className="admin-section__heading"><div><p className="eyebrow eyebrow--dark">01 / Roster</p><h2>Manage players</h2></div><span>{players.length} players</span></div>
        <form className="player-form" onSubmit={addRosterPlayer}><label>First name<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label><label>Number<input inputMode="numeric" maxLength={3} value={jerseyNumber} onChange={(event) => setJerseyNumber(event.target.value)} /></label><button className="button button--dark" disabled={busy}>Add player +</button></form>
        <RosterCsvImport onImported={() => { void getJson<Player[]>('/api/players').then(setPlayers); }} />
        <div className="admin-roster">{players.map((player) => <div className="admin-roster__group" key={player.id}><div className="admin-roster__row"><span className="admin-roster__number">{player.jerseyNumber ? `#${player.jerseyNumber}` : '—'}</span><strong>{player.firstName} {player.lastName}</strong><button onClick={() => beginEdit(player)} aria-label={`Edit ${player.firstName} ${player.lastName}`}>Edit</button><button onClick={() => removeRosterPlayer(player)} aria-label={`Remove ${player.firstName} ${player.lastName}`}>Remove</button></div>{editingId === player.id ? <form className="player-edit-form" onSubmit={savePlayerEdit}>
          <label>First name<input required value={editFields.firstName} onChange={(event) => setEditFields((current) => ({ ...current, firstName: event.target.value }))} /></label>
          <label>Last name<input required value={editFields.lastName} onChange={(event) => setEditFields((current) => ({ ...current, lastName: event.target.value }))} /></label>
          <label>Number<input inputMode="numeric" value={editFields.jerseyNumber} onChange={(event) => setEditFields((current) => ({ ...current, jerseyNumber: event.target.value }))} /></label>
          <fieldset className="hockeytech-player"><legend>HockeyTech Player</legend>
            <label>HockeyTech player ID<input inputMode="numeric" pattern="[0-9]*" maxLength={20} value={editFields.hockeyTechPlayerId} onChange={(event) => setEditFields((current) => ({ ...current, hockeyTechPlayerId: event.target.value }))} /></label>
            <p>Enter an ID manually or choose a player from the current roster.</p>
            <button type="button" className="button button--outline" onClick={() => setEditFields((current) => ({ ...current, hockeyTechPlayerId: '' }))}>Clear link</button>
            <HockeyTechRosterPicker key={player.id} onSelect={(id) => setEditFields((current) => ({ ...current, hockeyTechPlayerId: id }))} />
          </fieldset>
          <button className="button button--dark" disabled={busy}>Save changes</button><button type="button" className="button button--outline" onClick={() => setEditingId(null)}>Cancel</button>
        </form> : null}</div>)}</div>
        <div className="featured-section"><p className="eyebrow eyebrow--dark">Roster image</p><h3>Choose a featured photo</h3><FeaturedPhotoManager players={players} onSaved={() => { void getJson<Player[]>('/api/players').then(setPlayers); }} /></div>
      </section>
      <section className="admin-section"><div className="admin-section__heading"><div><p className="eyebrow eyebrow--dark">02 / Photos</p><h2>Manage photographs</h2></div></div><PhotoManager players={players} /><p>Original JPEGs stay untouched. Gallery images are prepared in this browser before upload.</p></section>
      <section className="admin-section"><div className="admin-section__heading"><div><p className="eyebrow eyebrow--dark">Photo library</p><h2>Existing photos</h2></div></div><ExistingPhotoManager players={players} /></section>
      <section className="admin-section"><div className="admin-section__heading"><div><p className="eyebrow eyebrow--dark">03 / Appearance</p><h2>Website artwork</h2></div></div><AppearanceManager /></section>
    </>}
  </main>;
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/admin' || path === '/admin/') return <AdminPage />;
  const playerRoute = /^\/player\/([^/]+)\/?$/.exec(path);
  if (playerRoute) return <PlayerPage playerId={decodeURIComponent(playerRoute[1])} />;
  return <HomePage />;
}
