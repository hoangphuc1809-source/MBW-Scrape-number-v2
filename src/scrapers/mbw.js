const TGDD_LISTING = 'https://www.thegioididong.com/laptop';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const parseVNPrice = (s) => {
  const n = parseFloat((s || '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? String(Math.round(n)) : '';
};

function extractParam(sectionText, label) {
  const m = new RegExp(label + ':\\s*([\\s\\S]*?)(?=\\n\\s*\\n|$)').exec(sectionText || '');
  return m ? clean(m[1]) : '';
}

export async function scrapeMBW() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'vi-VN'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(TGDD_LISTING, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(4000);

    for (let i = 1; i <= 25; i++) {
      const candidates = page.locator(
        'a:has-text("Xem thêm"), button:has-text("Xem thêm"), strong:has-text("Xem thêm")'
      );
      const visibleCount = await candidates.count();
      let clicked = false;
      for (let j = 0; j < visibleCount; j++) {
        const el = candidates.nth(j);
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ force: true, timeout: 10000 }).catch(() => {});
          clicked = true;
          break;
        }
      }
      if (!clicked) break;
      await delay(2500);
    }

    const links = await page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const out = [];
      document.querySelectorAll('ul.listproduct li.item a.main-contain').forEach((a) => {
        const href = (a.getAttribute('href') || '').trim();
        if (!href || href === '#') return;
        const name = clean(a.getAttribute('data-name') || a.innerText || '');
        if (!name) return;
        out.push({
          name,
          href: href.startsWith('http') ? href : `https://www.thegioididong.com${href}`
        });
      });
      return out;
    });

    console.log(`[MBW] Listed links: ${links.length}`);
    const out = [];

    for (let i = 0; i < links.length; i++) {
      const { href, name } = links[i];
      try {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1200);

        const data = await page.evaluate((nameHint) => {
          const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
          const txt = (sel) => (document.querySelector(sel)?.innerText || '').trim();
          const txts = (sel) =>
            Array.from(document.querySelectorAll(sel))
              .map((el) => clean(el.innerText))
              .filter(Boolean);
          const parseVNPrice = (s) => {
            const n = parseFloat((s || '').replace(/[^\d]/g, ''));
            return Number.isFinite(n) ? String(Math.round(n)) : '';
          };

          const paramSection = (heading) => {
            const h = Array.from(document.querySelectorAll('h3')).find((x) => clean(x.innerText) === heading);
            if (!h) return '';
            let s = '';
            let el = h.parentElement?.nextElementSibling;
            while (el) {
              if (['H2', 'H3'].includes(el.tagName)) break;
              s += ' ' + clean(el.innerText);
              el = el.nextElementSibling;
            }
            return clean(s);
          };

          const cpu = paramSection('Bộ xử lý');
          const gpu = paramSection('Đồ hoạ (GPU)');
          const ram = paramSection('Bộ nhớ RAM, Ổ cứng');
          const screen = paramSection('Màn hình');
          const sizeWeight = paramSection('Kích thước - Khối lượng - Pin');

          const priceBoxText = txt('.box-price') || '';
          const priceText = txt('.box-price-present') || '';
          const oldPriceText = txt('.box-price-old') || '';
          const viewedText = txt('.viewed-product-price') || '';
          const statusText = txt('.product-status') || '';
          
          const servicePackText = txt('.box_saving') || '';
          const svcMatch = (servicePackText || '').match(/Gói\s+dịch\s+vụ\s+1\s+([\d.]+)₫\s+([\d.]+)₫/);
          const svcAltMatch = (servicePackText || '').match(/([\d.]+)₫\s*([\d.]+)₫\s*\(-?\d+%\)/);
          // Specific selectors inside .active to avoid label "Gói dịch vụ"
          const directSale = txt('.box_saving .active b') || txt('.box_saving .active > span > b:first-child') || txt('.box_saving strong') || txt('.box_saving .bs_price strong') || txt('.box_saving span b') || '';
          const directOrig = txt('.box_saving .active em') || txt('.box_saving .active > span > em') || txt('.box_saving .bs_price em') || txt('.box_saving em') || '';
          let svcHigher = '', svcLower = '';
          if (svcMatch) {
            const p1 = parseVNPrice(svcMatch[1]);
            const p2 = parseVNPrice(svcMatch[2]);
            svcHigher = String(Math.max(p1, p2));
            svcLower = String(Math.min(p1, p2));
          } else if (svcAltMatch) {
            const p1 = parseVNPrice(svcAltMatch[1]);
            const p2 = parseVNPrice(svcAltMatch[2]);
            svcHigher = String(Math.max(p1, p2));
            svcLower = String(Math.min(p1, p2));
          } else if (directSale && directOrig) {
            svcHigher = parseVNPrice(directOrig);
            svcLower = parseVNPrice(directSale);
          } else if (directSale) {
            svcLower = parseVNPrice(directSale);
          } else if (directOrig) {
            svcHigher = parseVNPrice(directOrig);
          } else {
            const ms = (servicePackText || '').match(/([\d.,]+)\s*₫/g);
            if (ms) {
              const prices = ms.map(s => parseVNPrice(s)).filter(Boolean);
              if (prices.length >= 2) {
                svcHigher = String(Math.max(...prices));
                svcLower = String(Math.min(...prices));
              } else if (prices.length === 1) {
                svcLower = String(prices[0]);
              }
            }
          }
          
          // Capture availability status like "Hàng sắp về", "Ngừng bán", "Tạm hết hàng"
          const availabilityText = (viewedText || '').replace(/\s+/g, ' ').trim();
          const isAvailability = /Hàng\s+sắp\s+về|Ngừng\s+bán|Tạm\s+hết\s+hàng|Đang\s+cập\s+nhật|Liên\s+hệ|Hết\s+hàng/i.test(viewedText);
          
          let origCandidate = '';
          let saleCandidate = '';
          if (isAvailability) {
            origCandidate = availabilityText;
            saleCandidate = availabilityText;
          } else {
            saleDiscountText = (viewedText && /-?\d+%/.test(viewedText)) ? viewedText : '';
            origCandidate = oldPriceText || svcHigher || priceText || priceBoxText || directOrig || '';
            saleCandidate = saleDiscountText || viewedText || directSale || svcLower || priceText || priceBoxText || '';
          }
          
          const discountText = (() => {
            const m = (priceBoxText || '').match(/-(\d+)%/);
            return m ? `-${m[1]}%` : '';
          })();
          const ratingText = txt('.vote-txt b') || txt('.box_rating b') || '';
          const sold = txt('.rating_Compare') || '';

          const weight = (() => {
            const m = (sizeWeight || '').match(/([\d.,]+)\s*kg/);
            return m ? clean(m[0]) : '';
          })();

          const cpuShort = (() => {
            const m = (cpu || '').match(/Công nghệ CPU:\s*(.+?)\s*(?=Số nhân:|Số luồng:|Tốc độ CPU:|Lên đến|$)/);
            const raw = m ? (m[1] || '').trim() : '';
            const cleaned = raw.replace(/\s*-\s*$/, '').trim();
            return clean(cleaned);
          })();

          const gpuShort = (() => {
            const m = (gpu || '').match(/Card màn hình:\s*([^,\n]+)/);
            return m ? clean(m[1]) : '';
          })();

          const ramShort = (() => {
            const m = (ram || '').match(/(\d+\s*GB)/i);
            return m ? clean(m[1].toUpperCase()) : '';
          })();

          const storageShort = (() => {
            const m = (ram || '').match(/(\d+\s*(?:GB|TB)\s*SSD)/i);
            return m ? clean(m[1].toUpperCase()) : '';
          })();

          const screenShort = (() => {
            const out = [];
            const sizeM = (screen || '').match(/Kích thước màn hình:\s*([^,\n]+)/);
            const resM = (screen || '').match(/Độ phân giải:\s*([^,\n]+)/);
            if (sizeM) out.push(clean(sizeM[1]));
            if (resM) out.push(clean(resM[1]));
            return out.join(', ');
          })();

          const brandGuess = (() => {
            const knownBrands = [
              'HP','Dell','Lenovo','Asus','Acer','Apple','MSI','Microsoft',
              'Samsung','LG','Toshiba','Fujitsu','Razer','Huawei','Xiaomi','Realme','Infinix',
              'Nvidia','Nintendo','Sony','Intel','AMD'
            ];
            const n = (nameHint || txt('h1') || '').replace(/^Laptop\s+/i,'');
            const m = n.match(/^([A-Za-z][A-Za-z0-9\-]+)/);
            if (m) {
              const cand = m[1];
              if (knownBrands.includes(cand)) return cand;
            }
            const hit = knownBrands.find((b) => new RegExp('\\b' + b + '\\b','i').test(n));
            return hit || '';
          })();

          return {
            dealer: 'MBW',
            name: txt('h1') || nameHint,
            brand: brandGuess,
            cpu: cpuShort,
            ram: ramShort,
            storage: storageShort,
            screen: screenShort,
            gpu: gpuShort,
            weight,
            origPrice: parseVNPrice(origCandidate),
            salePrice: parseVNPrice(saleCandidate),
            discount: clean(discountText),
            sold: clean(sold),
            rating: clean(ratingText),
            link: location.href,
            scrapedAt: new Date().toISOString()
          };
        }, name);

        out.push(data);
      } catch (e) {
        out.push({
          dealer: 'MBW',
          name,
          brand: '',
          cpu: '',
          ram: '',
          storage: '',
          screen: '',
          gpu: '',
          weight: '',
          origPrice: '',
          salePrice: '',
          discount: '',
          sold: '',
          rating: '',
          link: href,
          scrapedAt: new Date().toISOString()
        });
      }

      if (i % 20 === 0) console.log(`[MBW] detail ${i + 1}/${links.length}`);
    }

    console.log(`[MBW] Total: ${out.length} products`);
    return out;
  } finally {
    await browser.close();
  }
}
