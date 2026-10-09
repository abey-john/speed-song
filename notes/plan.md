# Song Snippet Guessing Game: Implementation Plan

Brief for a coding agent. Build a static, login-free web game (Heardle-style) that plays progressively longer snippets of songs from the owner's public Spotify playlists. Read the whole plan before writing code. Where the plan says VERIFY, check the claim against current docs or a real request and report the result instead of silently working around it.

## 1. Product summary

- Endless random rounds. A dropdown lists every public playlist on the owner's Spotify profile; the player picks one.
- Each round plays a random song at growing intervals: 0.1s, 0.5s, 1s, 3s, 5s, 10s, 15s, 30s.
- The player guesses with a search-as-you-type box. Suggestions come from the selected playlist's own songs, labelled `Title — Artist`. Only a picked suggestion can be submitted, so a guess is correct only on an exact match of that song.
- A wrong guess or a Skip auto-advances to the next interval and plays it. A miss at the 30s step ends the round.
- On a correct guess or a miss, reveal the song: album art, title, artist.
- No points. Stats are a histogram of the interval at which each song was guessed, plus misses, stored in localStorage.
- Hosted on GitHub Pages. No server, no login, no credentials at runtime. Anyone with the link can play.
- Spotify is used only at build time (playlist contents). Audio previews and artwork come from Apple (Apple Music web pages and the iTunes Search API).

## 2. Decisions already made

- Frontend: Vite + TypeScript, no UI framework to start. Plain DOM modules. A small framework (Preact or Svelte) can be added later if the UI grows.
- Build script: Node + TypeScript (run with tsx), kept separate from the frontend. The only contract between them is the generated JSON files.
- Audio: Web Audio API (decoded buffers scheduled on the audio clock), not streaming and not timeupdate polling. Timeupdate is far too coarse for a 0.1s clip.
- Stats are combined across playlists, kept in localStorage only.
- Guess correctness is decided by song id equality, which is equivalent to an exact title + artist match because the pool is deduplicated by label.
- Deployment: GitHub Pages through GitHub Actions.
- Out of scope: any user login, other people's playlists, daily-song mode, points, blurred-art difficulty mode.

## 3. Architecture

Two independent halves joined by static JSON.

1. Build-time data pipeline (needs secrets, runs locally or in CI): Spotify playlists, then preview and artwork resolution against Apple, then JSON files in `public/data/`.
2. Static frontend (no secrets): loads `manifest.json`, then the chosen playlist file, fetches and decodes preview audio, runs the game.

The JSON contains every answer, so anyone can read it in dev tools. That is accepted.

## 4. Repo layout

```
package.json
vite.config.ts            base path comes from env VITE_BASE
index.html
.env.example              SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_USER_ID
src/
  main.ts
  data/       types.ts, loader.ts
  audio/      engine.ts, silence.ts, fallback.ts
  game/       state.ts, bag.ts
  ui/         search.ts, reveal.ts, histogram.ts, controls.ts, styles.css
  stats/      store.ts
scripts/data/
  index.ts, spotify.ts, resolver.ts, cache.ts, dedupe.ts, normalize.ts, check-previews.ts
data/
  match-cache.json        committed; keyed by Spotify track id
  overrides.json          committed; manual fixes
  unmatched.json          generated report
public/data/
  manifest.json, playlists/<playlistId>.json     generated
.github/workflows/deploy.yml
```

## 5. Data contract

```ts
interface Manifest {
  generatedAt: string;                 // ISO timestamp
  playlists: {
    id: string;                        // Spotify playlist id
    name: string;
    songCount: number;                 // playable songs only
    file: string;                      // relative path, e.g. playlists/<id>.json
  }[];
}

interface PlaylistFile {
  id: string;
  name: string;
  generatedAt: string;
  songs: Song[];
}

interface Song {
  id: string;           // Spotify track id of the kept entry
  title: string;
  artist: string;       // all artists joined with ', '
  album: string;
  previewUrl: string;   // Apple preview, about 30s
  artworkUrl: string;   // about 600x600
}
```

- The display label everywhere is `${title} — ${artist}`.
- Keep only these fields. Do not copy extra Spotify metadata into the output.
- Sort songs by title then artist so diffs stay small.
- The frontend resolves URLs with `import.meta.env.BASE_URL`, never a hardcoded path.

## 6. Build-time data pipeline

### 6.1 Configuration

