const axios = require('axios');
const xml2js = require('xml2js');

const NCTS_SYND_URL = 'https://api.healthterminologies.gov.au/syndication/v1/syndication.xml';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const response = await axios.get(NCTS_SYND_URL, {
      headers: { Authorization: token },
      responseType: 'text',
      timeout: 25000,
    });

    const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
    const result = await parser.parseStringPromise(response.data);
    const feed = result.feed;
    const entries = feed.entry || [];

    const artefacts = entries.map(entry => {
      const category = entry.category?.[0]?.$ || {};
      const links = (entry.link || []).map(l => l.$ || l);
      const downloadLink = links.find(l => l.rel === 'enclosure' || l.rel === 'alternate');
      return {
        id:             entry.id?.[0] || '',
        title:          entry.title?.[0]?._ || entry.title?.[0] || '',
        summary:        entry.summary?.[0]?._ || entry.summary?.[0] || '',
        published:      entry.published?.[0] || '',
        updated:        entry.updated?.[0] || '',
        categoryTerm:   category.term || '',
        categoryLabel:  category.label || '',
        categoryScheme: category.scheme || '',
        contentVersion: entry['ncts:contentItemVersion']?.[0]?._ || entry['ncts:contentItemVersion']?.[0] || '',
        downloadHref:   downloadLink?.href || '',
        downloadType:   downloadLink?.type || '',
        downloadLength: downloadLink?.length || '',
      };
    });

    const byCategory = {};
    artefacts.forEach(a => {
      const key = a.categoryTerm || 'Unknown';
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(a);
    });

    res.json({
      feedTitle:   feed.title?.[0]?._ || feed.title?.[0] || 'NCTS Syndication Feed',
      feedUpdated: feed.updated?.[0] || '',
      totalCount:  artefacts.length,
      categories:  Object.keys(byCategory).map(k => ({ term: k, count: byCategory[k].length })),
      artefacts,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: 'Failed to fetch syndication feed', detail: err.message });
  }
};
