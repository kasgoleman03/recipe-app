// Package config loads server configuration from environment variables.
//
// All knobs are documented in .env.example and the README. The server
// refuses to start if required values are missing or obviously wrong.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port       string
	MealDBBase string // e.g. https://www.themealdb.com/api/json/v1
	MealDBKey  string // upstream API key; never sent to the client
	DBPath     string // SQLite file path (DATABASE_URL takes precedence)
	CORSOrigin string // exact origin allowed by CORS, or "*"
}

// Load reads the env vars and applies sensible defaults for local dev.
func Load() (*Config, error) {
	cfg := &Config{
		Port:       getenv("PORT", "5174"),
		MealDBBase: strings.TrimRight(getenv("MEALDB_API_BASE", "https://www.themealdb.com/api/json/v1"), "/"),
		MealDBKey:  getenv("MEALDB_API_KEY", "1"),
		DBPath:     resolveDBPath(),
		CORSOrigin: getenv("CORS_ORIGIN", "http://localhost:5173"),
	}

	if cfg.MealDBBase == "" {
		return nil, errors.New("MEALDB_API_BASE is required")
	}
	if cfg.MealDBKey == "" {
		return nil, errors.New("MEALDB_API_KEY is required (use 1 for local dev)")
	}
	if !strings.HasPrefix(cfg.MealDBBase, "http") {
		return nil, fmt.Errorf("MEALDB_API_BASE must be an http(s) URL, got %q", cfg.MealDBBase)
	}
	return cfg, nil
}

// resolveDBPath prefers DATABASE_URL (e.g. file:/data/recipes.db) and
// falls back to DB_PATH, then a local file. This matches the way most
// free hosts surface persistent volumes.
func resolveDBPath() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		// Strip a "file:" prefix if present so we can hand it to the SQLite driver.
		return strings.TrimPrefix(v, "file:")
	}
	return getenv("DB_PATH", "./recipes.db")
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
