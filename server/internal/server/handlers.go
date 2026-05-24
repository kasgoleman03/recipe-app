// HTTP handlers for both planes:
//   - proxy*: forward selected TheMealDB endpoints (the upstream
//     API key is injected on the server side and never sent to the
//     client). Responses include sensible Cache-Control headers and the
//     /categories handler is additionally backed by an in-memory TTL
//     cache because that endpoint is hit on every Home page load.
//   - listRecipes/getRecipe/createRecipe/updateRecipe/deleteRecipe:
//     full CRUD against the SQLite store.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/recipe-app/server/internal/mealdb"
	"github.com/recipe-app/server/internal/models"
	"github.com/recipe-app/server/internal/store"
)

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSONStatus(w, http.StatusOK, []byte(`{"status":"ok"}`))
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	body, _ := json.Marshal(models.ErrorResponse{Error: code, Message: message})
	writeJSONStatus(w, status, body)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "encode_error", err.Error())
		return
	}
	writeJSONStatus(w, status, body)
}

// --- proxy handlers -------------------------------------------------------

func proxySearch(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("s"))
		body, status, err := d.MealDB.FetchRaw(r.Context(), "search.php", url.Values{"s": []string{q}})
		if err != nil {
			writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
			return
		}
		// Searches are personal; they go stale fast. Allow short SWR.
		w.Header().Set("Cache-Control", "public, max-age=30, stale-while-revalidate=300")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

func proxyMeal(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			writeError(w, http.StatusBadRequest, "missing_id", "id is required")
			return
		}
		body, status, err := d.MealDB.FetchRaw(r.Context(), "lookup.php", url.Values{"i": []string{id}})
		if err != nil {
			writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

// proxyCategories is special: TheMealDB's category list is essentially
// static, but we hit it on every Home load. Wrap it in an in-memory TTL
// cache (1h) AND set a long Cache-Control so the browser/SW can cache too.
func proxyCategories(d Deps) http.HandlerFunc {
	const ttl = time.Hour
	return func(w http.ResponseWriter, r *http.Request) {
		if cached, ok := d.CatCache.Get("categories"); ok {
			w.Header().Set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
			w.Header().Set("X-Cache", "HIT")
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_, _ = w.Write([]byte(cached))
			return
		}
		body, status, err := d.MealDB.FetchRaw(r.Context(), "categories.php", nil)
		if err != nil {
			writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
			return
		}
		if status == http.StatusOK {
			d.CatCache.Set("categories", string(body), ttl)
		}
		w.Header().Set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
		w.Header().Set("X-Cache", "MISS")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

func proxyFilter(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := strings.TrimSpace(r.URL.Query().Get("c"))
		if c == "" {
			writeError(w, http.StatusBadRequest, "missing_category", "c is required")
			return
		}
		body, status, err := d.MealDB.FetchRaw(r.Context(), "filter.php", url.Values{"c": []string{c}})
		if err != nil {
			writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

func proxyRandom(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, status, err := d.MealDB.FetchRaw(r.Context(), "random.php", nil)
		if err != nil {
			writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
			return
		}
		// Random must NOT be cached — that defeats the point.
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}
}

// --- collection (saved recipes) handlers ----------------------------------

func listRecipes(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f := store.ListFilter{
			Search: strings.TrimSpace(r.URL.Query().Get("search")),
			Tag:    strings.TrimSpace(r.URL.Query().Get("tag")),
			Sort:   strings.TrimSpace(r.URL.Query().Get("sort")),
		}
		if maxStr := r.URL.Query().Get("maxTotal"); maxStr != "" {
			if v, err := strconv.Atoi(maxStr); err == nil && v >= 0 {
				f.MaxTotal = v
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		items, err := d.Store.List(ctx, f)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
			return
		}
		// Saved recipes change on user action: short cache so the SW
		// can return stale-while-revalidate, browser doesn't keep them
		// for long.
		w.Header().Set("Cache-Control", "no-cache")
		writeJSON(w, http.StatusOK, items)
	}
}

func getRecipe(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		item, err := d.Store.Get(ctx, id)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "recipe not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "get_failed", err.Error())
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		writeJSON(w, http.StatusOK, item)
	}
}

// createRecipe accepts two shapes:
//
//  1. A normalized RecipeInput (preferred). The client sends this when
//     saving from a TheMealDB meal so the server stores its own copy.
//  2. {"sourceId": "..."} as a convenience for the cli/curl path.
//     If sourceId is set and ingredients/steps are empty, the server
//     looks up the meal upstream and normalizes it server-side.
func createRecipe(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()

		var in models.RecipeInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_json", err.Error())
			return
		}
		if in.SourceID != "" && (in.Title == "" || len(in.Ingredients) == 0) {
			meal, err := d.MealDB.LookupMeal(ctx, in.SourceID)
			if err != nil {
				writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
				return
			}
			if meal == nil {
				writeError(w, http.StatusNotFound, "upstream_missing", "meal not found upstream")
				return
			}
			in = mealdb.ToRecipeInput(*meal)
		}
		if strings.TrimSpace(in.Title) == "" {
			writeError(w, http.StatusBadRequest, "missing_title", "title is required")
			return
		}

		rec, err := d.Store.Create(ctx, in)
		if errors.Is(err, store.ErrDuplicate) {
			writeError(w, http.StatusConflict, "duplicate", "recipe already saved")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, rec)
	}
}

func updateRecipe(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		var in models.RecipeInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_json", err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		rec, err := d.Store.Update(ctx, id, in)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "recipe not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "update_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, rec)
	}
}

func deleteRecipe(d Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if err := d.Store.Delete(ctx, id); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "recipe not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "delete_failed", err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
