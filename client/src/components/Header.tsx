import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Search, BookmarkCheck, ChefHat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const isCollectionRoute = location.pathname.startsWith("/collection");

  // Sync the input with the ?q= param so back/forward feels right.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get("q") ?? "");
  }, [location.search]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams(location.search);
    if (q) params.set("q", q);
    else params.delete("q");
    // Search lives on Home; jump there if we're elsewhere.
    navigate(`/?${params.toString()}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container mx-auto px-4 h-16 sm:h-18 flex items-center gap-3 sm:gap-5">
        <Link
          to="/"
          className="flex items-center gap-2 shrink-0 font-display text-lg sm:text-xl tracking-tight"
          aria-label="Warm Kitchen, home"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <ChefHat className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">Warm Kitchen</span>
        </Link>

        <form
          className="flex-1 relative"
          role="search"
          onSubmit={onSubmit}
        >
          <label htmlFor="header-search" className="sr-only">
            Search recipes
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="header-search"
            type="search"
            placeholder="Search e.g. chicken, beef, soup…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
        </form>

        <Link
          to={isCollectionRoute ? "/" : "/collection"}
          aria-label={isCollectionRoute ? "Back to home" : "Open collection"}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 h-10 text-sm font-medium transition-colors",
            isCollectionRoute
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Collection</span>
        </Link>

        <ThemeToggle />
      </div>
    </header>
  );
}
