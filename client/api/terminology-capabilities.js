import axios from 'axios';

const NCTS_FHIR_BASE = 'https://api.healthterminologies.gov.au/integration/v2/fhir';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
}
