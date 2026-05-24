// Package mealdb is a thin wrapper around TheMealDB v1 HTTP API.
//
// It centralizes URL building (so the API key is never exposed) and
// exposes both raw byte responses (for the proxy handlers) and decoded
// MealDoc structs (for the saved-recipe normalization path).
package mealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Client talks to TheMealDB.
type Client struct {
	base string
	key  string
	http *http.Client
}

func NewClient(base, key string, timeout time.Duration) *Client {
	return &Client{
		base: base,
		key:  key,
		http: &http.Client{Timeout: timeout},
	}
}

// rawURL builds the canonical URL for an upstream endpoint.
// e.g. endpoint = "search.php", q = "chicken" -> ${base}/${key}/search.php?s=chicken
func (c *Client) rawURL(endpoint string, params url.Values) string {
	u := fmt.Sprintf("%s/%s/%s", c.base, c.key, endpoint)
	if len(params) > 0 {
		u += "?" + params.Encode()
	}
	return u
}

// FetchRaw returns the upstream response body verbatim. The proxy
// handlers use this so we forward exactly what TheMealDB sent (modulo
// our own caching headers).
func (c *Client) FetchRaw(ctx context.Context, endpoint string, params url.Values) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.rawURL(endpoint, params), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

// LookupMeal hits lookup.php?i=ID and returns the first meal (if any).
// Used by the save-from-source path so the server can normalize the
// upstream meal into our own structured Recipe before persisting.
func (c *Client) LookupMeal(ctx context.Context, id string) (*MealDoc, error) {
	body, status, err := c.FetchRaw(ctx, "lookup.php", url.Values{"i": []string{id}})
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("upstream returned status %d", status)
	}
	var resp mealsEnvelope
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if len(resp.Meals) == 0 {
		return nil, nil
	}
	return &resp.Meals[0], nil
}

type mealsEnvelope struct {
	Meals []MealDoc `json:"meals"`
}
