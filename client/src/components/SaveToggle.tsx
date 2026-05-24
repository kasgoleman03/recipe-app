import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { api, mealdbToInput } from "@/lib/api";
import { useCreateRecipe, useDeleteRecipe, useIsSaved } from "@/hooks/useRecipes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  sourceId: string;
  title: string;
  /**
   * If the caller already has the full TheMealDB meal, pass it so we can
   * save without an extra lookup. Otherwise we hit /api/meal/:id first.
   */
  meal?: import("@/types/recipe").MealdbMeal;
  className?: string;
  size?: "sm" | "default" | "icon";
}

/**
 * SaveToggle is the binary "save / unsave" pill used on cards and the
 * detail page. It reflects the server-owned collection: a recipe is
 * "saved" iff a row with (source=themealdb, sourceId=...) exists.
 *
 * Optimistic UI: we flip the local state immediately, fire the
 * mutation, and roll back on error. React Query invalidates the
 * collection list on success so other surfaces re-render in step.
 */
export function SaveToggle({ sourceId, title, meal, className, size = "icon" }: Props) {
  const { recipe, ready } = useIsSaved(sourceId);
  const create = useCreateRecipe();
  const remove = useDeleteRecipe();
  const [pending, setPending] = useState(false);

  // After saving, "recipe" appears in the list — drop our pending flag.
  useEffect(() => {
    if (pending && (create.isSuccess || create.isError || remove.isSuccess || remove.isError)) {
      setPending(false);
    }
  }, [pending, create.isSuccess, create.isError, remove.isSuccess, remove.isError]);

  const isSaved = !!recipe;

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ready) return;
    setPending(true);
    if (recipe) {
      try {
        await remove.mutateAsync(recipe.id);
        toast.success("Removed from your collection", { description: title });
      } catch (err) {
        toast.error("Could not remove recipe", {
          description: err instanceof Error ? err.message : "",
        });
      }
      return;
    }
    try {
      let payload;
      if (meal) {
        payload = mealdbToInput(meal);
      } else {
        // Fetch the full meal so we can store a structured copy on the server.
        const lookup = await api.meal(sourceId);
        const m = lookup.meals?.[0];
        if (!m) throw new Error("Recipe not found upstream");
        payload = mealdbToInput(m);
      }
      await create.mutateAsync(payload);
      toast.success("Saved to your collection", { description: title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      // Server returns 409 if a duplicate slips through a race.
      toast(message);
    }
  };

  const label = isSaved ? `Remove ${title} from collection` : `Save ${title} to collection`;

  return (
    <Button
      variant={isSaved ? "default" : "secondary"}
      size={size}
      aria-pressed={isSaved}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={pending || !ready}
      className={cn(
        "z-20 backdrop-blur transition-all",
        isSaved ? "" : "bg-card/80 hover:bg-card",
        className,
      )}
    >
      {isSaved ? (
        <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Bookmark className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
