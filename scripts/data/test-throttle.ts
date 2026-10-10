import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function findYtDlp(): string {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  try {
    const checkCmd = isWin ? 'where' : 'which';
    const result = execFileSync(checkCmd, [exeName], { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' });
    const firstLine = result.trim().split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {}

  if (isWin && process.env.LOCALAPPDATA) {
    const wingetDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetDir)) {
      const entries = fs.readdirSync(wingetDir, { recursive: true }) as string[];
      for (const rel of entries) {
        if (path.basename(rel).toLowerCase() === exeName.toLowerCase()) {
          const fullPath = path.join(wingetDir, rel);
          if (fs.existsSync(fullPath)) return fullPath;
        }
      }
    }
  }

  throw new Error('yt-dlp binary not found.');
}

async function testThrottle() {
  const ytDlp = findYtDlp();

  const rawArgs = process.argv.slice(2);
  let playerClient: string | null = 'android';
  let cookiesBrowser: string | null = null;
  let modeName = 'Android Client (zero cookies)';

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--unauthenticated' || arg === '--unauth' || arg === '--default') {
      playerClient = null;
      cookiesBrowser = null;
      modeName = 'Unauthenticated (default web client, zero cookies)';
    } else if (arg === '--android') {
      playerClient = 'android';
      cookiesBrowser = null;
      modeName = 'Android Client (zero cookies)';
    } else if (arg === '--ios') {
      playerClient = 'ios';
      cookiesBrowser = null;
      modeName = 'iOS Client (zero cookies)';
    } else if (arg === '--cookies') {
      const next = rawArgs[i + 1];
      if (next && !next.startsWith('--')) {
        cookiesBrowser = next;
        i++;
      } else {
        cookiesBrowser = 'firefox';
      }
      playerClient = null;
      modeName = `Browser Cookies (${cookiesBrowser})`;
    } else if (arg === '--no-cookies') {
      cookiesBrowser = null;
    }
  }

  console.log(`Testing YouTube connection via yt-dlp (Mode: ${modeName})...`);

  const query = "Ain't That Some Shit (Interlude)";
  const args = [
    '--print', '%(title)s',
    '--no-warnings',
    '--js-runtimes', 'node',
    ...(playerClient ? ['--extractor-args', `youtube:player_client=${playerClient}`] : []),
    ...(cookiesBrowser ? ['--cookies-from-browser', cookiesBrowser] : []),
    `ytsearch1:${query}`,
  ];

  const res = spawnSync(ytDlp, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = (res.stdout || '').trim();
  const stderr = res.stderr || '';

  const isThrottled = /429|Too Many Requests|confirm you're not a bot|bot-check|Sign in to confirm/i.test(stderr);

  if (isThrottled) {
    console.log(`\n❌ STILL THROTTLED by YouTube in ${modeName} mode.`);
    console.log('Reason: YouTube returned 429 / bot-check / sign-in requirement.');
    console.log('Status: Wait for cooldown or switch modes (--unauthenticated, --android, or --cookies firefox).\n');
  } else if (res.status === 0 && output.length > 0) {
    console.log(`\n✅ CLEAR! YouTube returned: "${output}"`);
    console.log(`Status: Connection active and authenticated in ${modeName} mode. Safe to ingest!\n`);
  } else {
    console.log(`\n⚠️ Unexpected response from YouTube in ${modeName} mode:`);
    if (output) console.log('stdout:', output);
    if (stderr) console.log('stderr:', stderr);
    console.log();
  }
}

testThrottle().catch((err) => {
  console.error('Test error:', err);
});

