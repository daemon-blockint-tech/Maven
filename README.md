# Maven — Lattice Full Visualization Stack

Real-time Lattice entity ingestion → Neo4j graph persistence → CesiumJS 3D globe visualization.

Validated live on sandbox `wc0sqy` — 4 FISHING VESSEL entities streaming with correct disposition mapping.

## Architecture

```
Lattice sandbox (wc0sqy)
    ↓ (gRPC/TLS, StreamEntityComponents)
Go ingest service (localhost:8080)
    ↓  disposition normalization (extractDisposition)
    ↓ (bolt protocol)
    Neo4j database (localhost:7687)
    ↓ (WebSocket)
CesiumJS frontend (localhost:5173)
```

## Prerequisites

- Go 1.26+
- Node.js 18+
- Docker + Docker Compose
- Lattice sandbox credentials (from https://developer.anduril.com/guides/getting-started/sandboxes)
- (Optional) Cesium Ion token for basemap imagery (free tier available)

## Quick Start

### 1. Start Neo4j

```bash
docker compose -f lattice/docker-compose.yml up -d
# Check health: curl http://localhost:7474
```

### 2. Configure credentials

```bash
cp lattice/.env.example lattice/.env
# Edit lattice/.env with your Lattice sandbox credentials
```

### 3. Start ingest service

```bash
cd lattice
go run ./cmd/ingest
# Listens on http://localhost:8080
# WebSocket endpoint: ws://localhost:8080/ws
```

### 4. (Optional) Publish a test entity

In a new terminal:
```bash
cd lattice
go run ./cmd/publish
# Publishes test-vessel-001 at (37.7749, -122.4194) [San Francisco]
```

Monitor Neo4j:
```bash
# Open http://localhost:7474 → Browser
# Query: MATCH (e:Entity) RETURN e
```

### 5. Start web frontend

```bash
cd web
cp .env.example .env
# Edit .env with Cesium token (optional) or leave blank for offline mode
npm install
npm run dev
# Opens http://localhost:5173
```

You should see:
- **Colored dots** on the globe per disposition (orange = suspect, cyan = friendly, red = hostile, yellow = unknown)
- **Labels** showing entity name and ontology
- **Real-time updates** as entities stream from Lattice or are published via `go run ./cmd/publish`

## Disposition Mapping

The ingest pipeline normalizes Lattice SDK enum strings to lowercase UI keys before persisting to Neo4j and broadcasting via WebSocket.

| SDK String | Normalized Key | UI Color |
|---|---|---|
| `DISPOSITION_SUSPICIOUS` | `suspect` | Orange `rgba(255,146,18,1)` |
| `DISPOSITION_HOSTILE` | `hostile` | Red `rgba(255,55,55,1)` |
| `DISPOSITION_FRIENDLY` | `friendly` | Cyan `rgba(24,255,255,1)` |
| `DISPOSITION_ASSUMED_FRIEND` | `assumed_friend` | Green `rgba(0,255,60,1)` |
| `DISPOSITION_NEUTRAL` | `neutral` | Pink `rgba(255,71,206,1)` |
| `DISPOSITION_PENDING` | `pending` | Gray `rgba(215,216,219,1)` |
| `DISPOSITION_UNKNOWN` / fallback | `unknown` | Yellow `rgba(255,255,33,1)` |

### extractDisposition logic

```go
func extractDisposition(entity *lattice.Entity) string {
    if entity.MilView == nil {
        return "unknown"
    }
    raw := entity.MilView.Disposition.String()
    switch raw {
    case "DISPOSITION_SUSPICIOUS":   return "suspect"
    case "DISPOSITION_HOSTILE":      return "hostile"
    case "DISPOSITION_FRIENDLY":     return "friendly"
    case "DISPOSITION_ASSUMED_FRIEND": return "assumed_friend"
    case "DISPOSITION_NEUTRAL":      return "neutral"
    case "DISPOSITION_PENDING":      return "pending"
    default:                         return "unknown"
    }
}
```

## Multi-Source Ingestion

Maven ingests from multiple Lattice data sources. Ensure `extractDisposition()` is applied uniformly across all sources:

| Data Type | Source | Notes |
|---|---|---|
| `anduril` | Native Lattice entities | Primary source |
| `ncct` | Naval Command & Control | Same disposition pipeline |
| `legacy_integration` | External provenance | Normalized at ingest boundary |

## Live Validation (17 Jun 2026)

Sandbox `wc0sqy` confirmed active with the following entities:

| Entity | UUID | Data Type | Disposition |
|---|---|---|---|
| FISHING VESSEL 13186 | 24a5ed37-a961-41b6-8ed4-f7ea1617d86a | anduril | Suspect |
| FISHING VESSEL 37958 | 0e0c9468-4a49-4fed-bb1d-294709a62fa9 | anduril | Suspect |
| FISHING VESSEL 50698 | ef8815e4-4157-46a2-81d8-209ada42d4b0 | anduril | Suspect |
| FISHING VESSEL 8390 | 527417b0-3818-476c-86b4-88f93b7b373c | ncct | Suspect |

All entities tagged `Simulated`, status `Live`, created `0519`.

## Project Structure

```
lattice/
  go.mod, go.sum         # Go dependencies
  internal/
    auth/                # OAuth token source (PerRPCCredentials)
    lattice/             # gRPC client wrapper
    graph/               # Neo4j bolt driver + upsert logic
  cmd/
    publish/             # Publishes a test entity to Lattice
    ingest/              # Streams entities from Lattice, persists to Neo4j, fans out to WS clients
  docker-compose.yml     # Neo4j service
  .env.example           # Template for Lattice credentials

web/
  src/
    main.tsx             # React entry
    App.tsx              # Cesium globe component
    ws.ts                # WebSocket client
    index.css, App.css   # Styling
  vite.config.ts         # Vite build config + dev proxy to ingest service
  package.json           # Dependencies (Cesium, React, Vite)
  .env.example           # Template (Cesium token optional)
```

## API / Data Flow

### Entity Message (WebSocket)

```json
{
  "type": "update",
  "entity_id": "24a5ed37-a961-41b6-8ed4-f7ea1617d86a",
  "name": "FISHING VESSEL 13186",
  "latitude": 0.0,
  "longitude": 0.0,
  "ontology": "TEMPLATE_TRACK",
  "disposition": "suspect",
  "data_type": "anduril",
  "updated_at": "2026-06-17T09:19:00Z"
}
```

### Neo4j Schema

```cypher
(Entity {id, name, latitude, longitude, ontology, disposition, dataType, updatedAt})
```

Relationships are created from the entity's `relationships` component (if present).

## Troubleshooting

**Ingest can't connect to Lattice**
- Check `LATTICE_URL`, `LATTICE_CLIENT_ID`, `LATTICE_CLIENT_SECRET`, `SANDBOX_TOKEN` in `.env`
- Verify sandbox is accessible: `curl -v https://<sandbox>.anduril.com/health`

**Web frontend shows "Connecting..." forever**
- Check `http://localhost:8080/health` returns `{"status":"ok"}`
- Check browser console for WebSocket errors (CORS, TLS)
- Verify ingest service is running and listening on port 8080

**No entities appearing in Neo4j**
- Check ingest logs for stream errors
- Verify Lattice sandbox has live entities to stream
- Run `publish` to create a test entity

**All entities appear yellow (unknown disposition)**
- Check that `extractDisposition()` handles the raw `DISPOSITION_` prefix from the SDK enum
- Log `entity.MilView.Disposition.String()` to verify the raw string value before mapping

**Cesium globe doesn't show imagery**
- Use free Cesium Ion token (https://cesium.com/ion)
- Or comment out `Ion.defaultAccessToken` in App.tsx to use offline tileset

## References

- [Lattice SDK Go](https://docs.anduril.com/guide/sdks/go)
- [Entity Manager gRPC API](https://developer.anduril.com/reference/entitymanager)
- [Neo4j Go Driver v5](https://neo4j.com/docs/driver-manual/5.0/)
- [Cesium.js Documentation](https://cesium.com/learn/cesiumjs)
