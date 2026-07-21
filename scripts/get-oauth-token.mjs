import http from 'http';
import url from 'url';
import open from 'open';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientSecretPath = join(__dirname, '..', 'oauth-client.json');
const tokenPath = join(__dirname, '..', 'token.json');

const keys = JSON.parse(readFileSync(clientSecretPath, 'utf8'));
const oAuth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  keys.installed.redirect_uris[0]
);

const authorizeUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
});

console.log('Opening browser for authorization...');
await open(authorizeUrl);

const server = http.createServer(async (req, res) => {
  const qs = url.parse(req.url, true).query;
  if (qs.code) {
    try {
      const { tokens } = await oAuth2Client.getToken(qs.code);
      writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
      console.log('Token saved to', tokenPath);
      console.log('Refresh token:', tokens.refresh_token ? 'YES' : 'NO');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Success! Token saved. You can close this tab.</h1>');
    } catch (e) {
      console.error('Error getting token:', e.message);
      res.writeHead(500);
      res.end('Error: ' + e.message);
    } finally {
      server.close();
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Waiting for authorization...</h1>');
  }
});

server.listen(3001, () => console.log('Listening on http://localhost:3001'));
