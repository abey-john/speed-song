export interface SpotifyRawTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images?: { url: string; width?: number; height?: number }[];
  };
  is_local?: boolean;
}

export interface PipelineTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  spotifyArtworkUrl: string;
}

export interface PipelinePlaylist {
  id: string;
  name: string;
  ownerId: string;
  totalTracks: number;
}

export interface CacheEntry {
  previewUrl?: string;
  artworkUrl?: string;
  source?: 'apple-web' | 'itunes-api' | 'manual';
  resolvedAt: string;
  failed?: boolean;
  failureReason?: string;
}

export type MatchCache = Record<string, CacheEntry>;

export interface OverrideEntry {
  previewUrl?: string;
  artworkUrl?: string;
  appleAlbumUrl?: string;
  skip?: boolean;
}

export type Overrides = Record<string, OverrideEntry>;

export interface ResolutionResult {
  previewUrl: string;
  artworkUrl: string;
  source: 'apple-web' | 'itunes-api';
}

export interface UnmatchedReportEntry {
  playlist: string;
  playlistId: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  reason: string;
}
