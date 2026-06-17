package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/daemon/lattice/internal/auth"
	"github.com/daemon/lattice/internal/graph"
	"github.com/daemon/lattice/internal/lattice"
	entitymanagerv1 "github.com/anduril/lattice-sdk-go/src/anduril/entitymanager/v1"
	"github.com/gorilla/websocket"
)

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.Mutex
	upgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

// Client represents a connected WebSocket client.
type Client struct {
	conn   *websocket.Conn
	send   chan EntityMessage
	ingest *Ingest
}

// EntityMessage is sent to all connected clients on entity updates.
type EntityMessage struct {
	Type        string    `json:"type"` // "update", "delete"
	EntityID    string    `json:"entity_id"`
	Name        string    `json:"name,omitempty"`
	Latitude    float64   `json:"latitude,omitempty"`
	Longitude   float64   `json:"longitude,omitempty"`
	Ontology    string    `json:"ontology,omitempty"`
	Disposition string    `json:"disposition,omitempty"` // MIL-STD-2525 affiliation
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

// Ingest holds the Lattice client and Neo4j store.
type Ingest struct {
	latticeClient *lattice.Client
	graphStore    *graph.Store
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cfg := auth.Config{
		BaseURL:      os.Getenv("LATTICE_URL"),
		ClientID:     os.Getenv("LATTICE_CLIENT_ID"),
		ClientSecret: os.Getenv("LATTICE_CLIENT_SECRET"),
		SandboxToken: os.Getenv("SANDBOX_TOKEN"),
	}

	if cfg.BaseURL == "" || cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.SandboxToken == "" {
		log.Fatal("Missing env: LATTICE_URL, LATTICE_CLIENT_ID, LATTICE_CLIENT_SECRET, SANDBOX_TOKEN")
	}

	latticeClient, err := lattice.NewClient(ctx, cfg, false)
	if err != nil {
		log.Fatalf("Failed to create Lattice client: %v", err)
	}
	defer latticeClient.Close()

	neoURL := os.Getenv("NEO4J_URL")
	if neoURL == "" {
		neoURL = "neo4j://localhost:7687"
	}
	neoUser := os.Getenv("NEO4J_USER")
	if neoUser == "" {
		neoUser = "neo4j"
	}
	neoPass := os.Getenv("NEO4J_PASSWORD")
	if neoPass == "" {
		neoPass = "password"
	}

	graphStore, err := graph.New(ctx, neoURL, neoUser, neoPass)
	if err != nil {
		log.Fatalf("Failed to connect to Neo4j: %v", err)
	}
	defer graphStore.Close(ctx)

	ingest := &Ingest{
		latticeClient: latticeClient,
		graphStore:    graphStore,
	}

	http.HandleFunc("/ws", ingest.handleWS)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	go ingest.streamEntities(context.Background())

	log.Println("Ingest server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// handleWS upgrades an HTTP connection to WebSocket and registers the client.
func (i *Ingest) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}

	client := &Client{
		conn:   conn,
		send:   make(chan EntityMessage, 256),
		ingest: i,
	}

	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()

	log.Printf("WS client connected (total: %d)", len(clients))

	go client.readPump()
	go client.writePump()
}

// readPump reads messages from the WebSocket (for future use, e.g., queries).
func (c *Client) readPump() {
	defer func() {
		clientsMu.Lock()
		delete(clients, c)
		clientsMu.Unlock()
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg map[string]interface{}
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS error: %v", err)
			}
			break
		}
	}
}

// writePump sends queued messages to the WebSocket.
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// broadcast sends a message to all connected clients.
func broadcast(msg EntityMessage) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	for client := range clients {
		select {
		case client.send <- msg:
		default:
			close(client.send)
			delete(clients, client)
		}
	}
}

// extractDisposition maps the Lattice MilView Disposition enum to a canonical
// MIL-STD-2525 affiliation string understood by the frontend color mapper.
func extractDisposition(entity *entitymanagerv1.Entity) string {
	if entity.MilView == nil {
		return "unknown"
	}
	switch entity.MilView.Disposition {
	case entitymanagerv1.Disposition_DISPOSITION_HOSTILE,
		entitymanagerv1.Disposition_DISPOSITION_ASSUMED_HOSTILE:
		return "hostile"
	case entitymanagerv1.Disposition_DISPOSITION_FRIENDLY,
		entitymanagerv1.Disposition_DISPOSITION_ASSUMED_FRIENDLY:
		return "friendly"
	case entitymanagerv1.Disposition_DISPOSITION_NEUTRAL,
		entitymanagerv1.Disposition_DISPOSITION_ASSUMED_NEUTRAL:
		return "neutral"
	case entitymanagerv1.Disposition_DISPOSITION_SUSPECT:
		return "suspect"
	default:
		return "unknown"
	}
}

// streamEntities subscribes to the Lattice entity stream and persists entities to Neo4j.
func (i *Ingest) streamEntities(ctx context.Context) {
	req := &entitymanagerv1.StreamEntityComponentsRequest{
		IncludeAllComponents:  true,
		HeartbeatPeriodMillis: 30000,
	}

	stream, err := i.latticeClient.EntityManagerClient().StreamEntityComponents(ctx, req)
	if err != nil {
		log.Fatalf("StreamEntityComponents failed: %v", err)
	}

	for {
		resp, err := stream.Recv()
		if err != nil {
			log.Printf("Stream recv error: %v", err)
			time.Sleep(5 * time.Second)
			go i.streamEntities(context.Background())
			return
		}

		if resp.EntityEvent == nil {
			continue
		}

		event := resp.EntityEvent
		entity := event.Entity

		if entity == nil {
			continue
		}

		// Extract position
		lat, lon := 0.0, 0.0
		if entity.Location != nil && entity.Location.Position != nil {
			lat = entity.Location.Position.LatitudeDegrees
			lon = entity.Location.Position.LongitudeDegrees
		}

		// Extract name
		name := ""
		if entity.Aliases != nil {
			name = entity.Aliases.Name
		}

		// Extract ontology template
		ontology := ""
		if entity.Ontology != nil {
			ontology = entity.Ontology.Template.String()
		}

		// Extract MIL-STD-2525 disposition
		disposition := extractDisposition(entity)

		// Persist to Neo4j
		switch event.EventType {
		case entitymanagerv1.EventType_EVENT_TYPE_CREATED, entitymanagerv1.EventType_EVENT_TYPE_UPDATE:
			eu := graph.EntityUpdate{
				EntityID:  entity.EntityId,
				Name:      name,
				Latitude:  lat,
				Longitude: lon,
				Ontology:  ontology,
				UpdatedAt: time.Now(),
			}
			if err := i.graphStore.UpsertEntity(ctx, eu); err != nil {
				log.Printf("UpsertEntity error: %v", err)
			}

			broadcast(EntityMessage{
				Type:        "update",
				EntityID:    entity.EntityId,
				Name:        name,
				Latitude:    lat,
				Longitude:   lon,
				Ontology:    ontology,
				Disposition: disposition,
				UpdatedAt:   time.Now(),
			})

			log.Printf("Entity %s: %s [%s/%s] @ (%.4f, %.4f)", entity.EntityId, name, ontology, disposition, lat, lon)

		case entitymanagerv1.EventType_EVENT_TYPE_DELETED:
			if err := i.graphStore.DeleteEntity(ctx, entity.EntityId); err != nil {
				log.Printf("DeleteEntity error: %v", err)
			}

			broadcast(EntityMessage{
				Type:     "delete",
				EntityID: entity.EntityId,
			})

			log.Printf("Entity %s deleted", entity.EntityId)
		}
	}
}
