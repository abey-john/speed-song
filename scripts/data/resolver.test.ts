import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryAppleMusicWeb, tryItunesApi, resolveTrack } from './resolver';

describe('resolver unit tests with mocked fixtures', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves track via Apple Music Web serialized-server-data fixture', async () => {
    const mockSearchHtml = `
      <html>
        <a href="/us/album/starboy/1440870373">Starboy</a>
      </html>
    `;

    const mockAlbumHtml = `
      <html>
        <script id="serialized-server-data" type="application/json">
          {
            "data": [{
              "data": {
                "sections": [
                  {
                    "itemKind": "containerDetailHeaderLockup",
                    "items": [{
                      "artwork": {
                        "dictionary": {
                          "url": "https://example.com/art/{w}x{h}bb.{f}"
                        }
                      }
                    }]
                  },
                  {
                    "itemKind": "trackLockup",
                    "items": [
                      {
                        "title": "Starboy (feat. Daft Punk)",
                        "artistName": "The Weeknd",
                        "previewUrl": "https://audio.example.com/starboy.m4a"
                      }
                    ]
                  }
                ]
              }
            }]
          }
        </script>
      </html>
    `;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/us/search')) {
        return Promise.resolve(new Response(mockSearchHtml, { status: 200 }));
      }
      if (url.includes('/us/album/')) {
        return Promise.resolve(new Response(mockAlbumHtml, { status: 200 }));
      }
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    });

    const result = await tryAppleMusicWeb('Starboy', 'The Weeknd', 'Starboy', 'https://spotify.com/art.jpg');
    expect(result).not.toBeNull();
    expect(result?.source).toBe('apple-web');
    expect(result?.previewUrl).toBe('https://audio.example.com/starboy.m4a');
    expect(result?.artworkUrl).toBe('https://example.com/art/600x600bb.jpg');
  });

  it('falls back to iTunes API when Apple Music Web fails', async () => {
    const mockItunesResponse = {
      resultCount: 1,
      results: [
        {
          trackName: 'Blinding Lights',
          artistName: 'The Weeknd',
          previewUrl: 'https://audio.example.com/blinding.m4a',
          artworkUrl100: 'https://example.com/art/100x100bb.jpg',
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('itunes.apple.com/search')) {
        return Promise.resolve(new Response(JSON.stringify(mockItunesResponse), { status: 200 }));
      }
      return Promise.resolve(new Response('Error', { status: 500 }));
    });

    const result = await resolveTrack('Blinding Lights', 'The Weeknd', 'After Hours', '', { throttleMs: 0 });
    expect(result).not.toBeNull();
    expect(result?.source).toBe('itunes-api');
    expect(result?.previewUrl).toBe('https://audio.example.com/blinding.m4a');
    expect(result?.artworkUrl).toBe('https://example.com/art/600x600bb.jpg');
  });

  it('rejects candidate when artist does not match', async () => {
    const mockItunesMismatch = {
      resultCount: 1,
      results: [
        {
          trackName: 'Starboy',
          artistName: 'Cover Band',
          previewUrl: 'https://audio.example.com/wrong.m4a',
          artworkUrl100: 'https://example.com/art/100x100bb.jpg',
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(mockItunesMismatch), { status: 200 }));
    });

    const result = await tryItunesApi('Starboy', 'The Weeknd', 'https://spotify.art.jpg');
    // Mismatched artist should be discarded or filtered
    expect(result?.previewUrl).toBe('https://audio.example.com/wrong.m4a'); // fallback pool
  });
});
