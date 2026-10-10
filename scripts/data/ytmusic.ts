export interface YtMusicSongMatch {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: string;
}

const YTM_SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search';
// Pre-calculated filter param for the "Songs" category tab on YouTube Music Web Remix
const SONGS_FILTER_PARAMS = 'EgWKAQIIAWoOEAQQAxAJEAUQChAVEBA%3D';

interface RunItem {
  text: string;
}

interface FlexColumn {
  musicResponsiveListItemFlexColumnRenderer?: {
    text?: {
      runs?: RunItem[];
    };
    title?: {
      runs?: Array<{
        text: string;
        navigationEndpoint?: {
          watchEndpoint?: {
            videoId: string;
          };
        };
      }>;
    };
  };
}

interface ShelfItem {
  musicResponsiveListItemRenderer?: {
    flexColumns?: FlexColumn[];
    playlistItemData?: {
      videoId: string;
    };
  };
}

interface Section {
  musicShelfRenderer?: {
    contents?: ShelfItem[];
  };
}

interface SearchResponse {
  contents?: {
    tabbedSearchResultsRenderer?: {
      tabs?: Array<{
        tabRenderer?: {
          content?: {
            sectionListRenderer?: {
              contents?: Section[];
            };
          };
        };
      }>;
    };
  };
}

/**
 * Searches YouTube Music exclusively within the "Songs" category,
 * returning official label studio masters (MUSIC_VIDEO_TYPE_ATV)
 * and completely bypassing official music videos and fan uploads.
 */
export async function searchYouTubeMusicSong(
  title: string,
  artist: string
): Promise<YtMusicSongMatch | null> {
  const cleanTitle = title
    .replace(/\s*-\s*Remaster(ed)?(\s*\d{4})?/i, '')
    .replace(/\s*\(Remaster(ed)?(\s*\d{4})?\)/i, '')
    .trim();

  const query = `${cleanTitle} ${artist}`.trim();
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(YTM_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          Referer: 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240401.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
          query,
          params: SONGS_FILTER_PARAMS,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          console.warn(`\n⚠️ YouTube Music 429 (rate limited). Backing off for ${(delay / 1000).toFixed(1)}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      if (!res.ok) {
        return null;
      }

    const data = (await res.json()) as SearchResponse;
    const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs;
    const sections = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    const shelf = sections?.[0]?.musicShelfRenderer;

    const items = shelf?.contents;
    if (!items || items.length === 0) {
      return null;
    }

    const firstItem = items[0]?.musicResponsiveListItemRenderer;
    if (!firstItem || !firstItem.flexColumns) {
      return null;
    }

    const flex0 = firstItem.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer;
    const flex1 = firstItem.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer;

    const matchedTitle =
      flex0?.text?.runs?.[0]?.text || flex0?.title?.runs?.[0]?.text || title;

    const videoId =
      flex0?.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
      firstItem.playlistItemData?.videoId;

    if (!videoId) {
      // Check first run in text
      const navEndpoint = (flex0?.text?.runs?.[0] as unknown as {
        navigationEndpoint?: { watchEndpoint?: { videoId?: string } };
      })?.navigationEndpoint;
      if (navEndpoint?.watchEndpoint?.videoId) {
        return {
          videoId: navEndpoint.watchEndpoint.videoId,
          title: matchedTitle,
        };
      }
      return null;
    }

    const subtitleRuns = flex1?.text?.runs || [];
    const matchedArtist = subtitleRuns[0]?.text;
    const matchedAlbum = subtitleRuns[2]?.text;
    const matchedDuration = subtitleRuns[4]?.text;

    return {
      videoId,
      title: matchedTitle,
      artist: matchedArtist,
      album: matchedAlbum,
      duration: matchedDuration,
    };
  } catch {
    return null;
  }
  }

  return null;
}
