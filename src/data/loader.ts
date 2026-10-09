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

  return data;
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
