// Single source of truth for talking to the Go backend.
//
// The client NEVER calls TheMealDB directly — every request goes through
// the Go proxy. Base URL is read from VITE_API_BASE_URL and falls back
// to a same-origin /api so the same build works locally (with the Vite
// dev proxy) and in production behind a reverse proxy.

import type {
  CategoriesEnvelope,
  FilterEnvelope,
  MealsEnvelope,
  Recipe,
  RecipeInput,
} from "@/types/recipe";

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}
export { ApiError };

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      body,
    });
  } catch (err) {
    // Network failure: surface a typed error so React Query's `error`
    // branch can show the offline toast / retry chip.
    throw new ApiError(0, "Network error", "network");
  }

  if (resp.status === 204) return undefined as T;

  const text = await resp.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!resp.ok) {
    const message =
      (parsed as { message?: string; error?: string } | undefined)?.message ??
      (parsed as { error?: string } | undefined)?.error ??
      resp.statusText;
    const code = (parsed as { error?: string } | undefined)?.error;
    throw new ApiError(resp.status, message, code);
  }
  return parsed as T;
}

// ---------- proxy (browse / discovery) ----------------------------------

export const api = {
  // ---- TheMealDB proxy plane ---------------------------------------------
  search(query: string) {
    const q = encodeURIComponent(query);
    return request<MealsEnvelope>(`/search?s=${q}`);
  },
  meal(id: string) {
    return request<MealsEnvelope>(`/meal/${encodeURIComponent(id)}`);
  },
  categories() {
    return request<CategoriesEnvelope>(`/categories`);
  },
  filter(category: string) {
    return request<FilterEnvelope>(`/filter?c=${encodeURIComponent(category)}`);
  },
  random() {
    return request<MealsEnvelope>(`/random`);
  },

  // ---- Server-owned saved collection -------------------------------------
  listRecipes(params?: { search?: string; tag?: string; sort?: string; maxTotal?: number }) {
    const search = new URLSearchParams();
    if (params?.search) search.set("search", params.search);
    if (params?.tag) search.set("tag", params.tag);
    if (params?.sort) search.set("sort", params.sort);
    if (params?.maxTotal) search.set("maxTotal", String(params.maxTotal));
    const qs = search.toString();
    return request<Recipe[]>(`/recipes${qs ? `?${qs}` : ""}`);
  },
  getRecipe(id: string) {
    return request<Recipe>(`/recipes/${encodeURIComponent(id)}`);
  },
  createRecipe(input: RecipeInput) {
    return request<Recipe>(`/recipes`, { method: "POST", json: input });
  },
  updateRecipe(id: string, input: RecipeInput) {
    return request<Recipe>(`/recipes/${encodeURIComponent(id)}`, {
      method: "PUT",
      json: input,
    });
  },
  deleteRecipe(id: string) {
    return request<void>(`/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// Helper used by Save buttons across the app: convert a TheMealDB meal
// shape into a RecipeInput payload. The server can also do this if you
// just send {sourceId} but the client copy lets us submit instantly
// for optimistic UI.
export function mealdbToInput(meal: import("@/types/recipe").MealdbMeal): RecipeInput {
  const ingredients: { name: string; quantity?: string; unit?: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? "").trim();
    const measure = (meal[`strMeasure${i}`] ?? "").trim();
    if (!name) continue;
    ingredients.push({ name, quantity: measure });
  }
  const steps = (meal.strInstructions ?? "")
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(\d+\s*[.)\-]\s*|step\s*\d+\s*[:.\-]?\s*)/i, "").trim())
    .filter(Boolean);
  const tags = (meal.strTags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    title: meal.strMeal,
    source: "themealdb",
    sourceId: meal.idMeal,
    category: meal.strCategory,
    area: meal.strArea,
    tags,
    imageUrl: meal.strMealThumb,
    youtubeUrl: meal.strYoutube,
    sourceUrl: meal.strSource,
    ingredients,
    steps,
  };
}
