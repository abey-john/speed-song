import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadManifest, loadPlaylist, getStaticDataUrl, sortPlaylists } from './loader';

describe('src/data/loader', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('constructs correct static data URL using base', () => {
    expect(getStaticDataUrl('data/manifest.json')).toContain('data/manifest.json');
  });

  it('loads and validates manifest', async () => {
    const mockManifest = {
      generatedAt: '2026-10-08T00:00:00Z',
      playlists: [{ id: 'p1', name: 'Playlist 1', songCount: 10, file: 'playlists/p1.json' }],
    };

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockManifest), { status: 200 }));

    const manifest = await loadManifest();
    expect(manifest.playlists).toHaveLength(1);
    expect(manifest.playlists[0]?.name).toBe('Playlist 1');
  });

  it('loads and validates playlist file', async () => {
    const mockPlaylist = {
      id: 'p1',
      name: 'Playlist 1',
      generatedAt: '2026-10-08T00:00:00Z',
      songs: [
        {
          id: 's1',
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          previewUrl: 'https://example.com/audio.m4a',
          artworkUrl: 'https://example.com/art.jpg',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockPlaylist), { status: 200 }));

    const playlist = await loadPlaylist('playlists/p1.json');
    expect(playlist.songs).toHaveLength(1);
    expect(playlist.songs[0]?.title).toBe('Song');
    expect(playlist.songs[0]?.previewUrl).toBe('https://example.com/audio.m4a');
  });

  it('resolves relative previewUrl using base path', async () => {
    const mockPlaylist = {
      id: 'p1',
      name: 'Playlist 1',
      generatedAt: '2026-10-08T00:00:00Z',
      songs: [
        {
          id: 's2',
          title: 'Song 2',
          artist: 'Artist',
          album: 'Album',
          previewUrl: 'audio/s2.m4a',
          artworkUrl: 'https://example.com/art.jpg',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockPlaylist), { status: 200 }));

    const playlist = await loadPlaylist('playlists/p1.json');
    expect(playlist.songs[0]?.previewUrl).toContain('audio/s2.m4a');
  });

  it('throws helpful error on HTTP failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
    await expect(loadManifest()).rejects.toThrow(/Failed to load game manifest/);
  });

  it('pins compendium and pantheon at the top of playlists', () => {
    const list = [
      { name: '🦀' },
      { name: 'Pantheon' },
      { name: '2023 highlights' },
      { name: 'compendium' },
      { name: 'belt' },
    ];

    const sorted = sortPlaylists(list);
    expect(sorted.map((p) => p.name)).toEqual([
      'compendium',
      'Pantheon',
      '🦀',
      '2023 highlights',
      'belt',
    ]);
  });
});
