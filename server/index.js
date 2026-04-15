const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const NCTS_TOKEN_URL  = 'https://api.healthterminologies.gov.au/oauth2/token';
const NCTS_SYND_URL   = 'https://api.healthterminologies.gov.au/syndication/v1/syndication.xml';
const NCTS_FHIR_BASE  = 'https://api.healthterminologies.gov.au/integration/v2/fhir';

// Fields fetched for every resource type (replaces _summary=true so we get
// description, purpose, copyright, contact, compose etc. for audit analysis).
const BASE_ELEMENTS = [
  'id', 'url', 'name', 'title', 'status', 'experimental',
  'date', 'publisher', 'description', 'purpose', 'copyright',
  'contact', 'useContext', 'jurisdiction',
].join(',');

const EXTRA_ELEMENTS = {
  CodeSystem: ',count',        // concept count
  ValueSet:   ',compose',      // for cross-reference integrity checks
  ConceptMap: ',sourceScope,targetScope',
  NamingSystem: ',uniqueId',
};

// ─── Auth Token ───────────────────────────────────────────────────────────────
app.post('/api/token', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await axios.post(NCTS_TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: 'Authentication failed', detail: err.response?.data || err.message });
  }
});

// ─── CapabilityStatement ──────────────────────────────────────────────────────
app.get('/api/metadata', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const response = await axios.get(`${NCTS_FHIR_BASE}/metadata`, {
      headers: { Authorization: token, Accept: 'application/fhir+json' },
      timeout: 20000,
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: 'Failed to fetch CapabilityStatement', detail: err.message });
  }
});

// ─── TerminologyCapabilities ──────────────────────────────────────────────────
app.get('/api/terminology-capabilities', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const response = await axios.get(`${NCTS_FHIR_BASE}/metadata?mode=terminology`, {
      headers: { Authorization: token, Accept: 'application/fhir+json' },
      timeout: 20000,
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: 'Failed to fetch TerminologyCapabilities', detail: err.message });
  }
});

// ─── Syndication Feed ─────────────────────────────────────────────────────────
app.get('/api/syndication', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const response = await axios.get(NCTS_SYND_URL, {
      headers: { Authorization: token },
      responseType: 'text',
      timeout: 30000,
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
        id:              entry.id?.[0] || '',
        title:           entry.title?.[0]?._ || entry.title?.[0] || '',
        summary:         entry.summary?.[0]?._ || entry.summary?.[0] || '',
        published:       entry.published?.[0] || '',
        updated:         entry.updated?.[0] || '',
        categoryTerm:    category.term || '',
        categoryLabel:   category.label || '',
        categoryScheme:  category.scheme || '',
        contentVersion:  entry['ncts:contentItemVersion']?.[0]?._ || entry['ncts:contentItemVersion']?.[0] || '',
        downloadHref:    downloadLink?.href || '',
        downloadType:    downloadLink?.type || '',
        downloadLength:  downloadLink?.length || '',
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
});

// ─── FHIR Resources ───────────────────────────────────────────────────────────
async function fetchFhirResourceType(resourceType, token) {
  let all = [];
  const elements = BASE_ELEMENTS + (EXTRA_ELEMENTS[resourceType] || '');
  let url = `${NCTS_FHIR_BASE}/${resourceType}?_count=100&_elements=${elements}`;

  while (url) {
    const response = await axios.get(url, {
      headers: { Authorization: token, Accept: 'application/fhir+json' },
      timeout: 60000,
    });
    const bundle = response.data;
    const entries = (bundle.entry || []).map(e => e.resource).filter(Boolean);
    all = all.concat(entries);

    const nextLink = (bundle.link || []).find(l => l.relation === 'next');
    url = nextLink?.url || null;
  }
  return all;
}

app.get('/api/fhir/:resourceType', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { resourceType } = req.params;
  const allowed = ['CodeSystem', 'ValueSet', 'ConceptMap', 'NamingSystem'];
  if (!allowed.includes(resourceType)) return res.status(400).json({ error: 'Invalid resource type' });

  try {
    const resources = await fetchFhirResourceType(resourceType, token);
    res.json({ resourceType, count: resources.length, resources });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: `Failed to fetch ${resourceType}`, detail: err.message });
  }
});

// ─── Serve built client ───────────────────────────────────────────────────────
const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => {
  console.log(`\n  NCTS Audit Server → http://localhost:${PORT}\n`);
});
