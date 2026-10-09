import fs from 'node:fs';
import path from 'node:path';
import { MatchCache, CacheEntry } from './types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function getCachePath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'data', 'match-cache.json');
}

export function loadCache(filePath = getCachePath()): MatchCache {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as MatchCache;
  } catch (err) {
    console.warn(`[cache] Failed to read ${filePath}, initializing empty cache:`, err);
    return {};
  }
}

export function saveCache(cache: MatchCache, filePath = getCachePath()): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Sort keys for predictable git diffs
  const sorted: MatchCache = {};
  for (const key of Object.keys(cache).sort()) {
    const val = cache[key];
    if (val) {
      sorted[key] = val;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

export function isCacheValid(entry: CacheEntry | undefined, nowMs = Date.now()): boolean {
  if (!entry) return false;

  const resolvedTime = new Date(entry.resolvedAt).getTime();
  if (isNaN(resolvedTime)) return false;

  const ageMs = nowMs - resolvedTime;

  // Failed entries are re-tried after 7 days
  if (entry.failed) {
    return ageMs < SEVEN_DAYS_MS;
  }

  // Successful entries are valid for 30 days
  if (entry.previewUrl) {
    return ageMs < THIRTY_DAYS_MS;
  }

  return false;
}
