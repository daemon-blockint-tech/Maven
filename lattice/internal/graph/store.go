// Package graph provides Neo4j persistence for Lattice entities and relationships.
package graph

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// Store manages entity and relationship writes to Neo4j.
type Store struct {
	driver neo4j.DriverWithContext
}

// New opens a Neo4j connection and returns a Store.
// uri should be neo4j://localhost:7687 (default bolt port).
func New(ctx context.Context, uri, user, password string) (*Store, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}

	if err := driver.VerifyConnectivity(ctx); err != nil {
		return nil, fmt.Errorf("neo4j verify: %w", err)
	}

	return &Store{driver: driver}, nil
}

// EntityUpdate is a minimal entity representation to persist.
type EntityUpdate struct {
	EntityID  string
	Name      string
	Latitude  float64
	Longitude float64
	Ontology  string
	UpdatedAt time.Time
}

// UpsertEntity creates or updates an entity node with position and metadata.
func (s *Store) UpsertEntity(ctx context.Context, e EntityUpdate) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	query := `
		MERGE (entity:Entity {id: $entityId})
		SET entity.name = $name,
		    entity.latitude = $latitude,
		    entity.longitude = $longitude,
		    entity.ontology = $ontology,
		    entity.updatedAt = $updatedAt
		RETURN entity.id
	`

	_, err := neo4j.ExecuteWrite(ctx, session, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, query, map[string]any{
			"entityId":  e.EntityID,
			"name":      e.Name,
			"latitude":  e.Latitude,
			"longitude": e.Longitude,
			"ontology":  e.Ontology,
			"updatedAt": e.UpdatedAt.Format(time.RFC3339),
		})
		if err != nil {
			return nil, err
		}
		return result.Consume(ctx)
	})

	return err
}

// RelationshipUpdate represents a relationship between two entities.
type RelationshipUpdate struct {
	FromEntityID string
	ToEntityID   string
	RelationType string
	UpdatedAt    time.Time
}

// UpsertRelationship creates or updates a relationship edge.
func (s *Store) UpsertRelationship(ctx context.Context, r RelationshipUpdate) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	query := fmt.Sprintf(`
		MATCH (from:Entity {id: $fromId})
		MATCH (to:Entity {id: $toId})
		MERGE (from)-[rel:%s {type: $relType}]->(to)
		SET rel.updatedAt = $updatedAt
		RETURN rel
	`, sanitizeLabelName(r.RelationType))

	_, err := neo4j.ExecuteWrite(ctx, session, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, query, map[string]any{
			"fromId":    r.FromEntityID,
			"toId":      r.ToEntityID,
			"relType":   r.RelationType,
			"updatedAt": r.UpdatedAt.Format(time.RFC3339),
		})
		if err != nil {
			return nil, err
		}
		return result.Consume(ctx)
	})

	return err
}

// DeleteEntity removes an entity node (cascades relationships by Neo4j config).
func (s *Store) DeleteEntity(ctx context.Context, entityID string) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, session, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, "MATCH (e:Entity {id: $id}) DETACH DELETE e", map[string]any{
			"id": entityID,
		})
		if err != nil {
			return nil, err
		}
		return result.Consume(ctx)
	})

	return err
}

// sanitizeLabelName converts a relationship type string into a valid Neo4j label.
// Neo4j relationships can't have spaces or special chars in the type name used in
// MERGE, so we replace non-alphanumeric with underscores.
func sanitizeLabelName(s string) string {
	result := ""
	for _, ch := range s {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
			result += string(ch)
		} else {
			result += "_"
		}
	}
	return result
}

// Close closes the Neo4j driver connection.
func (s *Store) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}
