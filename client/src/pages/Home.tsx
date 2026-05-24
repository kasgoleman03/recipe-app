import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CategoryChips } from "@/components/CategoryChips";
import { RecipeCard, RecipeCardSkeleton } from "@/components/RecipeCard";
import { useMealdbFilter, useMealdbSearch } from "@/hooks/useMealdb";
import { Sparkles } from "lucide-react";

export default function Home() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [category, setCategory] = useState<string | null>(null);

  // When the user picks a category, drop the query (and vice-versa) so the
  // results grid always reflects exactly one mode.
  useEffect(() => {
    if (q && category) setCategory(null);
  }, [q, category]);

  const search = useMealdbSearch(q);
  const filter = useMealdbFilter(category);

  const showingSearch = q.length > 0;
  const showingFilter = !showingSearch && category != null;
  const showingCurated = !showingSearch && !showingFilter;

  return (
    <div className="space-y-6">
      {showingCurated && <Hero />}

      <section aria-label="Browse by category">
        <CategoryChips
          active={category}
          onChange={(next) => {
            setCategory(next);
            const np = new URLSearchParams(params);
            np.delete("q");
            setParams(np, { replace: true });
          }}
        />
      </section>

      <section
        aria-label={
          showingSearch
            ? `Search results for ${q}`
            : showingFilter
              ? `Recipes in ${category}`
              : "Featured recipes"
        }
      >
        {showingSearch && (
          <SectionHeading>
            Results for <span className="text-primary">"{q}"</span>
          </SectionHeading>
        )}
        {showingFilter && <SectionHeading>{category}</SectionHeading>}
        {showingCurated && <SectionHeading>Try something delicious</SectionHeading>}

        {(showingSearch ? search.isLoading : showingFilter ? filter.isLoading : false) && (
          <ResultsGrid>
            {Array.from({ length: 8 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </ResultsGrid>
        )}

        {showingSearch && !search.isLoading && (
          <ResultsFromSearch
            data={search.data?.meals ?? null}
            emptyMessage={`No recipes match "${q}". Try a different ingredient.`}
          />
        )}

        {showingFilter && !filter.isLoading && (
          <ResultsFromFilter data={filter.data?.meals ?? null} category={category!} />
        )}

        {showingCurated && <CuratedFallback />}
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="warm-grain relative overflow-hidden rounded-2xl bg-gradient-to-br from-oat to-sage-tint p-6 sm:p-10 border border-border/50">
      <div className="relative z-10 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Warm Kitchen
        </div>
        <h1 className="mt-3 font-display text-3xl sm:text-5xl tracking-tight">
          Find a recipe.{" "}
          <span className="text-primary">Cook hands-free.</span>
        </h1>
        <p className="mt-3 text-muted-foreground sm:text-lg max-w-prose">
          Browse thousands of recipes, save your favorites, and follow each step in a
          distraction-free cooking mode designed for the kitchen counter.
        </p>
      </div>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl tracking-tight mb-4 mt-2">{children}</h2>
  );
}

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 animate-fade-in">
      {children}
    </div>
  );
}

function ResultsFromSearch({
  data,
  emptyMessage,
}: {
  data: import("@/types/recipe").MealdbMeal[] | null;
  emptyMessage: string;
}) {
  if (data == null || data.length === 0) {
    return <Empty message={emptyMessage} />;
  }
  return (
    <ResultsGrid>
      {data.map((m) => (
        <RecipeCard
          key={m.idMeal}
          id={m.idMeal}
          title={m.strMeal}
          imageUrl={m.strMealThumb}
          category={m.strCategory}
          area={m.strArea}
          sourceId={m.idMeal}
        />
      ))}
    </ResultsGrid>
  );
}

function ResultsFromFilter({
  data,
  category,
}: {
  data: import("@/types/recipe").MealdbFilterItem[] | null;
  category: string;
}) {
  if (data == null || data.length === 0) {
    return <Empty message={`No recipes found in ${category}.`} />;
  }
  return (
    <ResultsGrid>
      {data.map((m) => (
        <RecipeCard
          key={m.idMeal}
          id={m.idMeal}
          title={m.strMeal}
          imageUrl={m.strMealThumb}
          category={category}
          sourceId={m.idMeal}
        />
      ))}
    </ResultsGrid>
  );
}

function CuratedFallback() {
  // Show a default "Beef" filter on first load so the home isn't empty.
  // It's just a friendly default — picking any chip overrides it.
  const filter = useMealdbFilter("Beef");
  if (filter.isLoading) {
    return (
      <ResultsGrid>
        {Array.from({ length: 8 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </ResultsGrid>
    );
  }
  return (
    <ResultsFromFilter data={filter.data?.meals ?? null} category="Beef" />
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
      <p className="font-display text-xl text-foreground">Nothing here yet.</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
