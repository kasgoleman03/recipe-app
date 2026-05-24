import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Play, ChefHat } from "lucide-react";
import { useMealdbMeal } from "@/hooks/useMealdb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveToggle } from "@/components/SaveToggle";
import { mealdbToInput } from "@/lib/api";
import { formatMinutes, highQualityMealImage } from "@/lib/utils";
import type { MealdbMeal } from "@/types/recipe";

/**
 * "Details" view for a TheMealDB meal (browse plane). The "Cooking
 * mode" entry point on this page navigates to /cook/source/:id which
 * reads from the same proxy.
 */
export default function Details() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useMealdbMeal(id);

  if (isLoading) return <DetailsSkeleton />;
  if (isError) {
    return (
      <Empty
        title="Couldn't load this recipe"
        description={error instanceof Error ? error.message : "Try again in a moment."}
      />
    );
  }

  const meal = data?.meals?.[0];
  if (!meal) return <Empty title="Recipe not found" description="The recipe you're looking for isn't here." />;

  return <DetailsView meal={meal} />;
}

function DetailsView({ meal }: { meal: MealdbMeal }) {
  const input = mealdbToInput(meal);
  const tags = input.tags ?? [];
  const imageUrl = highQualityMealImage(meal.strMealThumb);

  return (
    <article className="space-y-8 animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to browse
      </Link>

      <header className="grid md:grid-cols-2 gap-6 items-start">
        <div className="aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={meal.strMeal}
              decoding="async"
              fetchPriority="high"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {meal.strCategory && (
              <Badge variant="sage" className="font-normal">
                {meal.strCategory}
              </Badge>
            )}
            {meal.strArea && (
              <Badge variant="outline" className="font-normal">
                {meal.strArea}
              </Badge>
            )}
            {tags.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl tracking-tight">
            {meal.strMeal}
          </h1>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <Link to={`/cook/source/${meal.idMeal}`} aria-label="Start hands-free cooking mode">
                <ChefHat className="h-4 w-4" aria-hidden="true" />
                Start cooking
              </Link>
            </Button>
            <SaveToggle
              sourceId={meal.idMeal}
              title={meal.strMeal}
              meal={meal}
              size="default"
              className="h-12 px-4"
            />
            {meal.strYoutube && (
              <Button variant="outline" size="lg" asChild>
                <a href={meal.strYoutube} target="_blank" rel="noreferrer">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Watch
                </a>
              </Button>
            )}
            {meal.strSource && (
              <Button variant="ghost" size="lg" asChild>
                <a href={meal.strSource} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Source
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="grid md:grid-cols-[320px,1fr] gap-8">
        <div>
          <h2 className="font-display text-xl tracking-tight mb-3">Ingredients</h2>
          <ul className="space-y-2">
            {(input.ingredients ?? []).map((ing, idx) => (
              <li
                key={`${ing.name}-${idx}`}
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
          <Times prep={null} cook={null} servings={null} />
        </div>

        <div>
          <h2 className="font-display text-xl tracking-tight mb-3">Method</h2>
          <ol className="space-y-4">
            {(input.steps ?? []).map((s, i) => (
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
    </article>
  );
}

function Times({
  prep,
  cook,
  servings,
}: {
  prep: number | null;
  cook: number | null;
  servings: number | null;
}) {
  const items = [
    { label: "Prep", value: formatMinutes(prep) },
    { label: "Cook", value: formatMinutes(cook) },
    { label: "Servings", value: servings ? `${servings}` : null },
  ].filter((i) => i.value);
  if (items.length === 0) return null;
  return (
    <dl className="mt-6 grid grid-cols-3 gap-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-md bg-accent px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {i.label}
          </dt>
          <dd className="font-display text-base">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailsSkeleton() {
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
      <div className="grid md:grid-cols-[320px,1fr] gap-8">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
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
        <Link to="/">Back to browse</Link>
      </Button>
    </div>
  );
}
