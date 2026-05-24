// Lightweight IndexedDB mirror of the user's saved collection.
//
// Why two layers of cache?
//
//  1. The service worker's HTTP cache stores the raw /api/recipes
//     response. That's enough to render offline most of the time, but
//     the SW cache is best-effort — the browser may evict it under
//     storage pressure or after long inactivity.
//  2. IndexedDB (via the tiny `idb` helper) gives us a durable,
//     larger, structured copy that we treat as the offline read-model.
//     The server is still the source of truth: every successful network
//     read writes through to IDB; every successful mutation does the
//     same so the local view stays in sync without waiting on a refetch.

import { openDB, type IDBPDatabase } from "idb";
import type { Recipe } from "@/types/recipe";

const DB_NAME = "recipe-app";
const DB_VERSION = 1;
const RECIPES = "recipes";

let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(RECIPES)) {
          const s = db.createObjectStore(RECIPES, { keyPath: "id" });
          s.createIndex("by_updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbp;
}

export const recipeIDB = {
  async list(): Promise<Recipe[]> {
    try {
      const all = await (await db()).getAll(RECIPES);
      // newest first to match server default sort
      return (all as Recipe[]).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      );
    } catch {
      return [];
    }
  },
  async get(id: string): Promise<Recipe | undefined> {
    try {
      return (await (await db()).get(RECIPES, id)) as Recipe | undefined;
    } catch {
      return undefined;
    }
  },
  async putMany(recipes: Recipe[]): Promise<void> {
    try {
      const conn = await db();
      const tx = conn.transaction(RECIPES, "readwrite");
      const store = tx.objectStore(RECIPES);
      // Wipe-and-replace keeps deletions in sync without a separate sync log.
      await store.clear();
      for (const r of recipes) await store.put(r);
      await tx.done;
    } catch {
      // Storage may be unavailable (private mode, quota); ignore.
    }
  },
  async put(recipe: Recipe): Promise<void> {
    try {
      await (await db()).put(RECIPES, recipe);
    } catch {
      /* ignore */
    }
  },
  async delete(id: string): Promise<void> {
    try {
      await (await db()).delete(RECIPES, id);
    } catch {
      /* ignore */
    }
  },
};
