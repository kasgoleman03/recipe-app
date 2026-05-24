// Normalization: TheMealDB returns a flat record with strIngredient1..20
// and strMeasure1..20 fields, plus a single instructions blob. We
// translate that into our structured Recipe shape on the server, never
// on the client, so the saved copy is independent of upstream changes.
package mealdb

import (
	"regexp"
	"strings"

	"github.com/recipe-app/server/internal/models"
)

// MealDoc mirrors a single object inside the {"meals":[...]} envelope.
// Only the fields we read are listed; the proxy handlers forward the
// raw body so anything we miss here still reaches the client.
type MealDoc struct {
	IDMeal       string `json:"idMeal"`
	StrMeal      string `json:"strMeal"`
	StrCategory  string `json:"strCategory"`
	StrArea      string `json:"strArea"`
	StrTags      string `json:"strTags"`
	StrMealThumb string `json:"strMealThumb"`
	StrYoutube   string `json:"strYoutube"`
	StrSource    string `json:"strSource"`
	StrInstructions string `json:"strInstructions"`

	StrIngredient1  string `json:"strIngredient1"`
	StrIngredient2  string `json:"strIngredient2"`
	StrIngredient3  string `json:"strIngredient3"`
	StrIngredient4  string `json:"strIngredient4"`
	StrIngredient5  string `json:"strIngredient5"`
	StrIngredient6  string `json:"strIngredient6"`
	StrIngredient7  string `json:"strIngredient7"`
	StrIngredient8  string `json:"strIngredient8"`
	StrIngredient9  string `json:"strIngredient9"`
	StrIngredient10 string `json:"strIngredient10"`
	StrIngredient11 string `json:"strIngredient11"`
	StrIngredient12 string `json:"strIngredient12"`
	StrIngredient13 string `json:"strIngredient13"`
	StrIngredient14 string `json:"strIngredient14"`
	StrIngredient15 string `json:"strIngredient15"`
	StrIngredient16 string `json:"strIngredient16"`
	StrIngredient17 string `json:"strIngredient17"`
	StrIngredient18 string `json:"strIngredient18"`
	StrIngredient19 string `json:"strIngredient19"`
	StrIngredient20 string `json:"strIngredient20"`

	StrMeasure1  string `json:"strMeasure1"`
	StrMeasure2  string `json:"strMeasure2"`
	StrMeasure3  string `json:"strMeasure3"`
	StrMeasure4  string `json:"strMeasure4"`
	StrMeasure5  string `json:"strMeasure5"`
	StrMeasure6  string `json:"strMeasure6"`
	StrMeasure7  string `json:"strMeasure7"`
	StrMeasure8  string `json:"strMeasure8"`
	StrMeasure9  string `json:"strMeasure9"`
	StrMeasure10 string `json:"strMeasure10"`
	StrMeasure11 string `json:"strMeasure11"`
	StrMeasure12 string `json:"strMeasure12"`
	StrMeasure13 string `json:"strMeasure13"`
	StrMeasure14 string `json:"strMeasure14"`
	StrMeasure15 string `json:"strMeasure15"`
	StrMeasure16 string `json:"strMeasure16"`
	StrMeasure17 string `json:"strMeasure17"`
	StrMeasure18 string `json:"strMeasure18"`
	StrMeasure19 string `json:"strMeasure19"`
	StrMeasure20 string `json:"strMeasure20"`
}

// stepSplitter matches sequences that reliably end a "step":
//   - newlines (\r\n, \n)
//   - "STEP 1:" / "Step 2." style prefixes
//   - numbered list prefixes "1.", "2)" at the start of a line
// The .splitInstructions function uses this together with a fallback
// sentence splitter so most real TheMealDB instructions become
// reasonable per-step strings for cooking mode.
var (
	multiNewline = regexp.MustCompile(`\r?\n+`)
	leadNumber   = regexp.MustCompile(`^\s*(\d+\s*[.)\-]\s*|step\s*\d+\s*[:.\-]?\s*)`)
)

// splitInstructions breaks a single instructions blob into ordered
// "steps" for the cooking-mode UI.
//
// Strategy: prefer hard newlines (most TheMealDB entries already use
// them). If the text contains zero/one newline, fall back to splitting
// on sentence boundaries so the cook gets bite-sized steps to glance at.
func splitInstructions(blob string) []string {
	blob = strings.TrimSpace(blob)
	if blob == "" {
		return []string{}
	}
	parts := multiNewline.Split(blob, -1)
	if len(parts) <= 1 {
		// Fallback: split on ". " followed by an uppercase letter.
		parts = splitSentences(blob)
	}
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		// Strip "1." / "STEP 2:" leaders – they're noise once we have a
		// dedicated step counter in the UI.
		p = leadNumber.ReplaceAllString(p, "")
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	if len(out) == 0 {
		out = []string{blob}
	}
	return out
}

