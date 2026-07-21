const FPT_LISTING = 'https://fptshop.com.vn/may-tinh-xach-tay';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

const CPU_RE = /(?:Intel\s+Core\s+(?:Ultra\s+)?i?\d+\s+-?\s*\w{2,}|AMD\s+Ryzen\s+\d+\s+-?\s*\w{2,}|Apple\s+M\d+)\b/i;
const RAM_RE = /RAM\s+(\d+\s*GB)/i;
const GPU_RE = /Card\s+đồ\s+hoạ\s+([^\n\r]+?)(?:\n|Kích\s|Tấm\s|Trọng\s|Ổ\s+cứng\s|$)/i;
const SSD_RE = /Ổ\s+cứng\s+SSD\s+(\d+\s*GB)/i;
const SCREEN_RE = /Kích\s+thước\s+màn\s+hình\s+([^\n\r]+?)(?:\s+Tấm\s|$)/i;
const SCREEN_TECH_RE = /Tấm\s+nền\s+([^\n\r]+)/i;
const WEIGHT_RE = /(?:Trọng\s+lượng|Khối\s+lượng)\s+([\d.,]+\s*kg)/i;
const PRICE_RE = /(\d{1,3}(?:\.\d{3})+)\s*đ?/g;

function extractFromBody(body, h1) {
  const n = clean(h1 || '');
  const b = clean(body || '') + ' ' + n;
  const cpu = (b.match(CPU_RE) || [])[0] || '';
  const ram = (b.match(RAM_RE) || [])[1] || '';
  const gpu = (b.match(GPU_RE) || [])[1] || '';
  const storage = (b.match(SSD_RE) || [])[1] || '';
  const screen = (b.match(SCREEN_RE) || [])[1] || '';
  const screenTech = (b.match(SCREEN_TECH_RE) || [])[1] || '';
  const weight = (b.match(WEIGHT_RE) || [])[1] || '';

  const prices = [];
  let m;
  while ((m = PRICE_RE.exec(b))) prices.push(m[1]);
  PRICE_RE.lastIndex = 0;

  const asNumber = (p) => parseInt(p.replace(/\./g,''),10);
  const seen = new Set();
  const unique = [];
  for (const p of prices) {
    const n = asNumber(p);
    if (!seen.has(n) && n >= 500_000) { seen.add(n); unique.push(p); }
  }
  const [lo, hi] = unique;
  const origPrice = hi || lo || '';
  const salePrice = lo || hi || '';

  return {
    name: n,
    cpu,
    ram: ram ? `${ram.replace(/\s*GB$/,'')} GB` : '',
    storage: storage ? `SSD ${storage.replace(/\s*GB$/,'')}` : '',
    screen: screen ? `${screen}${screenTech ? ' ' + screenTech : ''}`.trim() : '',
    gpu,
    weight: weight ? weight.replace(',','.') : '',
    origPrice,
    salePrice,
  };
}

export async function scrapeFPT() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(FPT_LISTING, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await delay(4000);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);

    const MAX_LOAD_MORE = 80;
    for (let i = 0; i < MAX_LOAD_MORE; i++) {
      const btnText = await page.evaluate(() => {
        const c = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const btn = [...document.querySelectorAll('button')].find(
          (b) => /^Xem thêm\s+\d+\s+kết quả$/.test(c((b.innerText || '')).trim())
        );
        return btn ? c((btn.innerText || '')).trim() : '';
      });
      if (!btnText) break;
      try {
        await page.evaluate(() => {
          const c = (s) => (s || '').replace(/\s+/g, ' ').trim();
          const btn = [...document.querySelectorAll('button')].find(
            (b) => /^Xem thêm\s+\d+\s+kết quả$/.test(c((b.innerText || '')).trim())
          );
          if (btn) {
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn.click();
          }
        });
      } catch (e) {
        console.log('[FPT] load-more click failed', e.message.slice(0, 80));
      }
      await delay(4000);
    }

    const cards = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="may-tinh-xach-tay/"][title]').forEach((linkEl) => {
        const href = linkEl.getAttribute('href') || '';
        const link = href.startsWith('http') ? href : 'https://fptshop.com.vn' + href;
        if (!href || seen.has(link)) return;
        seen.add(link);
        const name = linkEl.getAttribute('title')?.trim() || linkEl.innerText.trim() || '';
        if (name && name.length >= 5) {
          out.push({ name, link });
        }
      });
      return out;
    });

    const CONCURRENT = 4;
    const out = [];
    for (let i = 0; i < cards.length; i += CONCURRENT) {
      const batch = cards.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(async (card) => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(card.link, { waitUntil: 'domcontentloaded', timeout: 120000 });
            await delay(3000);
            const raw = await detailPage.evaluate(() => {
              const c = (s) => (s || '').replace(/\s+/g, ' ').trim();
              const bodyText = c(document.body.innerText);
              const h1Text = c(document.querySelector('h1')?.innerText || '');
              const linkText = location.href;
              return JSON.stringify({ bodyText, h1Text, link: linkText });
            });
            const { bodyText, h1Text, link } = JSON.parse(raw);
            const data = extractFromBody(bodyText, h1Text);
            return { ...data, dealer: 'FPT', link, scrapedAt: new Date().toISOString(), cardName: card.name };
          } catch (e) {
            console.log(`[FPT] detail failed for ${card.link}: ${e.message.slice(0, 120)}`);
            return null;
          } finally {
            await detailPage.close();
          }
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.name) out.push(r.value);
      }
      console.log(`[FPT] batch ${Math.min(i + CONCURRENT, cards.length)}/${cards.length} -> collected ${out.length}`);
    }

    console.log(`[FPT] -> ${out.length} SP`);
    return out;
  } finally {
    await browser.close();
  }
}
