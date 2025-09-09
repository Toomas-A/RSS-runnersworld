const axios = require('axios');
const cheerio = require('cheerio');

// Тестовые данные
const testArticles = [
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

// Пока возвращаем тестовые данные
async function parseRunnersWorldGear() {
  console.log('Using test articles for now');
  return testArticles;
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

module.exports = {
  parseRunnersWorldGear,
  generateRSS
};