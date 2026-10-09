import { PipelinePlaylist, PipelineTrack } from './types';

interface SpotifyTokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: SpotifyTokenCache | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exchanges the refresh token for a fresh access token.
 */
export async function getSpotifyAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Spotify credentials in environment (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or SPOTIFY_REFRESH_TOKEN).'
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh Spotify access token (${response.status}): ${errorBody}`);
  }

  interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
  }

  const data = (await response.json()) as TokenResponse;
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Fetch wrapper with 429 rate limit retry.
 */
async function spotifyFetch<T>(endpointUrl: string, retryCount = 0): Promise<T> {
  const token = await getSpotifyAccessToken();
  const res = await fetch(endpointUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 429) {
    const retryAfterSec = parseInt(res.headers.get('Retry-After') || '2', 10);
    const waitMs = (retryAfterSec + 0.5) * 1000;
    console.warn(`[spotify] 429 Rate limited. Waiting ${waitMs}ms before retrying...`);
    await sleep(waitMs);
    if (retryCount < 3) {
      return spotifyFetch<T>(endpointUrl, retryCount + 1);
    }
    throw new Error('Spotify API rate limit exceeded after maximum retries.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Spotify API error at ${endpointUrl} (${res.status}): ${errText}`);
  }

  return (await res.json()) as T;
}

interface CurrentUserResponse {
  id: string;
  display_name: string;
}

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  return spotifyFetch<CurrentUserResponse>('https://api.spotify.com/v1/me');
}

interface Paginated<T> {
  items: T[];
  next: string | null;
  total: number;
}

interface RawPlaylistObject {
  id: string;
  name: string;
  owner: { id: string };
  tracks?: { total: number };
  items?: { total: number };
  public?: boolean;
}

/**
 * Fetches all playlists for the authenticated user, optionally filtering to owned-only.
 */
export async function fetchUserPlaylists(options?: { includeFollowed?: boolean }): Promise<PipelinePlaylist[]> {
  const user = await getCurrentUser();
  const includeFollowed = options?.includeFollowed ?? process.env.INCLUDE_FOLLOWED === 'true';

  const playlists: PipelinePlaylist[] = [];
  let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (nextUrl) {
    const page: Paginated<RawPlaylistObject> = await spotifyFetch<Paginated<RawPlaylistObject>>(nextUrl);

    for (const item of page.items) {
      if (!item || !item.id) continue;
      const isOwner = item.owner.id === user.id;

      if (includeFollowed || isOwner) {
        const totalTracks = item.items?.total ?? item.tracks?.total ?? 0;
        playlists.push({
          id: item.id,
          name: item.name,
          ownerId: item.owner.id,
          totalTracks,
        });
      }
    }

    nextUrl = page.next;
  }

  return playlists;
}

interface RawTrackData {
  id: string | null;
  name: string | null;
  type?: string;
  is_local?: boolean;
  artists?: { name: string }[];
  album?: {
    name: string;
    images?: { url: string; width?: number; height?: number }[];
  };
}

interface RawPlaylistTrackItem {
  track?: RawTrackData | null;
  item?: RawTrackData | null;
}

/**
 * Fetches all tracks for a given playlist, filtering out invalid, local, or non-track items.
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<PipelineTrack[]> {
  const tracks: PipelineTrack[] = [];
  // Use /items endpoint (replaced /tracks in recent Spotify API updates)
  let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;

  while (nextUrl) {
    const page: Paginated<RawPlaylistTrackItem> = await spotifyFetch<Paginated<RawPlaylistTrackItem>>(nextUrl);

    for (const item of page.items) {
      const track = item?.item || item?.track;
      if (!track || !track.id || !track.name) continue;
      if (track.is_local) continue;
      if (track.type && track.type !== 'track') continue;

      const artistNames = (track.artists || [])
        .map((a) => a.name)
        .filter(Boolean)
        .join(', ');

      const albumName = track.album?.name || '';
      const artwork = (track.album?.images || [])[0]?.url || '';

      tracks.push({
        id: track.id,
        title: track.name,
        artist: artistNames || 'Unknown Artist',
        album: albumName,
        spotifyArtworkUrl: artwork,
      });
    }

    nextUrl = page.next;
  }

  return tracks;
}
