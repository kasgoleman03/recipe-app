import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaveToggle } from "@/components/SaveToggle";
import { highQualityMealImage } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  imageUrl?: string;
  category?: string;
  area?: string;
  /** Where the card links to. Defaults to the TheMealDB browse-detail page. */
  to?: string;
  /** Source meal id (TheMealDB) — drives the SaveToggle. Pass undefined to hide it. */
  sourceId?: string;
}

export function RecipeCard({ id, title, imageUrl, category, area, to, sourceId }: Props) {
  const href = to ?? `/recipe/${id}`;
  const crispImageUrl = highQualityMealImage(imageUrl);
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md focus-within:shadow-md">
      <Link
        to={href}
        className="absolute inset-0 z-10 focus:outline-none"
        aria-label={`View ${title}`}
      />
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {crispImageUrl ? (
          <img
            src={crispImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            sizes="(min-width: 1280px) 296px, (min-width: 1024px) 31vw, (min-width: 640px) 48vw, 100vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-oat to-sage-tint" aria-hidden="true" />
        )}
        {sourceId !== undefined && (
          <div className="absolute right-2 top-2 z-20">
            <SaveToggle sourceId={sourceId} title={title} />
          </div>
        )}
      </div>
      <CardContent className="p-4 pt-4">
        <h3 className="font-display text-lg leading-tight tracking-tight line-clamp-2">
          {title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {category && (
            <Badge variant="sage" className="font-normal">
              {category}
            </Badge>
          )}
          {area && (
            <Badge variant="outline" className="font-normal">
              {area}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecipeCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <CardContent className="p-4 space-y-2">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="flex gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}
