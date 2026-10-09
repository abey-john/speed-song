# AGENTS.md — Development & Agent Guidelines

## 1. Git & Commit Guidelines

- **Conventional Commits**: Every commit MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - Format: `<type>(<scope>): <subject>` (e.g., `feat(audio): implement Web Audio snippet player with silence trimming`, `fix(resolver): handle missing serialized-server-data fallback`, `chore: scaffold Vite TypeScript project`).
  - Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`.
  - **DO NOT** use milestone codes like `M1`, `M2`, `Milestone 1` as commit messages.
- **Push Policy**: **NEVER push any code to remote repositories.** Only commit locally (`git commit`). Do NOT execute `git push`.

---

## 2. Project Overview & Architecture

**Speed Song** is a login-free, static web game (Heardle-style) where players guess songs from public Spotify playlists based on progressively longer audio snippets (0.1s, 0.5s, 1s, 3s, 5s, 10s, 15s, 30s).

The system consists of two independent halves connected by static JSON:
1. **Build-Time Data Pipeline** (`scripts/data/`):
   - Fetches public playlist tracks from Spotify (using Spotify app credentials).
   - Resolves 30-second studio audio preview clips and high-res artwork from Apple (Apple Music web + iTunes Search API fallback).
   - Caches resolutions in `data/match-cache.json` and respects manual overrides in `data/overrides.json`.
   - Generates static JSON files in `public/data/` (`manifest.json` and `playlists/<id>.json`).
2. **Static Frontend** (`src/`):
   - Hosted on GitHub Pages without server, authentication, or secrets at runtime.
   - Built with Vite + TypeScript, using lightweight DOM modules.
   - High-precision audio scheduling via Web Audio API (`AudioContext`), decoding preview buffers, detecting leading AAC silence priming, and applying micro fade-outs to avoid audio clicks.

---

## 3. Technology Stack & Coding Standards

- **Language & Types**: TypeScript in strict mode. **Zero `any`** in application code; use precise types and discriminated unions.
- **Frontend UI**: Vanilla TypeScript DOM modules (no heavy frontend frameworks unless specifically requested). High aesthetic standards: mobile-first, dark mode, smooth micro-animations, accessible ARIA combobox search, responsive layout.
- **Audio Engine**: Web Audio API with `decodeAudioData`. Single `AudioContext` unlocked on initial user gesture (Start button). Background prefetching of subsequent tracks.
- **Verification Rule**: Whenever a step in `notes/plan.md` mentions `VERIFY`, test against live APIs / real requests and verify behavior rather than silently working around edge cases.

---

## 4. Key References & Data Contract

- Reference for audio resolver logic: `AudioSnippetPlayer.astro` / `music.astro` from `abey-john/abey-john.github.io`.
- See `notes/plan.md` for full requirements, interval progression, state machine definitions, and acceptance criteria.
