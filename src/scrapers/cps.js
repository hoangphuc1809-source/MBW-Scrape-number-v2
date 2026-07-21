const CPS_LISTING = 'https://cellphones.com.vn/laptop.html';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const parseVNPrice = (s) => {
  const n = parseFloat((s || '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? String(Math.round(n)) : '';
};

function guessBrand(name, body) {
  const known = ['MSI','ASUS','ACER','LENOVO','HP','DELL','APPLE','MACBOOK','SAMSUNG','GIGABYTE','RAZER','LG','MICROSOFT','HONOR','REALME','XIAOMI','REDMI'];
  const hay = ((name || '') + ' ' + (body || '')).toUpperCase();
  for (const b of known) { if (hay.includes(b)) return b; }
  const m = (name || '').match(/^([A-Za-z][A-Za-z0-9\-]+)/);
  return m ? m[1] : '';
}

export async function scrapeCPS() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', viewport: { width: 1280, height: 900 }, locale: 'vi-VN' });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(CPS_LISTING, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(4000);

    // Remove overlays/blockers first
    await page.evaluate(() => {
      document.querySelectorAll('#subscriberEmailOverlay, #subscriberEmail, .teleport-modal_main.start, .subscriber-popup, .block-top-sliding-banner, iframe').forEach(el => el.remove());
    });
    try { await page.waitForSelector('#subscriberEmailOverlay, .teleport-modal_main.start, .subscriber-popup', { state: 'hidden', timeout: 3000 }); } catch (e) {}

    // CPS load-more: click load-more button until no more (verified by probe)
    const CPS_BTN = 'button.btn-show-more.button__show-more-p, a.btn-show-more';
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1200);
      const btnText = await page.evaluate(() => {
        const btn = document.querySelector('button.btn-show-more.button__show-more-p, a.btn-show-more');
        return btn ? btn.innerText.replace(/\s+/g,' ').trim() : '';
      });
      if (!btnText) break;
      try {
        await page.evaluate(() => {
          const btn = document.querySelector('button.btn-show-more.button__show-more-p, a.btn-show-more');
          if (!btn) return;
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
        });
      } catch (e) {
        console.log('[CPS] click failed, retrying scroll', e.message.slice(0,100));
      }
      await delay(2000);
    }

    console.log(`[CPS] loadMore click_attempts done`);

    const cards = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const items = [];
      document.querySelectorAll('.product-info-container.product-item').forEach((card) => {
        const link = card.querySelector('a.product__link');
        const titleEl = card.querySelector('.product__name h3');
        const priceEl = card.querySelector('.product__price--show');
        const oldPriceEl = card.querySelector('.product__price--through');
        const discountEl = card.querySelector('.product__price--percent-detail');
        const timeEl = card.querySelector('.block-smem-time');
        const name = titleEl ? titleEl.innerText.trim() : '';
        const href = link ? link.getAttribute('href') : '';
        if (!name || !href) return;
        items.push({
          name: clean(name),
          href: href.startsWith('http') ? href : `https://cellphones.com.vn${href}`,
          price: priceEl ? clean(priceEl.innerText) : '',
          oldPrice: oldPriceEl ? clean(oldPriceEl.innerText) : '',
          discount: discountEl ? clean(discountEl.innerText) : '',
          time: timeEl ? clean(timeEl.innerText) : ''
        });
      });
      return items;
    });

    console.log('[CPS] Listed cards:', cards.length);

    const CONCURRENT = 5;
    const out = [];
    let detailOk = 0;
    let detailFail = 0;

    const detailEval = (nameHint) => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const txt = (sel) => (document.querySelector(sel)?.innerText || '').trim();
      const bodyText = clean(document.body.innerText);

      const specSection = Array.from(document.querySelectorAll('section,div')).find(x => {
        const t = clean(x.innerText);
        return t.startsWith('Thông số kỹ thuật') && t.length < 4000;
      });
      const specs = {};
      if (specSection) {
        specSection.querySelectorAll('td').forEach(td => {
          const label = clean(td.innerText);
          const next = td.nextElementSibling;
          const value = next ? clean(next.innerText) : '';
          if (label && value) specs[label] = value;
        });
      }
      const cpu = (() => {
        const raw = specs['Loại CPU'] || specs['CPU'] || '';
        const m = raw.match(/(?:AMD Ryzen|Intel Core|Apple M\d|Core Ultra)[\w\s\-.]*/i);
        return m ? m[0].replace(/\s+/g, ' ').trim() : raw;
      })();
      const gpu = specs['Loại card đồ họa'] || specs['Card đồ họa'] || specs['GPU'] || '';
      const ram = (() => {
        const raw = specs['Dung lượng RAM'] || specs['RAM'] || '';
        const m = raw.match(/\d+\s*GB/i);
        return m ? m[0].toUpperCase() : raw;
      })();
      const storage = (() => {
        const raw = specs['Ổ cứng'] || specs['SSD'] || '';
        const m = raw.match(/\d+\s*(?:GB|TB)\s*SSD/i);
        return m ? m[0].toUpperCase() : raw;
      })();
      const screen = specs['Kích thước màn hình'] || specs['Màn hình'] || '';
      const weight = specs['Khối lượng'] || specs['Trọng lượng'] || '';

      const bodyHasContact = /Liên\s+hệ\s+để\s+báo\s+giá|Đăng\s+ký\s+nhận\s+thông\s+tin|SẮP\s+VỀ\s+HÀNG|Liên\s+hệ\s+\d{3,}/.test(bodyText);
      const txts = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => clean(e.innerText));
      const saleFromClass = txts('.sale-price').find((s) => s);
      const oldFromClass = txts('.base-price').find((s) => s);
      const saleRaw = saleFromClass || '';
      const oldRaw = oldFromClass || '';
      const salePrice = bodyHasContact && !/\d/.test(String(saleRaw)) ? '' : saleRaw;
      const oldPrice = bodyHasContact && !/\d/.test(String(oldRaw)) ? '' : oldRaw;

      const m = (nameHint || '').match(/^([A-Za-z][A-Za-z0-9\-]+)/);
      return {
        name: nameHint,
        dealer: 'CPS',
        brand: m ? m[1] : '',
        cpu,
        gpu,
        ram,
        storage,
        screen,
        weight,
        origPrice: clean(oldPrice),
        salePrice: clean(salePrice),
        discount: '',
        sold: '',
        rating: '',
        link: location.href,
        scrapedAt: new Date().toISOString()
      };
    };

    for (let i = 0; i < cards.length; i += CONCURRENT) {
      const batch = cards.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map(async (card) => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(card.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await delay(2000);
            const data = await detailPage.evaluate(detailEval, card.name);
            detailOk++;
            if (detailOk % 20 === 0) console.log(`[CPS] detail progress ${detailOk}/${cards.length}`);
            return data;
          } catch (err) {
            detailFail++;
            if (detailFail <= 5) console.log(`[CPS] detail failed ${card.href}: ${err.message.slice(0, 80)}`);
            return null;
          } finally {
            await detailPage.close();
          }
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.name) out.push(r.value);
      }
    }

    console.log('[CPS] detail finished', { detailOk, detailFail, collected: out.length });
    return out;
  } finally {
    await browser.close();
  }
}
