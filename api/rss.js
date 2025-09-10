const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Преобразование ISO → RFC822 для RSS
 */
function toRFC822(iso) {
  const d = new Date(iso);
  return isNaN(d) ? null : d.toUTCString();
}

/**
 * Скачиваем HTML с таймаутом
 */
async function fetchHtml(url, timeout = 8000) {
  const resp = await axios.get(url, {
    timeout,
    maxRedirects: 3,
    headers: {
      'User-Agent':
        process.env.USER_AGENT ||
        'Mozilla/5.0 (compatible; RSSFetcher/1.0; +https://example.com)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.8',
    },
  });
  return resp.data;
}

/**
 * Пробуем вытащить дату публикации из HTML статьи
 */
function extractDateFromArticle($) {
  // 1) OpenGraph / Article
  let iso =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="parsely-pub-date"]').attr('content') ||
    $('time[datetime]').attr('datetime');

  // 2) JSON-LD
  if (!iso) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).contents().text();
        if (!text) return;
        const data = JSON.parse(text.trim());
        const arr = Array.isArray(data) ? data : [data];
        for (const node of arr) {
          if (node && typeof node === 'object') {
            if (node.datePublished) {
              iso = node.datePublished;
              break;
            }
            if (node.dateCreated) {
              iso = node.dateCreated;
              break;
            }
          }
        }
      } catch (_) {}
    });
  }

  // 3) OpenGraph updated_time
  if (!iso) {
    iso = $('meta[property="og:updated_time"]').attr('content') || null;
  }

  return iso ? toRFC822(iso) : null;
}

/**
 * Псевдодата на основе URL (стабильная между запусками)
 */
function stablePseudoDateFromUrl(url) {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) >>> 0;
  }
  const base = Date.UTC(2005, 0, 1, 0, 0, 0);
  const offsetMs = (h % 1800) * 24 * 3600 * 1000; // до ~1800 дней
  return new Date(base + offsetMs).toUTCString();
}

/**
 * Простой ограничитель параллельности
 */
async function mapLimit(items, limit, worker) {
  const res = new Array(items.length);
  let i = 0;
  const pool = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        res[idx] = await worker(items[idx], idx);
      }
    });
  await Promise.all(pool);
  return res;
}

/**
 * Парсим список статей с https://www.runnersworld.com/gear
 */
async function parseList(limit = 15) {
  const html = await fetchHtml('https://www.runnersworld.com/gear', 10000);
  const $ = cheerio.load(html);
  const items = [];

  $('a[data-theme-key="custom-item"]').each((_, el) => {
    if (items.length >= limit) return false;
    const $a = $(el);
    const href = $a.attr('href');
    if (!href || !href.includes('/gear/')) return;

    const url = href.startsWith('http')
      ? href
      : `https://www.runnersworld.com${href}`;
    const title = $a.find('h3').text().trim() || $a.text().trim();
    if (!title) return;

    const description =
      $a.find('p').first().text().trim() ||
      "Latest gear article from Runner's World";

    items.push({ title, link: url, description });
  });

  return items;
}

/**
 * Обогащаем элементы датами (реальными или псевдо)
 */
async function enrichWithDates(items) {
  return mapLimit(items, 3, async (item) => {
    try {
      const html = await fetchHtml(item.link, 7000);
      const $ = cheerio.load(html);
      const rfc = extractDateFromArticle($);

      if (rfc) {
        return { ...item, pubDate: rfc };
      } else {
        return { ...item, pubDate: stablePseudoDateFromUrl(item.link) };
      }
    } catch (_) {
      return { ...item, pubDate: stablePseudoDateFromUrl(item.link) };
    }
  });
}

/**
 * Сборка RSS XML
 */
function buildRss(items) {
  const now = new Date().toUTCString();
  const xmlItems = items
    .map((a) => {
      return `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <description><![CDATA[${a.description || ''}]]></description>
      <pubDate>${a.pubDate}</pubDate>
      <guid isPermaLink="true">${a.link}</guid>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Runner's World – Gear</title>
    <description>Latest gear articles from Runner's World</description>
    <link>https://www.runnersworld.com/gear</link>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    ${xmlItems}
  </channel>
</rss>`;
}

/**
 * Handler для Vercel
 */
module.exports = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '15', 10), 50);

    // 1) список
    let items = await parseList(limit);

    // 2) даты
    items = await enrichWithDates(items);

    // 3) сортировка по дате
    items.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));

    // 4) выдаём RSS
    const xml = buildRss(items);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  } catch (err) {
    console.error('rss handler error:', err);
    const xml = buildRss([
      {
        title: "Runner's World – sample item",
        link: 'https://www.runnersworld.com/gear/',
        description: 'Fallback item due to fetch error.',
        pubDate: new Date().toUTCString(),
      },
    ]);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  }
};
