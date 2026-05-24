// Package store owns the persistent recipe collection.
//
// It is the single source of truth for saved recipes (the
// Collection/Persistence plane). The current implementation uses SQLite
// via the pure-Go modernc.org/sqlite driver so the server can be
// deployed on free hosts without CGO.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite" // register the pure-Go SQLite driver

	"github.com/recipe-app/server/internal/models"
)

// ErrNotFound is returned when a recipe id does not exist.
var ErrNotFound = errors.New("recipe not found")

// ErrDuplicate is returned when a (source, sourceId) pair is saved twice.
var ErrDuplicate = errors.New("recipe already saved")

type Store struct {
	db *sql.DB
}

// Open opens (and migrates) the SQLite database at path.
func Open(path string) (*Store, error) {
	// _journal_mode=WAL improves concurrent read perf and is safe for
	// single-writer apps like ours. _busy_timeout reduces SQLITE_BUSY
	// errors on hot reload.
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite serializes writes anyway
	if err := db.Ping(); err != nil {
		return nil, err
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

const schema = `
CREATE TABLE IF NOT EXISTS recipes (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'manual',
  source_id         TEXT,
  category          TEXT,
  area              TEXT,
  tags              TEXT NOT NULL DEFAULT '[]',
  image_url         TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  servings          INTEGER,
  ingredients       TEXT NOT NULL DEFAULT '[]',
  steps             TEXT NOT NULL DEFAULT '[]',
  youtube_url       TEXT,
  source_url        TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_source ON recipes(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_title    ON recipes(title);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
`

// ListFilter narrows the result set returned by List.
type ListFilter struct {
	Search   string // matches against title (case-insensitive substring)
	Tag      string // matches if tag is present in tags JSON array
	MaxTotal int    // prep+cook minutes ceiling, 0 = unlimited
	Sort     string // "newest" (default), "oldest", "title"
}

func (s *Store) List(ctx context.Context, f ListFilter) ([]models.Recipe, error) {
	q := `SELECT id, title, source, source_id, category, area, tags, image_url,
	             prep_time_minutes, cook_time_minutes, servings, ingredients, steps,
	             youtube_url, source_url, created_at, updated_at
	      FROM recipes`
	var where []string
	var args []any
	if f.Search != "" {
		where = append(where, "LOWER(title) LIKE ?")
		args = append(args, "%"+strings.ToLower(f.Search)+"%")
	}
	if f.Tag != "" {
		// SQLite JSON1 isn't guaranteed; do a permissive substring match
		// against the JSON array text. Tags are short, this is fine.
		where = append(where, "LOWER(tags) LIKE ?")
		args = append(args, `%"`+strings.ToLower(f.Tag)+`"%`)
	}
	if f.MaxTotal > 0 {
		where = append(where, "COALESCE(prep_time_minutes,0) + COALESCE(cook_time_minutes,0) <= ?")
		args = append(args, f.MaxTotal)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	switch f.Sort {
	case "oldest":
		q += " ORDER BY created_at ASC"
	case "title":
		q += " ORDER BY LOWER(title) ASC"
	default:
		q += " ORDER BY created_at DESC"
	}

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Recipe
	for rows.Next() {
		r, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	if out == nil {
		out = []models.Recipe{}
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (models.Recipe, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, title, source, source_id, category, area, tags, image_url,
		       prep_time_minutes, cook_time_minutes, servings, ingredients, steps,
		       youtube_url, source_url, created_at, updated_at
		FROM recipes WHERE id = ?`, id)
	r, err := scanRecipe(row)
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	return r, err
}

// Create persists a new recipe and returns the stored copy. If a
// (source, sourceId) row already exists, ErrDuplicate is returned.
func (s *Store) Create(ctx context.Context, in models.RecipeInput) (models.Recipe, error) {
	now := time.Now().UTC()
	r := models.Recipe{
		ID:              uuid.NewString(),
		Title:           strings.TrimSpace(in.Title),
		Source:          firstNonEmpty(in.Source, "manual"),
		SourceID:        in.SourceID,
		Category:        in.Category,
		Area:            in.Area,
		Tags:            nilSafe(in.Tags),
		ImageURL:        in.ImageURL,
		PrepTimeMinutes: in.PrepTimeMinutes,
		CookTimeMinutes: in.CookTimeMinutes,
		Servings:        in.Servings,
		Ingredients:     nilSafeIng(in.Ingredients),
		Steps:           nilSafeStr(in.Steps),
		YouTubeURL:      in.YouTubeURL,
		SourceURL:       in.SourceURL,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	tagsJSON, _ := json.Marshal(r.Tags)
	ingJSON, _ := json.Marshal(r.Ingredients)
	stepsJSON, _ := json.Marshal(r.Steps)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO recipes (
			id, title, source, source_id, category, area, tags, image_url,
			prep_time_minutes, cook_time_minutes, servings, ingredients, steps,
			youtube_url, source_url, created_at, updated_at
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		r.ID, r.Title, r.Source, nullIfEmpty(r.SourceID), nullIfEmpty(r.Category), nullIfEmpty(r.Area),
		string(tagsJSON), nullIfEmpty(r.ImageURL),
		r.PrepTimeMinutes, r.CookTimeMinutes, r.Servings,
		string(ingJSON), string(stepsJSON),
		nullIfEmpty(r.YouTubeURL), nullIfEmpty(r.SourceURL),
		r.CreatedAt, r.UpdatedAt,
	)
	if err != nil {
		// Detect uniqueness violations on (source, source_id) so the API
		// can return a clean 409 instead of a 500.
		if strings.Contains(err.Error(), "UNIQUE") {
			return models.Recipe{}, ErrDuplicate
		}
		return models.Recipe{}, err
	}
	return r, nil
}

// Update replaces an existing recipe in place.
func (s *Store) Update(ctx context.Context, id string, in models.RecipeInput) (models.Recipe, error) {
	cur, err := s.Get(ctx, id)
	if err != nil {
		return models.Recipe{}, err
	}
	if t := strings.TrimSpace(in.Title); t != "" {
		cur.Title = t
	}
	if in.Category != "" {
		cur.Category = in.Category
	}
	if in.Area != "" {
		cur.Area = in.Area
	}
	if in.Tags != nil {
		cur.Tags = in.Tags
	}
	if in.ImageURL != "" {
		cur.ImageURL = in.ImageURL
	}
	if in.PrepTimeMinutes != nil {
		cur.PrepTimeMinutes = in.PrepTimeMinutes
	}
	if in.CookTimeMinutes != nil {
		cur.CookTimeMinutes = in.CookTimeMinutes
	}
	if in.Servings != nil {
		cur.Servings = in.Servings
	}
	if in.Ingredients != nil {
		cur.Ingredients = in.Ingredients
	}
	if in.Steps != nil {
		cur.Steps = in.Steps
	}
	if in.YouTubeURL != "" {
		cur.YouTubeURL = in.YouTubeURL
	}
	if in.SourceURL != "" {
		cur.SourceURL = in.SourceURL
	}
	cur.UpdatedAt = time.Now().UTC()

	tagsJSON, _ := json.Marshal(cur.Tags)
	ingJSON, _ := json.Marshal(cur.Ingredients)
	stepsJSON, _ := json.Marshal(cur.Steps)

	_, err = s.db.ExecContext(ctx, `
		UPDATE recipes SET
			title = ?, category = ?, area = ?, tags = ?, image_url = ?,
			prep_time_minutes = ?, cook_time_minutes = ?, servings = ?,
			ingredients = ?, steps = ?, youtube_url = ?, source_url = ?,
			updated_at = ?
		WHERE id = ?`,
		cur.Title, nullIfEmpty(cur.Category), nullIfEmpty(cur.Area), string(tagsJSON),
		nullIfEmpty(cur.ImageURL),
		cur.PrepTimeMinutes, cur.CookTimeMinutes, cur.Servings,
		string(ingJSON), string(stepsJSON),
		nullIfEmpty(cur.YouTubeURL), nullIfEmpty(cur.SourceURL),
		cur.UpdatedAt, id,
	)
	if err != nil {
		return models.Recipe{}, err
	}
	return cur, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM recipes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// scanRecipe is the shared row mapper used by Get and List. It accepts
// anything that implements Scan (sql.Row or sql.Rows).
type scanner interface {
	Scan(dest ...any) error
}

func scanRecipe(s scanner) (models.Recipe, error) {
	var (
		r            models.Recipe
		sourceID     sql.NullString
		category     sql.NullString
		area         sql.NullString
		imageURL     sql.NullString
		youtube      sql.NullString
		sourceURL    sql.NullString
		prep, cook   sql.NullInt64
		servings     sql.NullInt64
		tagsJSON     string
		ingJSON      string
		stepsJSON    string
	)
	if err := s.Scan(
		&r.ID, &r.Title, &r.Source, &sourceID, &category, &area, &tagsJSON,
		&imageURL, &prep, &cook, &servings, &ingJSON, &stepsJSON,
		&youtube, &sourceURL, &r.CreatedAt, &r.UpdatedAt,
	); err != nil {
		return r, err
	}
	r.SourceID = sourceID.String
	r.Category = category.String
	r.Area = area.String
	r.ImageURL = imageURL.String
	r.YouTubeURL = youtube.String
	r.SourceURL = sourceURL.String
	if prep.Valid {
		v := int(prep.Int64)
		r.PrepTimeMinutes = &v
	}
	if cook.Valid {
		v := int(cook.Int64)
		r.CookTimeMinutes = &v
	}
	if servings.Valid {
		v := int(servings.Int64)
		r.Servings = &v
	}
	_ = json.Unmarshal([]byte(tagsJSON), &r.Tags)
	_ = json.Unmarshal([]byte(ingJSON), &r.Ingredients)
	_ = json.Unmarshal([]byte(stepsJSON), &r.Steps)
	if r.Tags == nil {
		r.Tags = []string{}
	}
	if r.Ingredients == nil {
		r.Ingredients = []models.Ingredient{}
	}
	if r.Steps == nil {
		r.Steps = []string{}
	}
	return r, nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}
func nilSafe(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
func nilSafeIng(s []models.Ingredient) []models.Ingredient {
	if s == nil {
		return []models.Ingredient{}
	}
	return s
}
func nilSafeStr(s []string) []string { return nilSafe(s) }
