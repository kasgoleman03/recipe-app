// React Query hooks for the saved-collection plane.
//
// On every successful network read we mirror the result into IndexedDB
// so the same queries can later serve from IDB while offline. On
// mutations we also update the cache + IDB in lockstep.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { recipeIDB } from "@/lib/idb";
import { cacheSavedRecipeAssets, deleteSavedRecipeAssets } from "@/lib/offline-cache";
import type { Recipe, RecipeInput } from "@/types/recipe";

const KEY = {
  list: (params?: object) => ["recipes", "list", params ?? {}] as const,
  one: (id: string) => ["recipes", "one", id] as const,
};

export function useRecipes(params?: { search?: string; tag?: string; sort?: string }) {
  return useQuery({
    queryKey: KEY.list(params),
    queryFn: async () => {
      try {
        const list = await api.listRecipes(params);
        // Mirror to IDB so we can read the collection offline. We only
        // mirror the unfiltered "everything" query so client filters
        // still work offline. If params are present, skip the mirror.
        if (!params || Object.keys(params).length === 0) {
          await recipeIDB.putMany(list);
          await Promise.allSettled(list.map((recipe) => cacheSavedRecipeAssets(recipe)));
        }
        return list;
      } catch (err) {
        // Offline / server down? Fall back to IDB.
        const idb = await recipeIDB.list();
        if (idb.length > 0) return idb;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEY.one(id) : ["recipes", "one", "none"],
    enabled: !!id,
    queryFn: async () => {
      try {
        const r = await api.getRecipe(id!);
        await recipeIDB.put(r);
        await cacheSavedRecipeAssets(r);
        return r;
      } catch (err) {
        const cached = await recipeIDB.get(id!);
        if (cached) return cached;
        throw err;
      }
    },
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeInput) => api.createRecipe(input),
    onSuccess: async (recipe) => {
      await recipeIDB.put(recipe);
      await cacheSavedRecipeAssets(recipe);
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeInput }) =>
      api.updateRecipe(id, input),
    onSuccess: async (recipe) => {
      await recipeIDB.put(recipe);
      await cacheSavedRecipeAssets(recipe);
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deleteRecipe(id);
      return id;
    },
    onMutate: async (id) => {
      // Optimistic: yank from current cache lists.
      await qc.cancelQueries({ queryKey: ["recipes"] });
      const previous = qc.getQueriesData<Recipe[]>({ queryKey: ["recipes", "list"] });
      previous.forEach(([key, list]) => {
        if (Array.isArray(list)) {
          qc.setQueryData(
            key,
            list.filter((r) => r.id !== id),
          );
        }
      });
      const deletedRecipe = previous
        .flatMap(([, list]) => list ?? [])
        .find((recipe) => recipe.id === id);
      return { previous, deletedRecipe };
    },
    onError: (_err, _id, ctx) => {
      // Roll back the optimistic update if the server rejected.
      ctx?.previous.forEach(([key, list]) => qc.setQueryData(key, list));
    },
    onSuccess: async (id, _variables, ctx) => {
      await recipeIDB.delete(id);
      await deleteSavedRecipeAssets(ctx?.deletedRecipe);
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

/**
 * Hook used by Save toggles to know whether a TheMealDB meal is already
 * saved (by sourceId) without needing a per-card request.
 */
export function useIsSaved(sourceId: string | undefined) {
  const list = useRecipes();
  const recipe = list.data?.find(
    (r) => r.source === "themealdb" && r.sourceId === sourceId,
  );
  return { recipe, ready: list.isSuccess || list.isError };
}
