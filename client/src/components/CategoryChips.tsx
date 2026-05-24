import { useMealdbCategories } from "@/hooks/useMealdb";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  active: string | null;
  onChange: (next: string | null) => void;
}

export function CategoryChips({ active, onChange }: Props) {
  const { data, isLoading, isError } = useMealdbCategories();

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto py-2" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }
  if (isError || !data?.categories?.length) return null;

  return (
    <div
      role="tablist"
      aria-label="Recipe categories"
      className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin"
    >
      <Chip selected={active === null} onClick={() => onChange(null)}>
        All
      </Chip>
      {data.categories.map((c) => (
        <Chip
          key={c.idCategory}
          selected={active === c.strCategory}
          onClick={() => onChange(c.strCategory)}
        >
          {c.strCategory}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 h-9 text-sm font-medium transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
