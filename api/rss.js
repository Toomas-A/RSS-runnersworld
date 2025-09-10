const axios = require('axios');
const cheerio = require('cheerio');

function toRFC822(iso) {
  const d = new Date(iso);
  return isNaN(d) ? null : d.toUTCString();
}

// Ограничитель параллелизма без внешних пакетов
async function mapLimit(items, limit, worker) {
  const ret = [];
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return ret;
}

async function fetchHtml(url, timeout = 8000) {
  const resp = await axios.get(url, {
    timeout,
    maxRedirects: 3,
    headers: {
      'User-Agent':
        process.env.USER_AGENT ||
        'Mozilla/5.0 (compatible; RSSFetcher/1.0; +https://example.com)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.8'
    }
  });
  return resp.data;
}

async function parseList(limit = 15) {
  const html = await fetchHtml('https://www.runnersworld.com/gear', 10000);
  const $ = cheerio.load(html);
  const items = [];

  $('a[data-theme-key="custom-item"]').each((_, el) => {
    if (items.length >= limit) return false;
    const $a = $(el);
    const href = $a.attr('href');
    if (!href || !href.includes('/gear/')) return;

    const url = href.startsWith('http') ? href : `https://www.runnersworld.com${href}`;
    const title = $a.find('h3').text().trim() || $a.text().trim();
    if (!title) return;

    const description =
      $a.find('p').first().text().trim() ||
      "Latest gear article from Runner's World";

    items.push({ title, link: url, description });
  });

  return items;
}

function buildRss(items) {
  const now = new Date().toUTCString();
  const xmlItems = items
    .map((a) => {
      const pub = a.pubDate ? `<pubDate>${a.pubDate}</pubDate>` : '';
      return `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <description><![CDATA[${a.description || ''}]]></description>
      ${pub}
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

async function enrichWithDates(items) {
  // Тянем не больше 10 страниц за раз для скорости/надёжности
  const capped = items.slice(0, Math.min(items.length, 10));

  const enriched = await mapLimit(capped, 3, async (item) => {
    try {
      const html = await fetchHtml(item.link, 7000);
      const $ = cheerio.load(html);

      // 1) Стандартная OpenGraph/Article разметка
      let iso =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[name="parsely-pub-date"]').attr('content') ||
        $('time[datetime]').attr('datetime');

      const rfc = iso ? toRFC822(iso) : null;

      // Если получилось — добавляем pubDate
      if (rfc) {
        return { ...item, pubDate: rfc };
      }

      // Фолбэк: оставляем без pubDate (Make будет дедупить по GUID)
      return item;
    } catch (e) {
      // Ошибка конкретной статьи не должна ломать ленту
      return item;
    }
  });

  // Плюс «хвост» без углубления (если limit > 10)
  return enriched.concat(items.slice(enriched.length));
}

module.exports = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '15', 10), 50);

    // 1) список карточек
    let items = await parseList(limit);

    // 2) добавляем даты (стабильные) для первых N
    items = await enrichWithDates(items);

    // 3) сортируем по pubDate (если есть)
    items.sort((a, b) => {
      const da = a.pubDate ? Date.parse(a.pubDate) : 0;
      const db = b.pubDate ? Date.parse(b.pubDate) : 0;
      return db - da;
    });

    const xml = buildRss(items);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  } catch (err) {
    console.error('rss handler error:', err);
    // Минимальный фолбэк с неизменяемым GUID и без pubDate
    const xml = buildRss([
      {
        title: "Runner's World – sample item",
        link: 'https://www.runnersworld.com/gear/',
        description: 'Fallback item due to fetch error.'
      }
    ]);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  }
};
