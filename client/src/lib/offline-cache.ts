import { API_BASE } from "@/lib/api";
import { highQualityMealImage } from "@/lib/utils";
import type { Recipe } from "@/types/recipe";

/**
 * Stable cache used for saved recipe assets. The service worker also
 * checks this cache, so saved recipe cards can still show their images
 * and full detail/cooking pages when the network is unavailable.
 */
export const SAVED_RECIPE_ASSET_CACHE = "recipe-app-saved-assets-v1";

function canUseCacheStorage(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

async function cacheSameOriginRoute(cache: Cache, route: string): Promise<void> {
  try {
    const request = new Request(route, { cache: "reload" });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  } catch {
    // Offline warmup is best-effort; IndexedDB remains the source for recipe data.
  }
}

async function cacheApiRead(cache: Cache, path: string): Promise<void> {
  try {
    const request = new Request(`${API_BASE}${path}`, {
      cache: "reload",
      headers: { Accept: "application/json" },
    });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  } catch {
    // Cross-origin API caching can fail if CORS/CDN policy changes. Ignore safely.
  }
}

async function cacheImage(cache: Cache, imageUrl: string): Promise<void> {
  try {
    // no-cors lets us store an opaque cross-origin TheMealDB image response.
    // The browser can later serve that opaque response back to <img> offline.
    const request = new Request(imageUrl, { mode: "no-cors", cache: "reload" });
    const response = await fetch(request);
    await cache.put(request, response);
  } catch {
    // Image caching is a polish layer; never block saving a recipe on it.
  }
}

/**
 * Warm every offline asset needed for a saved recipe card/detail/cooking flow:
 *   - the high-quality recipe image
 *   - SPA routes for collection, detail, and cooking mode
 *   - server API reads for list/detail, so the SW has HTTP cache fallbacks too
 *
 * The complete structured recipe (category, ingredients, instructions, links)
 * is stored separately in IndexedDB by recipeIDB.
 */
export async function cacheSavedRecipeAssets(recipe: Recipe): Promise<void> {
  if (!canUseCacheStorage()) return;

  const cache = await caches.open(SAVED_RECIPE_ASSET_CACHE);
  const imageUrl = highQualityMealImage(recipe.imageUrl);
  const sourceRecipeRoute =
    recipe.source === "themealdb" && recipe.sourceId ? `/recipe/${recipe.sourceId}` : null;
  const sourceCookingRoute =
    recipe.source === "themealdb" && recipe.sourceId ? `/cook/source/${recipe.sourceId}` : null;
  const sourceMealApi =
    recipe.source === "themealdb" && recipe.sourceId
      ? `/meal/${encodeURIComponent(recipe.sourceId)}`
      : null;

  await Promise.allSettled([
    imageUrl ? cacheImage(cache, imageUrl) : Promise.resolve(),
    cacheSameOriginRoute(cache, "/collection"),
    cacheSameOriginRoute(cache, `/collection/${recipe.id}`),
    cacheSameOriginRoute(cache, `/cook/saved/${recipe.id}`),
    sourceRecipeRoute ? cacheSameOriginRoute(cache, sourceRecipeRoute) : Promise.resolve(),
    sourceCookingRoute ? cacheSameOriginRoute(cache, sourceCookingRoute) : Promise.resolve(),
    cacheApiRead(cache, "/recipes"),
    cacheApiRead(cache, `/recipes/${encodeURIComponent(recipe.id)}`),
    sourceMealApi ? cacheApiRead(cache, sourceMealApi) : Promise.resolve(),
  ]);
}

export async function deleteSavedRecipeAssets(recipe: Recipe | undefined): Promise<void> {
  if (!recipe || !canUseCacheStorage()) return;

  const cache = await caches.open(SAVED_RECIPE_ASSET_CACHE);
  const imageUrl = highQualityMealImage(recipe.imageUrl);

  await Promise.allSettled([
    imageUrl ? cache.delete(new Request(imageUrl, { mode: "no-cors" })) : Promise.resolve(),
    cache.delete(`/collection/${recipe.id}`),
    cache.delete(`/cook/saved/${recipe.id}`),
    cache.delete(`${API_BASE}/recipes/${encodeURIComponent(recipe.id)}`),
    recipe.source === "themealdb" && recipe.sourceId
      ? cache.delete(`/recipe/${recipe.sourceId}`)
      : Promise.resolve(),
    recipe.source === "themealdb" && recipe.sourceId
      ? cache.delete(`/cook/source/${recipe.sourceId}`)
      : Promise.resolve(),
    recipe.source === "themealdb" && recipe.sourceId
      ? cache.delete(`${API_BASE}/meal/${encodeURIComponent(recipe.sourceId)}`)
      : Promise.resolve(),
  ]);
}
