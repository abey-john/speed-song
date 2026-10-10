import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchYouTubeMusicSong } from './ytmusic';

describe('scripts/data/ytmusic', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses valid YouTube Music songs response', async () => {
    const mockResponse = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicShelfRenderer: {
                          contents: [
                            {
                              musicResponsiveListItemRenderer: {
                                flexColumns: [
                                  {
                                    musicResponsiveListItemFlexColumnRenderer: {
                                      title: {
                                        runs: [
                                          {
                                            text: 'Concorde',
                                            navigationEndpoint: {
                                              watchEndpoint: {
                                                videoId: 'RmxkgsMfAKU',
                                              },
                                            },
                                          },
                                        ],
                                      },
                                    },
                                  },
                                  {
                                    musicResponsiveListItemFlexColumnRenderer: {
                                      text: {
                                        runs: [
                                          { text: 'Black Country, New Road' },
                                          { text: ' • ' },
                                          { text: 'Ants From Up There' },
                                          { text: ' • ' },
                                          { text: '6:04' },
                                        ],
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const result = await searchYouTubeMusicSong('Concorde', 'Black Country, New Road');
    expect(result).not.toBeNull();
    expect(result?.videoId).toBe('RmxkgsMfAKU');
    expect(result?.title).toBe('Concorde');
    expect(result?.artist).toBe('Black Country, New Road');
    expect(result?.duration).toBe('6:04');
  });

  it('returns null on empty response or network failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }));
    const result = await searchYouTubeMusicSong('Unknown', 'Unknown');
    expect(result).toBeNull();
  });

  it('retries on 429 rate limit response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contents: {} }), { status: 200 }));
    global.fetch = fetchMock;

    const promise = searchYouTubeMusicSong('Song', 'Artist');
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});
