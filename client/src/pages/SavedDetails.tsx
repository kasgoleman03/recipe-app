import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChefHat, ExternalLink, Play, Trash2 } from "lucide-react";
import { useDeleteRecipe, useRecipe } from "@/hooks/useRecipes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { highQualityMealImage } from "@/lib/utils";

/**
 * Saved-collection detail view. Same layout as Details but reads from
 * the server-owned collection via /api/recipes/:id (so it works
 * offline through the IDB fallback in useRecipe).
 */
export default function SavedDetails() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useRecipe(id);
  const remove = useDeleteRecipe();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <SavedSkeleton />;
  if (isError || !data) {
    return (
      <Empty
        title="Couldn't load this recipe"
        description={error instanceof Error ? error.message : "It may have been removed."}
      />
    );
  }
  const imageUrl = highQualityMealImage(data.imageUrl);

  return (
    <article className="space-y-8 animate-fade-in">
      <Link
        to="/collection"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to my collection
      </Link>

      <header className="grid md:grid-cols-2 gap-6 items-start">
        <div className="aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={data.title}
              decoding="async"
              fetchPriority="high"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            {data.category && (
              <Badge variant="sage" className="font-normal">
                {data.category}
              </Badge>
            )}
            {data.area && (
              <Badge variant="outline" className="font-normal">
                {data.area}
              </Badge>
            )}
            {data.tags?.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl tracking-tight">
            {data.title}
          </h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <Link to={`/cook/saved/${data.id}`}>
                <ChefHat className="h-4 w-4" aria-hidden="true" /> Start cooking
              </Link>
            </Button>
            {data.youtubeUrl && (
              <Button variant="outline" size="lg" asChild>
                <a href={data.youtubeUrl} target="_blank" rel="noreferrer">
                  <Play className="h-4 w-4" aria-hidden="true" /> Watch
                </a>
              </Button>
            )}
            {data.sourceUrl && (
              <Button variant="ghost" size="lg" asChild>
                <a href={data.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> Source
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
            </Button>
          </div>
        </div>
      </header>

      <section className="grid md:grid-cols-[320px,1fr] gap-8">
        <div>
          <h2 className="font-display text-xl tracking-tight mb-3">Ingredients</h2>
          <ul className="space-y-2">
            {data.ingredients.map((ing, i) => (
              <li
                key={`${ing.name}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2"
              >
                <span className="font-medium">{ing.name}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {ing.quantity ?? ""}
                  {ing.unit ? ` ${ing.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl tracking-tight mb-3">Method</h2>
          <ol className="space-y-4">
            {data.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-display"
                >
                  {i + 1}
                </span>
                <p className="leading-relaxed">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{data.title}"?</DialogTitle>
            <DialogDescription>
              This permanently removes the recipe from your collection.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync(data.id);
                  toast.success("Recipe removed");
                  navigate("/collection");
                } catch (err) {
                  toast.error("Could not remove", {
                    description: err instanceof Error ? err.message : "",
                  });
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function SavedSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-12 w-72" />
        </div>
      </div>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-10 text-center">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-6">
        <Link to="/collection">Back to collection</Link>
      </Button>
    </div>
  );
}
