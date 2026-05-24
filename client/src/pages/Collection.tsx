import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecipes, useDeleteRecipe } from "@/hooks/useRecipes";
import { RecipeCardSkeleton } from "@/components/RecipeCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, ChefHat, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, highQualityMealImage } from "@/lib/utils";

export default function Collection() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");

  const { data, isLoading } = useRecipes({
    search: search || undefined,
    sort,
  });
  const remove = useDeleteRecipe();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">My Collection</h1>
          <p className="text-muted-foreground mt-1">
            Recipes you've saved, served straight from the server.
          </p>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search saved recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search saved recipes"
          />
        </div>
        <SortPicker value={sort} onChange={setSort} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {data.map((r) => {
            const imageUrl = highQualityMealImage(r.imageUrl);

            return (
              <Card key={r.id} className="group relative overflow-hidden">
              <Link
                to={`/collection/${r.id}`}
                className="absolute inset-0 z-10"
                aria-label={`Open ${r.title}`}
              />
              <div className="aspect-[4/3] bg-muted overflow-hidden">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1280px) 296px, (min-width: 1024px) 31vw, (min-width: 640px) 48vw, 100vw"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-oat to-sage-tint" />
                )}
              </div>
              <CardContent className="p-4">
                <h3 className="font-display text-lg leading-tight tracking-tight line-clamp-2">
                  {r.title}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.category && (
                    <Badge variant="sage" className="font-normal">
                      {r.category}
                    </Badge>
                  )}
                  {r.area && (
                    <Badge variant="outline" className="font-normal">
                      {r.area}
                    </Badge>
                  )}
                </div>
                <div className="mt-4 flex gap-2 relative z-20">
                  <Button asChild size="sm">
                    <Link to={`/cook/saved/${r.id}`}>
                      <ChefHat className="h-4 w-4" aria-hidden="true" /> Cook
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmId(r.id);
                    }}
                    aria-label={`Remove ${r.title}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!confirmId}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this recipe?</DialogTitle>
            <DialogDescription>
              This permanently removes the recipe from your collection. You can save it
              again later from the browse page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmId) return;
                const id = confirmId;
                setConfirmId(null);
                try {
                  await remove.mutateAsync(id);
                  toast.success("Recipe removed");
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
    </div>
  );
}

function SortPicker({
  value,
  onChange,
}: {
  value: "newest" | "oldest" | "title";
  onChange: (v: "newest" | "oldest" | "title") => void;
}) {
  const options: { id: "newest" | "oldest" | "title"; label: string }[] = [
    { id: "newest", label: "Newest" },
    { id: "oldest", label: "Oldest" },
    { id: "title", label: "A–Z" },
  ];
  return (
    <div role="radiogroup" aria-label="Sort recipes" className="inline-flex rounded-md border border-input p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-3 h-9 text-sm font-medium transition-colors",
            value === o.id
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center max-w-md mx-auto">
      <p className="font-display text-2xl">Your collection is empty.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Save recipes from the browse page and they'll appear here, available offline.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Browse recipes</Link>
      </Button>
    </div>
  );
}