Environment variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_USER_ID`. The owner's Spotify user id appears in the Spotify link on the Music page of his personal site (abey-john.github.io/music). Optional flag `INCLUDE_FOLLOWED` (default false) to include playlists the user follows but does not own. Never commit secrets; provide `.env.example`.

### 6.2 Spotify

- Get an app-only token with the client credentials flow (POST to the Spotify accounts token endpoint with the client id and secret).
- List the user's public playlists (users/{id}/playlists), paginating. Keep playlists owned by the user unless `INCLUDE_FOLLOWED` is set.
- For each playlist, page through its tracks. Skip null tracks, local files, and podcast episodes.
- Per track capture: id, name, artists (all names), album name, and the album image URL as an artwork fallback.
- Respect rate limits: on HTTP 429 wait for the Retry-After header, then retry.
- VERIFY first: current Spotify developer-mode rules still allow reading public playlists and their tracks with an app-only token, and note the exact endpoints that work today. If they do not, stop and report. Contingency: a one-time local PKCE login script that stores a refresh token in a git-ignored file and in a CI secret.

### 6.3 Preview and artwork resolver

The owner's personal site already contains a working resolver, `resolvePreviewUrl(title, artist, preferredTrack)`, which is the basis for this one. Port its logic to Node; ask the owner to paste it if you need the source. The algorithm:

1. Apple Music web (studio cuts). Request `https://music.apple.com/us/search?term=<album + artist>` and read the HTML. Collect album links of the form `/us/album/<slug>/<numeric id>`. Prefer the link whose slug, with non-alphanumerics removed, contains or is contained by the normalized album name; otherwise take the first.
2. Fetch that album page. Read the JSON inside the script element with id `serialized-server-data`. Navigate `data[0].data.sections`, find the section whose `itemKind` is `trackLockup`, and keep its items that have a `previewUrl`.
3. Choose the item whose normalized title equals the normalized target track name. Otherwise match on the base title (text before any of `( [ - – — :`). Otherwise take the first item.
4. Fallback: iTunes Search API (`https://itunes.apple.com/search?term=<track + artist>&entity=song&limit=10`). Keep results with a `previewUrl`. Prefer an exact normalized title match, then a non-remix, then the first.
5. Normalization: lowercase and strip everything except a-z and 0-9.

Improvements to make while porting:

- Verify the result's artist (normalized) contains or is contained by the Spotify artist, to avoid previews from the wrong artist. Reject mismatches.
- Parse defensively. The Apple page structure is undocumented. Any parse failure must fall through to the iTunes fallback, never throw out of the resolver.
- Return `{ previewUrl, artworkUrl, source }`, where source is `apple-web` or `itunes-api`. For iTunes results derive artwork from `artworkUrl100` by replacing the size segment `100x100bb` with `600x600bb` (VERIFY this works). For Apple web results use the artwork in the item data if present. Fall back to the Spotify album image.
- Treat the track name as the target and the album name as a search hint, since Spotify provides both.

### 6.4 Cache and overrides

- `data/match-cache.json` maps Spotify track id to `{ previewUrl, artworkUrl, source, resolvedAt, failed?: true }`. Look up the cache before any network call. Re-resolve entries older than 30 days or marked failed more than 7 days ago.
- Throttle Apple requests. iTunes has been about 20 requests per minute; VERIFY and make the delay configurable. Use sequential requests with exponential backoff on 403 or 429. A first run over \~1,000 tracks can take an hour; later runs only touch new tracks.
- `data/overrides.json` maps Spotify track id to one of `{ previewUrl, artworkUrl }`, `{ appleAlbumUrl }`, or `{ skip: true }`. Overrides win over the resolver.

### 6.5 Deduplication

Within a playlist, collapse songs whose normalized label (`title + artist`) is identical, keeping the first occurrence. This guarantees that two selectable entries never share a label, so correct-by-id and correct-by-label agree.

### 6.6 Outputs and reports

- Write `public/data/manifest.json` and one `public/data/playlists/<id>.json` per playlist. Omit unresolved songs. Omit playlists with zero playable songs.
- Write `data/unmatched.json` listing playlist, track id, title, artist, and the reason, so the owner can add overrides.
- Print a summary: playlists, tracks seen, resolved from cache, resolved fresh, unmatched.
- `scripts/data/check-previews.ts`: request every preview URL and artwork URL and report non-200 responses and unexpected content types. Run it after the data build.

