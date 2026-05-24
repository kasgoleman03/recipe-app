// Package main is the entry point of the Recipes API server.
//
// It wires together:
//   - configuration (env vars)
//   - the SQLite store (server-owned persistence plane)
//   - the TheMealDB client (browse/discovery proxy plane)
//   - the in-memory TTL cache (for slow-changing proxied data)
//   - the HTTP server with middleware and routes
//
// The server exposes a single REST API surface under /api/* and never
// exposes the upstream TheMealDB API key to the client.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/recipe-app/server/internal/cache"
	"github.com/recipe-app/server/internal/config"
	"github.com/recipe-app/server/internal/mealdb"
	"github.com/recipe-app/server/internal/server"
	"github.com/recipe-app/server/internal/store"
)

func main() {
	logger := log.New(os.Stdout, "", log.LstdFlags|log.Lmicroseconds)

	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("config: %v", err)
	}

	// Open / migrate the SQLite database. SQLite is chosen because it is
	// pure-Go (modernc.org/sqlite, no CGO) and free to deploy on hosts that
	// allow a writable filesystem or persistent volume.
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		logger.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	// TheMealDB client. The server is the only thing that talks to the
	// upstream service; the client never sees the API key.
	mdb := mealdb.NewClient(cfg.MealDBBase, cfg.MealDBKey, 8*time.Second)

	// Tiny in-memory TTL cache for /categories specifically (it changes
	// rarely and is hit on every Home page load). Other endpoints rely on
	// HTTP cache headers.
	cat := cache.New[string]()

	deps := server.Deps{
		Logger:    logger,
		Store:     st,
		MealDB:    mdb,
		CatCache:  cat,
		CORSOrigin: cfg.CORSOrigin,
	}

	mux := server.NewRouter(deps)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.WithMiddleware(mux, deps),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Run in a goroutine so we can also wait for shutdown signals.
	go func() {
		logger.Printf("Recipes API listening on :%s (CORS=%s, DB=%s)", cfg.Port, cfg.CORSOrigin, cfg.DBPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatalf("listen: %v", err)
		}
	}()

	// Graceful shutdown.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	logger.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Printf("shutdown: %v", err)
	}
}
