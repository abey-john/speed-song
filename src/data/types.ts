export interface ManifestPlaylistEntry {
  id: string;
  name: string;
  songCount: number;
  file: string;
}

export interface Manifest {
  generatedAt: string;
  playlists: ManifestPlaylistEntry[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  previewUrl: string;
  artworkUrl: string;
}

export interface PlaylistFile {
  id: string;
  name: string;
  generatedAt: string;
  songs: Song[];
}

export const INTERVALS = [0.1, 0.5, 1, 3, 5, 10, 15, 30] as const;
export type IntervalStep = (typeof INTERVALS)[number];
