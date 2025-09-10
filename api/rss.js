const axios = require('axios');
const cheerio = require('cheerio');

function buildRss(items) {
  const now = new Date().toUTCString();
  const xmlItems = items.map(a => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <description><![CDATA[${a.description || ''}]]></description>
      <pubDate>${a.pubDate}</pubDate>
      <guid isPermaLink="true">${a.link}</guid>
    </item>`).join('\n');

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

async function parseRunnersWorld(limit = 15) {
  try {
    const resp = await axios.get('https://www.runnersworld.com/gear', {
      timeout: 10000,
      maxRedirects: 3,
      headers: {
        'User-Agent': process.env.USER_AGENT ||
          'Mozilla/5.0 (compatible; RSSFetcher/1.0; +https://example.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.8'
      }
    });

    const $ = cheerio.load(resp.data);
    const items = [];
    $('a[data-theme-key="custom-item"]').each((i, el) => {
      if (items.length >= limit) return false;
      const $a = $(el);
      const href = $a.attr('href');
      if (!href || !href.includes('/gear/')) return;

      const title = $a.find('h3').text().trim() || $a.text().trim();
      if (!title) return;

      const url = href.startsWith('http') ? href : `https://www.runnersworld.com${href}`;
      const description = $a.find('p').first().text().trim() ||
        "Latest gear article from Runner's World";

      items.push({
        title,
        link: url,
        description,
        pubDate: new Date().toUTCString()
      });
    });

    return items;
  } catch (e) {
    console.warn('parse error:', e.message);
    // Фолбэк, чтобы лента не была пустой при ошибке
    return [{
      title: 'Runner’s World – sample item',
      link: 'https://www.runnersworld.com/gear/',
      description: 'Fallback item due to fetch error.',
      pubDate: new Date().toUTCString()
    }];
  }
}

module.exports = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '15', 10), 50);
    const items = await parseRunnersWorld(limit);
    const xml = buildRss(items);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  } catch (err) {
    console.error('rss handler error:', err);
    res.status(500).send('RSS generation failed');
  }
};
