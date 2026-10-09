import fs from 'node:fs';
import path from 'node:path';
import { Overrides } from './types';

export function getOverridesPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'data', 'overrides.json');
}

export function loadOverrides(filePath = getOverridesPath()): Overrides {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Overrides;
  } catch (err) {
    console.warn(`[overrides] Failed to read ${filePath}, initializing empty overrides:`, err);
    return {};
  }
}

export function saveOverrides(overrides: Overrides, filePath = getOverridesPath()): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sorted: Overrides = {};
  for (const key of Object.keys(overrides).sort()) {
    const val = overrides[key];
    if (val) {
      sorted[key] = val;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}