## 7. Frontend

### 7.1 Audio engine (`src/audio/`)

- Create one `AudioContext` and resume it on the first user gesture (a Start button). Browsers, especially iOS Safari, will not play audio otherwise. After that, later rounds can autoplay.
- Loading a song: `fetch(previewUrl)`, then `arrayBuffer()`, then `decodeAudioData`. Cache decoded buffers in a small map, capped at a few songs.
- Prefetch the next song in the background once a round starts so the next round starts instantly. Keep it hidden: do not show its art or label.
- Playing a snippet of N seconds: create an `AudioBufferSourceNode`, route it through a `GainNode`, call `start(ctx.currentTime, offset)` and `stop(ctx.currentTime + N)`. Apply a very short fade-out (about 5 ms) before the stop to avoid an audible click. Stop any previous source first.
- Leading silence: AAC decoding can leave tens of milliseconds of silence or priming at the start, which matters at 0.1s. In `silence.ts`, scan the decoded channel data for the first sample whose absolute value exceeds a small threshold (start with 0.01) and use that as `offset`. Keep the threshold a named constant and log the detected offset in debug mode.
- Replay button replays the current interval.
- Failure handling:
  - If `fetch` fails because of CORS or a network error, VERIFY which, and fall back to an `HTMLAudioElement` that is paused by a timer. This is less precise, so show a small non-blocking notice in debug mode only.
  - If a preview URL fails or cannot be decoded, mark the song failed for this session, show nothing to the player, and silently pick another song.
- Expose a debug mode (`?debug=1`) that shows decoded duration, detected leading silence, and the audio source used.

### 7.2 Game flow (`src/game/`)

- Song selection: a per-playlist shuffle bag. Draw without repeats until exhausted, then reshuffle, making sure the last song drawn is not first in the new bag.
- Intervals constant: `[0.1, 0.5, 1, 3, 5, 10, 15, 30]`.
- State machine (pure functions, unit tested): `idle` (choose playlist, press Start), `loading`, `guessing(step, wrongGuesses[])`, `revealed(result)`.
- Round start plays step 0 automatically.
- Submitting a guess:
  - Correct (guess id equals the current song id): go to `revealed` with result = step index.
  - Wrong: record it, advance to the next step, auto-play that step. If it was the last step, go to `revealed` with result = missed.
- Skip behaves exactly like a wrong guess with no entry.
- Already-guessed songs are removed from the suggestions for that round.
- The Next button on the reveal screen starts a new round. Do not autoplay the next song until the player presses it.
- Changing the playlist mid-round abandons the round without recording a stat and starts a new one.
- Remember the last selected playlist in localStorage.

### 7.3 Search box (`src/ui/search.ts`)

- ARIA combobox pattern: input with `role=combobox`, a `listbox` of options, `aria-activedescendant`, and `aria-expanded`.
- Keyboard: Up and Down move the highlight, Enter selects the highlighted option, Escape closes the list.
- Matching: case-insensitive and diacritic-insensitive substring match on the label, so both title and artist are searchable. Show at most 8 results, highlight the matched text.
- A guess can be submitted only after an option is selected. The Submit button stays disabled until then. Free text is never submitted.

### 7.4 Reveal (`src/ui/reveal.ts`)

- On reveal show the artwork, title, artist, and the outcome (`Guessed at 3s` or `Missed`).
- Start loading the artwork image when the round begins, off-screen, so it appears instantly at the reveal. Do not insert it into the visible DOM before the reveal.
- If the image fails to load, show a neutral placeholder with the title and artist. The reveal must never look broken.
- Optional nice-to-have: a button to play the full preview on the reveal screen.

### 7.5 Stats (`src/stats/store.ts`)

- localStorage key `snippet-game:stats:v1`.
- Shape: `{ version: 1, buckets: Record<string, number>, played: number }` with bucket keys `0.1, 0.5, 1, 3, 5, 10, 15, 30, missed`.
- Wrap every read and write in try/catch. If storage is unavailable, fall back to in-memory stats for the session. Validate parsed JSON, and reset to empty on corruption or an unknown version.
- Record a stat only when a round finishes (correct or missed), not when abandoned.
- Render a histogram with plain DOM or SVG, with no chart library: one bar per interval plus a Missed bar, counts on the bars, and totals (played, solved percentage). Include a Reset stats button with a confirm step.

