// React Query hooks for the TheMealDB proxy plane (read-only browse).
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMealdbCategories() {
  return useQuery({
    queryKey: ["mealdb", "categories"],
    queryFn: () => api.categories(),
    staleTime: 60 * 60 * 1000,
  });
}

export function useMealdbSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["mealdb", "search", trimmed],
    queryFn: () => api.search(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 60_000,
  });
}

export function useMealdbFilter(category: string | null) {
  return useQuery({
    queryKey: ["mealdb", "filter", category],
    queryFn: () => api.filter(category!),
    enabled: !!category,
    staleTime: 60 * 60 * 1000,
  });
}

export function useMealdbMeal(id: string | undefined) {
  return useQuery({
    queryKey: ["mealdb", "meal", id],
    queryFn: () => api.meal(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
