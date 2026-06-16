// Package auth implements the Lattice OAuth client-credentials flow and exposes
// it as a gRPC credentials.PerRPCCredentials so every RPC carries a fresh bearer
// token plus the sandbox authorization header.
package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Config holds the credentials needed to authenticate against a Lattice sandbox.
type Config struct {
	// BaseURL is the https Lattice environment URL, e.g. https://<env>.anduril.com
	BaseURL string
	// ClientID / ClientSecret are the OAuth client-credentials.
	ClientID     string
	ClientSecret string
	// SandboxToken is sent as the Anduril-Sandbox-Authorization bearer.
	SandboxToken string
}

// TokenSource fetches and caches an OAuth access token, refreshing it before it
// expires. It satisfies credentials.PerRPCCredentials.
type TokenSource struct {
	cfg    Config
	client *http.Client

	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

// NewTokenSource builds a TokenSource for the given config.
func NewTokenSource(cfg Config) *TokenSource {
	return &TokenSource{
		cfg:    cfg,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

// accessToken returns a valid cached token, fetching a new one if missing or
// within 60s of expiry.
func (t *TokenSource) accessToken(ctx context.Context) (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.token != "" && time.Now().Before(t.expiresAt.Add(-60*time.Second)) {
		return t.token, nil
	}

	endpoint := strings.TrimRight(t.cfg.BaseURL, "/") + "/api/v1/oauth/token"
	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {t.cfg.ClientID},
		"client_secret": {t.cfg.ClientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(body.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if t.cfg.SandboxToken != "" {
		req.Header.Set("Anduril-Sandbox-Authorization", "Bearer "+t.cfg.SandboxToken)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %s", resp.Status)
	}

	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("token endpoint returned empty access_token")
	}

	expires := tr.ExpiresIn
	if expires <= 0 {
		expires = 900
	}
	t.token = tr.AccessToken
	t.expiresAt = time.Now().Add(time.Duration(expires) * time.Second)
	return t.token, nil
}

// GetRequestMetadata implements credentials.PerRPCCredentials.
func (t *TokenSource) GetRequestMetadata(ctx context.Context, _ ...string) (map[string]string, error) {
	token, err := t.accessToken(ctx)
	if err != nil {
		return nil, err
	}
	md := map[string]string{"authorization": "Bearer " + token}
	if t.cfg.SandboxToken != "" {
		md["anduril-sandbox-authorization"] = "Bearer " + t.cfg.SandboxToken
	}
	return md, nil
}

// RequireTransportSecurity implements credentials.PerRPCCredentials. Tokens must
// only travel over TLS.
func (t *TokenSource) RequireTransportSecurity() bool { return true }