### 7.6 UI and accessibility

- Mobile first. Large tap targets. The first interaction is a Start button, which unlocks audio.
- An 8-segment progress indicator shows the current interval, labelled with the durations.
- List of wrong guesses for the current round, newest last.
- Announce results and wrong guesses in an `aria-live` region.
- Respect `prefers-reduced-motion`. Visible focus styles. Sufficient contrast in light and dark mode.
- Footer credit: playlist data from Spotify; previews and artwork from Apple.

## 8. CI and deployment

One workflow, `.github/workflows/deploy.yml`:

- Triggers: push to main, a weekly schedule, and manual dispatch.
- Permissions: `contents: write`, `pages: write`, `id-token: write`.
- Steps: checkout, set up Node (current LTS), `npm ci`.
- On schedule or manual dispatch only: run the data build using repository secrets `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_USER_ID`, then run `check-previews`. If `data/` or `public/data/` changed, commit and push them. Because the same job continues, the new files are used for this build; a push made with the default token will not trigger another run.
- Then `vite build` with `VITE_BASE` set to `/<repo-name>/` (or `/` for a user site), upload the Pages artifact, and deploy.
- Document in the README: creating the Spotify app and getting the client id and secret, adding the three secrets, and setting Pages source to GitHub Actions.

## 9. Testing

Unit tests with Vitest for pure logic:

- `normalize` and label building.
- Dedupe.
- Resolver scoring and matching using saved fixtures of Apple pages and iTunes responses (no live network in tests).
- Shuffle bag behavior.
- Game state machine transitions, including skip and the last step.
- Search filtering.
- Stats store with a mocked storage, including corruption and unavailable storage.

Manual checklist before calling it done:

- 0.1s and 0.5s clips are audible, repeatable, and do not click.
- Behavior on iOS Safari (first-tap unlock) and desktop Chrome and Firefox.
- A song with a failing preview is skipped without breaking the round.
- Works under the real Pages base path, not just at the root.

## 10. Milestones and acceptance criteria

1. **Scaffold and CI.** Vite + TS project, lint and format config, test runner, deploy workflow publishing a placeholder page under the correct base path. Done when the placeholder is live on Pages.
2. **Data pipeline.** Spotify fetch, resolver port, cache, overrides, dedupe, outputs, reports. Done when running the script locally produces valid manifest and playlist files, and a second run makes no Apple requests for cached tracks. Report the VERIFY findings (Spotify access with an app-only token, rate limits, artwork URL trick, Apple page parsing).
3. **Audio engine.** Engine plus a debug page. Done when the 0.1s clip plays reliably, leading silence is measured and handled, and the CORS question is answered with a documented decision.
4. **Game loop.** Playlist dropdown, shuffle bag, state machine, interval playback, skip. Done when a full round can be played with a hard-coded guess button.
5. **Search and guessing.** Combobox, exact id matching, wrong-guess list. Done when keyboard-only play works.
6. **Reveal and artwork.** Artwork preload, placeholder fallback, Next button.
7. **Stats.** Store, histogram, reset. Done when stats survive reloads and tolerate blocked or corrupted storage.
8. **Polish.** Accessibility pass, mobile pass, footer credits, README. Done when the manual checklist passes.

## 11. Risks to verify early

- Whether Spotify still allows app-only reads of public playlists and tracks in developer mode (6.2).
- Whether preview files can be fetched with `fetch` from a different origin (CORS) so Web Audio can decode them (7.1).
- How much leading silence decoded previews have, and whether trimming it is needed (7.1).
- Whether the Apple Music web page structure still parses (6.3), and the real iTunes rate limit (6.4).
- Match rate. Run several real playlists early and report the unmatched percentage. If it is high, prioritize the overrides workflow.
- Preview URLs can change. The weekly data refresh and the cache expiry handle this.
- Previews are usually an excerpt from the middle of a song, not its intro. This is expected behavior.

## 12. Terms and conventions

- Do not download or commit audio files. Reference preview URLs only.
- Keep stored metadata to the fields in the data contract.
- Review Spotify's developer terms and Apple's preview terms before making the site public, and flag anything that conflicts with this design.
- TypeScript strict mode, no `any` in new code, small modules, no secrets in the repo, and no runtime dependency beyond what is needed (none is required for the first version).
- If a decision here turns out to be wrong or blocked, stop and report the problem and the options instead of working around it silently.
