# ⚡ Speed Song

**Speed Song** is a fast-paced, login-free web game (Heardle-style) where you guess songs from public Spotify playlists based on progressively longer audio snippets (0.1s, 0.5s, 1s, 3s, 5s, 10s, 15s, 30s).

Built with **Vite + TypeScript**, **Web Audio API**, and **GitHub Pages**. Completely static at runtime — no server, no logins, no runtime credentials.

---

## 🎮 How the Game Works

1. **Pick a Playlist**: Choose from public playlists curated on Spotify.
2. **Growing Snippets**: Listen to an excerpt starting at **0.1 seconds**. Each wrong guess or skip advances the duration:
   - `0.1s` → `0.5s` → `1s` → `3s` → `5s` → `10s` → `15s` → `30s`
3. **Search & Guess**: Search by song title or artist using the accessible combobox. Only an exact picked song can be submitted.
4. **Reveal**: On a correct guess or miss at 30s, reveals the high-res album artwork, song title, and artist, with an option to play the full 30s preview.
5. **Stats & Histograms**: Tracks your guess distribution and win rate locally in `localStorage`.

---

## 🏗️ Architecture

Speed Song is divided into two independent halves connected by static JSON files:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Build-Time Data Pipeline    │       │         Static Frontend         │
│         (Node + tsx)            │       │       (Vite + TypeScript)       │
│                                 │       │                                 │
│  1. Fetch Spotify playlists     │       │  1. Loads manifest & playlists  │
│  2. Ingest intro clips to R2    │ ────> │  2. Decodes Web Audio buffers   │
│  3. Cache in match-cache.json   │ JSON  │  3. Trims AAC silence priming   │
│  4. Output public/data/*.json   │       │  4. Runs state machine & game   │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- Spotify Developer App credentials ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard))
- `ffmpeg` & `yt-dlp` (required only for slicing and ingesting new audio intro clips)

### 2. Setup Credentials
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your credentials:
```ini
# Spotify App Credentials
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback

# Cloudflare R2 Object Storage (for hosting 30s audio intro snippets)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=speed-song-audio
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxxx.r2.dev
```

### 3. One-Time Spotify Authorization
Run the local authorizer to obtain your persistent refresh token:
```bash
npm run auth
```
This launches a browser prompt. Click **Agree** and the script automatically saves `SPOTIFY_REFRESH_TOKEN` to your `.env`.

### 4. Build Playlist Data & Ingest Intros
Check your tracked Spotify playlists:
```bash
npm run sync:playlists
```
Generate static playlist JSON files from Spotify and match against existing R2 audio:
```bash
npm run data:build
```
Ingest new 30-second studio audio intros to Cloudflare R2:
```bash
# Ingest with standalone Android client:
npm run data:ingest -- --playlist compendium --android --concurrency 4

# Or ingest using browser session cookies:
npm run data:ingest -- --playlist compendium --cookies firefox --concurrency 4

# Or run the all-in-one build + ingest command:
npm run data:update
```

### 5. Start the Game Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to play.

---

## 🛠️ Pipeline & Diagnostic Commands

| Command | Description |
| :--- | :--- |
| `npm run data:update` | **All-in-one update**: Refreshes Spotify tracklists and ingests missing intros to R2. |
| `npm run data:build` | Generates `public/data/` JSON files from Spotify tracks and resolves R2 audio links. |
| `npm run data:ingest` | Slices 30s studio intro audio and uploads to R2 (supports `--android`, `--cookies`, `--unauth`). |
| `npm run data:count` | **Health Check**: Queries R2 bucket storage usage, total clips, and free tier margin. |
| `npm run data:throttle` | **Diagnostics**: Probes YouTube connection status across different authentication modes. |
| `npm run data:check` | **Health Check**: Sends HTTP HEAD checks across all tracks to verify audio and artwork URLs return 200. |
| `npm run sync:playlists` | Lists tracked vs available Spotify playlists on your account. |

---

## 🧪 Testing

Run the full unit test suite (pure functions, state transitions, silence trimming, search filtering, cache validation):
```bash
npm test
```

---

## 🚢 GitHub Pages Deployment

Deployment is 100% automated via GitHub Actions in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

### 1. Configure GitHub Repository Secrets
Go to your repository on GitHub → **Settings** → **Secrets and variables** → **Actions**, and add:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

### 2. Configure GitHub Pages
Go to **Settings** → **Pages** → under **Build and deployment**, set **Source** to **GitHub Actions**.

### 3. Deploy
Push commits to `main` (or trigger the workflow manually from the Actions tab). The action will:
1. Run all unit tests.
2. Build the Vite production bundle under your repo's subpath (`/<repo-name>/`).
3. Deploy to `https://<username>.github.io/<repo-name>/`.
4. Run automatically every Sunday on a cron schedule to refresh new songs and audio previews.

---

## 📜 Credits & License
- Playlist metadata and official album artwork sourced from [Spotify](https://spotify.com).
- 30-second studio intro audio clips hosted on Cloudflare R2.
