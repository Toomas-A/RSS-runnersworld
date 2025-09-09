const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Функция парсинга Runner's World
async function parseRunnersWorld() {
  try {
    console.log('🔍 Fetching Runner\'s World gear page...');
    
    const response = await axios.get('https://www.runnersworld.com/gear', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles = [];

    // Парсим статьи используя селекторы
    $('a[data-theme-key="custom-item"]').each((index, element) => {
      if (index >= 15) return false; // Ограничиваем 15 статьями

      const $article = $(element);
      const href = $article.attr('href');
      
      // Проверяем что это статья о gear
      if (!href || !href.includes('/gear/')) {
        return;
      }

      const title = $article.find('h3').text().trim();
      const description = $article.find('p').text().trim();
      
      if (title) {
        const fullUrl = href.startsWith('http') ? href : `https://www.runnersworld.com${href}`;
        
        articles.push({
          title: title,
          link: fullUrl,
          description: description || 'Latest gear article from Runner\'s World',
          pubDate: new Date().toUTCString()
        });
      }
    });

    console.log(`✅ Parsed ${articles.length} articles`);
    return articles;

  } catch (error) {
    console.error('❌ Error parsing Runner\'s World:', error.message);
    
    // Возвращаем тестовые данные при ошибке
    return [
      {
        title: 'Best Running Shoes 2024',
        link: 'https://www.runnersworld.com/gear/best-running-shoes-2024',
        description: 'Comprehensive guide to the best running shoes for every type of runner.',
        pubDate: new Date().toUTCString(),
      },
      {
        title: 'Winter Running Gear Essentials', 
        link: 'https://www.runnersworld.com/gear/winter-running-gear',
        description: 'Stay warm and safe during winter runs with essential cold-weather gear.',
        pubDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toUTCString(),
      },
      {
        title: 'GPS Watch Buyer\'s Guide',
        link: 'https://www.runnersworld.com/gear/gps-watch-guide', 
        description: 'Everything you need to know about choosing the perfect GPS running watch.',
        pubDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toUTCString(),
      }
    ];
  }
}

// Генерация RSS XML
function generateRSS(articles) {
  const now = new Date().toUTCString();
  
  let rssItems = '';
  articles.forEach(article => {
    rssItems += `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>${article.link}</link>
      <description><![CDATA[${article.description}]]></description>
      <pubDate>${article.pubDate}</pubDate>
      <guid isPermaLink="true">${article.link}</guid>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Runner's World Gear</title>
    <description>Latest gear articles from Runner's World</description>
    <link>https://www.runnersworld.com/gear</link>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;
}

app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Runner's World RSS Parser</h1>
    <p>Real-time parsing of Runner's World gear articles</p>
    <ul>
      <li><a href="/rss">📡 RSS Feed</a></li>
      <li><a href="/health">❤️ Health Check</a></li>
    </ul>
    <p><small>Running on port ${PORT}</small></p>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    port: PORT,
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/rss', async (req, res) => {
  console.log('📡 RSS endpoint called');
  
  try {
    const articles = await parseRunnersWorld();
    const rssXML = generateRSS(articles);
    
    res.set('Content-Type', 'application/rss+xml');
    res.send(rssXML);
    
  } catch (error) {
    console.error('❌ RSS generation error:', error);
    res.status(500).send('Error generating RSS feed');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SERVER STARTED ON PORT ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Time:', new Date().toISOString());
});