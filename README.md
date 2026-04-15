# NCTS Artefact Audit Dashboard

An interactive dashboard for auditing all artefacts published on the Australian National Clinical Terminology Service (NCTS), including FHIR resources (CodeSystem, ValueSet, ConceptMap, NamingSystem) and Syndication feed entries.

## What it audits

| Source | Artefact Types |
|--------|---------------|
| FHIR API | CodeSystem, ValueSet, ConceptMap, NamingSystem |
| Syndication Feed | SCT RF2 releases, AMT, LOINC, FHIR bundles, Ontoserver binaries, etc. |

For each artefact it captures: title, URL/canonical, version, status, published date, last updated, publisher, resource type, category, download size.

## Prerequisites

- Node.js 18+ 
- An NCTS account with a registered System Credential (Client ID + Secret)

## Getting credentials

1. Log in at https://www.healthterminologies.gov.au
2. Go to **My Profile** → **Client Credentials** tab
3. Click **Add** → enter a System Name and Purpose
4. Copy the generated **Client ID** and **Client Secret**

## Setup

```bash
# Install all dependencies
npm run install:all

# Build the React frontend
cd client && npm run build && cd ..

# Start the server
npm start
```

The app will be available at **http://localhost:3737**

## Development mode (hot reload)

Run two terminals:

```bash
# Terminal 1 — backend
npm run dev:server

# Terminal 2 — frontend (with proxy to backend)
npm run dev:client
```

Frontend dev server at http://localhost:5173

## Usage

1. Open http://localhost:3737
2. Enter your NCTS Client ID and Client Secret
3. Click **Connect to NCTS**
4. The dashboard will fetch all artefacts (takes 10–30s depending on count)

### Dashboard tabs

- **Overview** — summary stats, charts, recently updated artefacts per type
- **FHIR Resources** — searchable/sortable tables for each FHIR resource type, filterable by status
- **Syndication** — all syndication feed entries, filterable by category (SCT_RF2_FULL, AMT, LOINC, etc.)

### Export

Click **↓ Export CSV** on any tab to download a full audit CSV with all artefacts from both sources.

## API endpoints (if you want to use the backend directly)

```
POST /api/token              — get OAuth token (pass clientId + clientSecret in JSON body)
GET  /api/syndication        — full syndication feed parsed to JSON
GET  /api/fhir/:resourceType — all resources of type CodeSystem|ValueSet|ConceptMap|NamingSystem
GET  /api/audit              — combined audit across all sources
```

All endpoints (except /api/token) require `Authorization: Bearer <token>` header.

## Port

Default port is **3737**. Override with: `PORT=8080 npm start`
