import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Error: Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  console.error('Please create a .env file with your credentials from developer.spotify.com:\n');
  console.error('  SPOTIFY_CLIENT_ID=your_client_id');
  console.error('  SPOTIFY_CLIENT_SECRET=your_client_secret');
  console.error('  SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback\n');
  process.exit(1);
}

const parsedRedirect = new URL(REDIRECT_URI);
const PORT = parseInt(parsedRedirect.port || '8888', 10);
const CALLBACK_PATH = parsedRedirect.pathname || '/callback';

const state = crypto.randomBytes(16).toString('hex');
const scopes = ['playlist-read-private', 'playlist-read-collaborative'].join(' ');

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', scopes);
authUrl.searchParams.set('state', state);

function updateEnvFile(refreshToken: string): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8');
  }

  if (content.includes('SPOTIFY_REFRESH_TOKEN=')) {
    content = content.replace(/SPOTIFY_REFRESH_TOKEN=.*/g, `SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
  } else {
    content += `\nSPOTIFY_REFRESH_TOKEN=${refreshToken}\n`;
  }

  fs.writeFileSync(envPath, content.trim() + '\n', 'utf-8');
}

function openBrowser(targetUrl: string): void {
  const startCmd =
    process.platform === 'win32'
      ? `start "" "${targetUrl}"`
      : process.platform === 'darwin'
      ? `open "${targetUrl}"`
      : `xdg-open "${targetUrl}"`;

  exec(startCmd, (err) => {
    if (err) {
      console.log(`\nPlease open this URL manually in your browser:\n${targetUrl}\n`);
    }
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:8888'}`);

  if (reqUrl.pathname !== CALLBACK_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const code = reqUrl.searchParams.get('code');
  const returnedState = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>Authorization Error</h1><p>${error}</p>`);
    console.error(`\n❌ Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  if (returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>State Mismatch</h1><p>Security validation failed.</p>');
    console.error('\n❌ State mismatch error during OAuth callback.');
    server.close();
    process.exit(1);
  }

  if (typeof code !== 'string') {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>Missing Code</h1>');
    server.close();
    process.exit(1);
  }

  try {
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
    }

    interface SpotifyTokenResponse {
      access_token: string;
      token_type: string;
      scope: string;
      expires_in: number;
      refresh_token: string;
    }

    const data = (await tokenRes.json()) as SpotifyTokenResponse;

    if (!data.refresh_token) {
      throw new Error('No refresh_token returned by Spotify.');
    }

    updateEnvFile(data.refresh_token);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Speed Song — Authorized</title></head>
        <body style="font-family: sans-serif; background: #0d0f12; color: #f0f4f8; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh;">
          <h1 style="color: #10b981;">⚡ Spotify Authorization Successful!</h1>
          <p>Your refresh token has been automatically saved to <code>.env</code>.</p>
          <p>You can close this tab and return to your terminal.</p>
        </body>
      </html>
    `);

    console.log('\n✅ Successfully authorized!');
    console.log('✅ SPOTIFY_REFRESH_TOKEN saved to .env');
    console.log('You can now run the build-time data pipeline.\n');

    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error exchanging code for token: ${msg}`);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Token Exchange Error</h1><p>${msg}</p>`);
    server.close(() => {
      process.exit(1);
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🎧 Speed Song Spotify Authorizer`);
  console.log(`Listening on ${REDIRECT_URI}`);
  console.log(`Opening browser for Spotify authorization...\n`);
  openBrowser(authUrl.toString());
});
