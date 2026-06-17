# Lattice Full Visualization Stack

Real-time Lattice entity ingestion → Neo4j graph persistence → CesiumJS 3D globe visualization.

## Architecture

```
Lattice sandbox
    ↓ (gRPC/TLS, StreamEntityComponents)
Go ingest service (localhost:8080)
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
- **Green dots** on the globe for each entity at its lat/lon
- **Labels** showing entity name
- **Real-time updates** as entities are published via `go run ./cmd/publish`

## Project structure

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
  "entity_id": "test-vessel-001",
  "name": "Test Vessel",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "ontology": "TEMPLATE_TRACK",
  "updated_at": "2026-06-16T21:30:00Z"
}
```

### Neo4j Schema
```cypher
(Entity {id, name, latitude, longitude, ontology, updatedAt})
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

**Cesium globe doesn't show imagery**
- Use free Cesium Ion token (https://cesium.com/ion)
- Or comment out `Ion.defaultAccessToken` in App.tsx to use offline tileset

## References

- [Lattice SDK Go](https://docs.anduril.com/guide/sdks/go)
- [Entity Manager gRPC API](https://developer.anduril.com/reference/entitymanager)
- [Neo4j Go Driver v5](https://neo4j.com/docs/driver-manual/5.0/)
- [Cesium.js Documentation](https://cesium.com/learn/cesiumjs)
