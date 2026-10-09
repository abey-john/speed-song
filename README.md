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
│  2. Resolve Apple studio clips  │ ────> │  2. Decodes Web Audio buffers   │
│  3. Cache in match-cache.json   │ JSON  │  3. Trims AAC silence priming   │
│  4. Output public/data/*.json   │       │  4. Runs state machine & game   │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- A Spotify Developer App credentials ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard))

### 2. Setup Credentials
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your Spotify app credentials:
```ini
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

### 3. One-Time Spotify Authorization
Run the local authorizer to obtain your persistent refresh token:
```bash
npm run auth
```
This launches a browser prompt. Click **Agree** and the script automatically saves `SPOTIFY_REFRESH_TOKEN` to your `.env`.

### 4. Build Playlist Data
Sync or check your profile playlists:
```bash
npm run sync:playlists
```
Build the static playlist JSON files and preview cache:
```bash
npm run data:build
```
*(Progress is incrementally saved to `data/match-cache.json` after every playlist.)*

### 5. Start the Game Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to play.

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
- Playlist data sourced from [Spotify](https://spotify.com).
- 30-second studio previews and high-res artwork sourced from [Apple Music](https://music.apple.com) & iTunes API.
