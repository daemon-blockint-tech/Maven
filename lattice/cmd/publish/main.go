package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/daemon/lattice/internal/auth"
	"github.com/daemon/lattice/internal/lattice"
	entitymanagerv1 "github.com/anduril/lattice-sdk-go/src/anduril/entitymanager/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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

	client, err := lattice.NewClient(ctx, cfg, false)
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}
	defer client.Close()

	entity := &entitymanagerv1.Entity{
		EntityId: "test-vessel-001",
		Description: "Test vessel for Lattice SDK demo",
		ExpiryTime: timestamppb.New(time.Now().Add(1 * time.Hour)),
		Location: &entitymanagerv1.Location{
			Position: &entitymanagerv1.Position{
				LatitudeDegrees:  37.7749,
				LongitudeDegrees: -122.4194,
				AltitudeHaeMeters: wrapperspb.Double(0),
			},
		},
		Aliases: &entitymanagerv1.Aliases{
			Name: "Test Vessel",
		},
		Ontology: &entitymanagerv1.Ontology{
			Template: entitymanagerv1.Template_TEMPLATE_TRACK,
			PlatformType: "vessel",
			SpecificType: "cargo_ship",
		},
		Provenance: &entitymanagerv1.Provenance{
			IntegrationName: "lattice-go-demo",
			DataType:        "vessel_telemetry",
			SourceId:        "demo-source",
		},
	}

	req := &entitymanagerv1.PublishEntityRequest{
		Entity: entity,
	}

	_, err = client.EntityManagerClient().PublishEntity(ctx, req)
	if err != nil {
		log.Fatalf("PublishEntity failed: %v", err)
	}

	fmt.Printf("Published entity %s\n", entity.EntityId)
	fmt.Println("Entity published successfully to Lattice sandbox")
}
