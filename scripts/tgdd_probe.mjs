import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const out = path.join(process.env.LOCALAPPDATA, 'Temp', 'tgdd_many.png');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'vi-VN'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto('https://www.thegioididong.com/laptop', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  for (let i = 1; i <= 25; i++) {
    const has = await page.getByText('Xem thêm').count();
    if (!has) { console.log('NO_BUTTON', i); break; }
    await page.getByText('Xem thêm').first().click();
    await page.waitForTimeout(2500);
    const c = await page.evaluate(() => ({
      ulItems: document.querySelectorAll('ul.listproduct li.item').length,
      linkItems: document.querySelectorAll('a.main-contain').length
    }));
    console.log('click', i, JSON.stringify(c));
    if (c.linkItems >= 460) break;
  }

  const names = await page.evaluate(() =>
    [...document.querySelectorAll('ul.listproduct li.item a.main-contain')]
      .slice(0, 20)
      .map(el => (el.getAttribute('data-name') || el.innerText.trim()).replace(/\s+/g,' ').slice(0, 60))
  );
  console.log('sampleNames', JSON.stringify(names, null, 2));
  await page.screenshot({ path: out, fullPage: false });
  console.log('screenshot', out);
  await browser.close();
})();
