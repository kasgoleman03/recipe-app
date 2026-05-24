// Package server wires HTTP routing, middleware, and handler dependencies.
package server

import (
	"compress/gzip"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/recipe-app/server/internal/cache"
	"github.com/recipe-app/server/internal/mealdb"
	"github.com/recipe-app/server/internal/store"
)

// Deps is the bag of shared services every handler needs.
type Deps struct {
	Logger     *log.Logger
	Store      *store.Store
	MealDB     *mealdb.Client
	CatCache   *cache.Cache[string]
	CORSOrigin string
}

// NewRouter builds the inner mux. It is kept separate from the
// middleware chain so tests can hit handlers without going through CORS
// / logging / gzip.
func NewRouter(d Deps) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", handleHealth)

	// --- Browse/Discovery proxy plane ----------------------------------------
	mux.HandleFunc("GET /api/search", proxySearch(d))
	mux.HandleFunc("GET /api/meal/{id}", proxyMeal(d))
	mux.HandleFunc("GET /api/categories", proxyCategories(d))
	mux.HandleFunc("GET /api/filter", proxyFilter(d))
	mux.HandleFunc("GET /api/random", proxyRandom(d))

	// --- Collection/Persistence plane ----------------------------------------
	mux.HandleFunc("GET /api/recipes", listRecipes(d))
	mux.HandleFunc("POST /api/recipes", createRecipe(d))
	mux.HandleFunc("GET /api/recipes/{id}", getRecipe(d))
	mux.HandleFunc("PUT /api/recipes/{id}", updateRecipe(d))
	mux.HandleFunc("DELETE /api/recipes/{id}", deleteRecipe(d))

	return mux
}

// WithMiddleware wraps the mux with the cross-cutting concerns: panic
// recovery, request logging, CORS, security headers, and gzip.
func WithMiddleware(h http.Handler, d Deps) http.Handler {
	return recoverer(d.Logger)(
		requestLog(d.Logger)(
			cors(d.CORSOrigin)(
				securityHeaders(
					gzipHandler(h),
				),
			),
		),
	)
}

// ---------- middleware ----------------------------------------------------

func recoverer(logger *log.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					logger.Printf("panic: %v %s %s -> %v", r.Method, r.URL.Path, r.RemoteAddr, err)
					writeError(w, http.StatusInternalServerError, "internal_error", "something went wrong")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) { s.status = code; s.ResponseWriter.WriteHeader(code) }
func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func requestLog(logger *log.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			logger.Printf("%s %s %d %dB %s", r.Method, r.URL.RequestURI(), rec.status, rec.bytes, time.Since(start))
		})
	}
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Accept")
			h.Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

// gzipHandler compresses JSON / text responses when the client supports it.
type gzipResponseWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) { return g.gz.Write(b) }

func gzipHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, gz: gz}, r)
	})
}

// ---------- helpers used by handlers --------------------------------------

func writeJSONStatus(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
