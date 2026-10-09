import { Manifest, PlaylistFile } from './types';

/**
 * Resolves static data path relative to Vite's configured base URL.
 */
export function getStaticDataUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Sorts playlists with compendium and pantheon pinned at the top,
 * followed by remaining playlists in alphabetical order.
 */
export function sortPlaylists<T extends { name: string }>(playlists: T[]): T[] {
  return [...playlists].sort((a, b) => {
    const aName = a.name.toLowerCase().trim();
    const bName = b.name.toLowerCase().trim();
    if (aName === 'compendium' && bName !== 'compendium') return -1;
    if (bName === 'compendium' && aName !== 'compendium') return 1;
    if (aName === 'pantheon' && bName !== 'pantheon') return -1;
    if (bName === 'pantheon' && aName !== 'pantheon') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Loads the static manifest containing available playlists.
 */
export async function loadManifest(): Promise<Manifest> {
  const url = getStaticDataUrl('data/manifest.json');
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to load game manifest (${res.status} ${res.statusText}) from ${url}`);
  }

  const data = (await res.json()) as Manifest;
  if (!data || !Array.isArray(data.playlists)) {
    throw new Error('Invalid manifest JSON structure');
  }

  return {
    ...data,
    playlists: sortPlaylists(data.playlists),
  };
}

/**
 * Loads a specific playlist file.
 */
export async function loadPlaylist(playlistFileRelativePath: string): Promise<PlaylistFile> {
  const url = getStaticDataUrl(`data/${playlistFileRelativePath}`);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to load playlist (${res.status} ${res.statusText}) from ${url}`);
  }

  const data = (await res.json()) as PlaylistFile;
  if (!data || !Array.isArray(data.songs)) {
    throw new Error('Invalid playlist JSON structure');
  }

  return data;
}
