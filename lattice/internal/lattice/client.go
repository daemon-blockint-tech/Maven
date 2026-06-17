// Package lattice provides a gRPC client to the Lattice Entity Manager API.
package lattice

import (
	"context"
	"crypto/tls"
	"fmt"
	"strings"

	"github.com/daemon/lattice/internal/auth"
	entitymanagerv1 "github.com/anduril/lattice-sdk-go/src/anduril/entitymanager/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

// Client wraps the EntityManagerAPIClient with auth token handling.
type Client struct {
	client entitymanagerv1.EntityManagerAPIClient
	conn   *grpc.ClientConn
}

// NewClient dials a Lattice endpoint and returns a ready-to-use client.
// The cfg must include valid OAuth credentials.
func NewClient(ctx context.Context, cfg auth.Config, insecureTransport bool) (*Client, error) {
	grpcURL := strings.TrimPrefix(cfg.BaseURL, "https://")
	grpcURL = strings.TrimPrefix(grpcURL, "http://")

	var creds credentials.TransportCredentials
	if insecureTransport {
		creds = insecure.NewCredentials()
	} else {
		creds = credentials.NewTLS(&tls.Config{})
	}

	tokenSource := auth.NewTokenSource(cfg)

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(creds),
		grpc.WithPerRPCCredentials(tokenSource),
	}

	conn, err := grpc.NewClient(grpcURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("dial Lattice: %w", err)
	}

	return &Client{
		client: entitymanagerv1.NewEntityManagerAPIClient(conn),
		conn:   conn,
	}, nil
}

// EntityManagerClient returns the underlying gRPC client for direct API calls.
func (c *Client) EntityManagerClient() entitymanagerv1.EntityManagerAPIClient {
	return c.client
}

// Close closes the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
