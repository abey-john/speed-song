import { normalize, getBaseTitle, artistsMatch } from './normalize';
import { ResolutionResult } from './types';

interface AppleArtworkDictionary {
  url?: string;
}

interface AppleArtworkObject {
  dictionary?: AppleArtworkDictionary;
  url?: string;
}

interface AppleTrackItem {
  id?: string;
  title?: string;
  artistName?: string;
  previewUrl?: string;
  artwork?: AppleArtworkObject;
}

interface AppleSection {
  itemKind?: string;
  items?: AppleTrackItem[];
  artwork?: AppleArtworkObject;
}

interface AppleSerializedData {
  data?: {
    data?: {
      sections?: AppleSection[];
    };
  }[];
}

interface ItunesTrackItem {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesTrackItem[];
}

export interface ResolverOptions {
  throttleMs?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAppleArtworkUrl(artworkObj: AppleArtworkObject | undefined): string | null {
  const template = artworkObj?.dictionary?.url || artworkObj?.url;
  if (!template) return null;
  return template.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg');
}

/**
 * Strategy 1: Apple Music Web
 * Scrapes studio cut preview and album art from Apple Music web page.
 */
export async function tryAppleMusicWeb(
  title: string,
  artist: string,
  album: string,
  spotifyArtworkUrl: string
): Promise<ResolutionResult | null> {
  try {
    const searchTarget = album ? `${album} ${artist}` : `${title} ${artist}`;
    const searchUrl = `https://music.apple.com/us/search?term=${encodeURIComponent(searchTarget)}`;

    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const albumLinks = [...html.matchAll(/\/us\/album\/([a-z0-9-]+)\/(\d+)/g)].map((m) => ({
      slug: m[1] || '',
      path: m[0],
    }));

    if (albumLinks.length === 0) return null;

    const cleanAlbum = normalize(album || title);
    const candidate =
      albumLinks.find((a) => {
        const normSlug = normalize(a.slug);
        return normSlug.includes(cleanAlbum) || cleanAlbum.includes(normSlug);
      }) || albumLinks[0];

    if (!candidate) return null;

    const albRes = await fetch(`https://music.apple.com${candidate.path}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!albRes.ok) return null;

    const albHtml = await albRes.text();
    const match = albHtml.match(/<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
    if (!match || !match[1]) return null;

    const json = JSON.parse(match[1]) as AppleSerializedData;
    const sections = json.data?.[0]?.data?.sections || [];

    // Header artwork
    const headerSec = sections.find((s) => s.itemKind === 'containerDetailHeaderLockup');
    const headerItem = headerSec?.items?.[0];
    const headerArtwork = formatAppleArtworkUrl(headerItem?.artwork || headerSec?.artwork);

    // Tracklockup
    const trackSec = sections.find((s) => s.itemKind === 'trackLockup');
    const tracks = (trackSec?.items || []).filter((t): t is AppleTrackItem & { previewUrl: string } =>
      Boolean(t.previewUrl)
    );

    if (tracks.length === 0) return null;

    const cleanTarget = normalize(title);
    const baseTarget = normalize(getBaseTitle(title));

    // Match priorities:
    // 1. Exact normalized title
    // 2. Base title match
    // 3. First track
    const exact = tracks.find((t) => normalize(t.title || '') === cleanTarget);
    const baseMatch = tracks.find((t) => normalize(getBaseTitle(t.title || '')) === baseTarget);
    const chosen = exact || baseMatch || tracks[0];

    if (!chosen?.previewUrl) return null;

    // Verify artist to avoid wrong artist previews
    if (chosen.artistName && !artistsMatch(artist, chosen.artistName)) {
      return null;
    }

    const itemArtwork = formatAppleArtworkUrl(chosen.artwork);
    const artworkUrl = itemArtwork || headerArtwork || spotifyArtworkUrl;

    return {
      previewUrl: chosen.previewUrl,
      artworkUrl,
      source: 'apple-web',
    };
  } catch {
    // Fail gracefully to iTunes API fallback
    return null;
  }
}

/**
 * Strategy 2: iTunes Search API fallback
 */
export async function tryItunesApi(
  title: string,
  artist: string,
  spotifyArtworkUrl: string
): Promise<ResolutionResult | null> {
  try {
    const q = `${title} ${artist}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=10`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as ItunesSearchResponse;
    const candidates = (data.results || []).filter((t): t is ItunesTrackItem & { previewUrl: string } =>
      Boolean(t.previewUrl)
    );

    if (candidates.length === 0) return null;

    // Filter by artist compatibility
    const artistFiltered = candidates.filter((t) => !t.artistName || artistsMatch(artist, t.artistName));
    const pool = artistFiltered.length > 0 ? artistFiltered : candidates;

    const cleanTarget = normalize(title);
    const baseTarget = normalize(getBaseTitle(title));

    const exact = pool.find((t) => normalize(t.trackName || '') === cleanTarget);
    const baseMatch = pool.find((t) => normalize(getBaseTitle(t.trackName || '')) === baseTarget);
    const nonRemix = pool.find(
      (t) =>
        !(t.trackName || '').toLowerCase().includes('remix') &&
        !(t.collectionName || '').toLowerCase().includes('remix')
    );
    const chosen = exact || baseMatch || nonRemix || pool[0];

    if (!chosen?.previewUrl) return null;

    let artworkUrl = spotifyArtworkUrl;
    if (chosen.artworkUrl100) {
      artworkUrl = chosen.artworkUrl100.replace('100x100bb', '600x600bb');
    }

    return {
      previewUrl: chosen.previewUrl,
      artworkUrl,
      source: 'itunes-api',
    };
  } catch {
    return null;
  }
}

/**
 * High-level track resolver combining Apple Music Web and iTunes API fallback with throttling.
 */
export async function resolveTrack(
  title: string,
  artist: string,
  album: string,
  spotifyArtworkUrl: string,
  options?: ResolverOptions
): Promise<ResolutionResult | null> {
  const throttleMs = options?.throttleMs ?? 200;

  // 1. Try Apple Music Web
  const appleResult = await tryAppleMusicWeb(title, artist, album, spotifyArtworkUrl);
  if (appleResult) {
    if (throttleMs > 0) await sleep(throttleMs);
    return appleResult;
  }

  if (throttleMs > 0) await sleep(throttleMs);

  // 2. Try iTunes Search API
  const itunesResult = await tryItunesApi(title, artist, spotifyArtworkUrl);
  if (itunesResult) {
    if (throttleMs > 0) await sleep(throttleMs);
    return itunesResult;
  }

  return null;
}
