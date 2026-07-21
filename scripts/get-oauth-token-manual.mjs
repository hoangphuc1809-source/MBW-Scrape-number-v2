import { readFileSync, writeFileSync } from 'fs';
import { google } from 'googleapis';

const keys = JSON.parse(readFileSync('oauth-client.json', 'utf8'));
const oAuth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  'http://localhost'
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
  prompt: 'consent',
});

console.log('\n=== GOOGLE OAUTH ===');
console.log('1. Mở URL: ' + authUrl);
console.log('\n2. Đăng nhập Google, click "Continue" / "Allow"');
console.log('3. Cuối trình duyệt sẽ hiện một đoạn text');
console.log('4. Copy đoạn text đó và paste vào đây');
console.log('5. Backend sẽ tự lấy token.\n');

import { createInterface } from 'readline';
const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste final URL or code here: ', async (raw) => {
  const trimmed = raw.trim();
  let code;
  try {
    if (trimmed.includes('code=')) {
      code = new URL(trimmed).searchParams.get('code');
    } else {
      code = trimmed;
    }
    if (!code) throw new Error('No code found in input');
    const { tokens } = await oAuth2Client.getToken(code);
    writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    console.log('\n✅ SUCCESS! Token saved to token.json');
    console.log('Refresh token:', tokens.refresh_token ? 'YES' : 'NO');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
});
