import axios from 'axios';

const NCTS_FHIR_BASE = 'https://api.healthterminologies.gov.au/integration/v2/fhir';

const BASE_ELEMENTS = [
  'id', 'url', 'name', 'title', 'status', 'experimental',
  'date', 'publisher', 'description', 'purpose', 'copyright',
  'contact', 'useContext', 'jurisdiction',
].join(',');

const EXTRA_ELEMENTS = {
  CodeSystem:   ',count',
  ValueSet:     ',compose',
  ConceptMap:   ',sourceScope,targetScope',
  NamingSystem: ',uniqueId',
};

const ALLOWED = ['CodeSystem', 'ValueSet', 'ConceptMap', 'NamingSystem'];

async function fetchAll(resourceType, token) {
  let all = [];
  const elements = BASE_ELEMENTS + (EXTRA_ELEMENTS[resourceType] || '');
  let url = `${NCTS_FHIR_BASE}/${resourceType}?_count=100&_elements=${elements}`;

  while (url) {
    const response = await axios.get(url, {
      headers: { Authorization: token, Accept: 'application/fhir+json' },
      timeout: 55000,
    });
    const bundle = response.data;
    const entries = (bundle.entry || []).map(e => e.resource).filter(Boolean);
    all = all.concat(entries);

    const nextLink = (bundle.link || []).find(l => l.relation === 'next');
    url = nextLink?.url || null;
  }
  return all;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { type } = req.query;
  if (!ALLOWED.includes(type)) return res.status(400).json({ error: 'Invalid resource type' });

  try {
    const resources = await fetchAll(type, token);
    res.json({ resourceType: type, count: resources.length, resources });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: `Failed to fetch ${type}`, detail: err.message });
  }
}
