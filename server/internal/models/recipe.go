// Package models defines the JSON-serializable types exchanged between
// the server and the client. They are also the on-disk shape (modulo
// JSON-encoded columns) of the "recipes" table.
package models

import "time"

// Ingredient is one structured row of an ingredient list. We normalize
// TheMealDB's flat strIngredientN/strMeasureN pairs into this struct on
// save so the server stores its own structured copy.
type Ingredient struct {
	Name     string `json:"name"`
	Quantity string `json:"quantity,omitempty"`
	Unit     string `json:"unit,omitempty"`
}

// Recipe is the saved-collection record. `id` is a server-generated
// UUID. `source` + `sourceId` exist so we can de-duplicate when the same
// TheMealDB meal is saved twice.
type Recipe struct {
	ID               string       `json:"id"`
	Title            string       `json:"title"`
	Source           string       `json:"source"` // "themealdb" | "manual"
	SourceID         string       `json:"sourceId,omitempty"`
	Category         string       `json:"category,omitempty"`
	Area             string       `json:"area,omitempty"`
	Tags             []string     `json:"tags"`
	ImageURL         string       `json:"imageUrl,omitempty"`
	PrepTimeMinutes  *int         `json:"prepTimeMinutes,omitempty"`
	CookTimeMinutes  *int         `json:"cookTimeMinutes,omitempty"`
	Servings         *int         `json:"servings,omitempty"`
	Ingredients      []Ingredient `json:"ingredients"`
	Steps            []string     `json:"steps"`
	YouTubeURL       string       `json:"youtubeUrl,omitempty"`
	SourceURL        string       `json:"sourceUrl,omitempty"`
	CreatedAt        time.Time    `json:"createdAt"`
	UpdatedAt        time.Time    `json:"updatedAt"`
}

// RecipeInput is the payload accepted by POST/PUT. We don't trust the
// client-supplied id; the server generates and owns it.
type RecipeInput struct {
	Title            string       `json:"title"`
	Source           string       `json:"source,omitempty"`
	SourceID         string       `json:"sourceId,omitempty"`
	Category         string       `json:"category,omitempty"`
	Area             string       `json:"area,omitempty"`
	Tags             []string     `json:"tags,omitempty"`
	ImageURL         string       `json:"imageUrl,omitempty"`
	PrepTimeMinutes  *int         `json:"prepTimeMinutes,omitempty"`
	CookTimeMinutes  *int         `json:"cookTimeMinutes,omitempty"`
	Servings         *int         `json:"servings,omitempty"`
	Ingredients      []Ingredient `json:"ingredients,omitempty"`
	Steps            []string     `json:"steps,omitempty"`
	YouTubeURL       string       `json:"youtubeUrl,omitempty"`
	SourceURL        string       `json:"sourceUrl,omitempty"`
}

// ErrorResponse is the canonical JSON error shape returned by the API.
// All non-2xx responses include this body.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}