func splitSentences(s string) []string {
	var out []string
	var b strings.Builder
	for i, r := range s {
		b.WriteRune(r)
		if (r == '.' || r == '!' || r == '?') && i+1 < len(s) && s[i+1] == ' ' {
			out = append(out, b.String())
			b.Reset()
		}
	}
	if b.Len() > 0 {
		out = append(out, b.String())
	}
	return out
}

// ToRecipeInput turns a TheMealDB doc into our structured RecipeInput
// shape, ready to feed straight into store.Create. Empty fields are
// dropped so the saved copy is tidy.
func ToRecipeInput(m MealDoc) models.RecipeInput {
	in := models.RecipeInput{
		Title:       m.StrMeal,
		Source:      "themealdb",
		SourceID:    m.IDMeal,
		Category:    m.StrCategory,
		Area:        m.StrArea,
		ImageURL:    m.StrMealThumb,
		YouTubeURL:  m.StrYoutube,
		SourceURL:   m.StrSource,
		Tags:        splitTags(m.StrTags),
		Ingredients: zipIngredients(m),
		Steps:       splitInstructions(m.StrInstructions),
	}
	return in
}

func splitTags(s string) []string {
	if s = strings.TrimSpace(s); s == "" {
		return []string{}
	}
	parts := strings.Split(s, ",")
	out := parts[:0]
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// zipIngredients pairs strIngredientN with strMeasureN. We treat empty
// ingredient names as the end-of-list marker.
func zipIngredients(m MealDoc) []models.Ingredient {
	pairs := [][2]string{
		{m.StrIngredient1, m.StrMeasure1}, {m.StrIngredient2, m.StrMeasure2},
		{m.StrIngredient3, m.StrMeasure3}, {m.StrIngredient4, m.StrMeasure4},
		{m.StrIngredient5, m.StrMeasure5}, {m.StrIngredient6, m.StrMeasure6},
		{m.StrIngredient7, m.StrMeasure7}, {m.StrIngredient8, m.StrMeasure8},
		{m.StrIngredient9, m.StrMeasure9}, {m.StrIngredient10, m.StrMeasure10},
		{m.StrIngredient11, m.StrMeasure11}, {m.StrIngredient12, m.StrMeasure12},
		{m.StrIngredient13, m.StrMeasure13}, {m.StrIngredient14, m.StrMeasure14},
		{m.StrIngredient15, m.StrMeasure15}, {m.StrIngredient16, m.StrMeasure16},
		{m.StrIngredient17, m.StrMeasure17}, {m.StrIngredient18, m.StrMeasure18},
		{m.StrIngredient19, m.StrMeasure19}, {m.StrIngredient20, m.StrMeasure20},
	}
	out := make([]models.Ingredient, 0, len(pairs))
	for _, p := range pairs {
		name := strings.TrimSpace(p[0])
		if name == "" {
			continue
		}
		quantity, unit := splitMeasure(p[1])
		out = append(out, models.Ingredient{Name: name, Quantity: quantity, Unit: unit})
	}
	return out
}

// splitMeasure makes a best-effort split of "1 1/2 cups" into ("1 1/2",
// "cups"). It is intentionally simple: if it can't find a unit it
// stuffs the whole thing into Quantity. The user can always edit later.
func splitMeasure(measure string) (quantity, unit string) {
	measure = strings.TrimSpace(measure)
	if measure == "" {
		return "", ""
	}
	// Walk from the start collecting numeric/fractional tokens, the rest is the unit.
	tokens := strings.Fields(measure)
	if len(tokens) == 0 {
		return "", ""
	}
	cut := 0
	for _, t := range tokens {
		if !looksNumeric(t) {
			break
		}
		cut++
	}
	if cut == 0 {
		// No numeric prefix at all: everything is the unit ("to taste").
		return "", measure
	}
	quantity = strings.Join(tokens[:cut], " ")
	unit = strings.Join(tokens[cut:], " ")
	return
}

func looksNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '.' || r == ',' || r == '/' || r == '-' || r == '½' || r == '¼' || r == '¾' || r == '⅓' || r == '⅔' {
			continue
		}
		return false
	}
	return true
}
