// Cooking mode: distraction-free, large-type, step-by-step kitchen UI.
//
// Key UX choices:
//   - Big primary type, generous whitespace, high contrast.
//   - Per-step navigation with Prev/Next; keyboard arrow-key support.
//   - Optional per-step timer (parses "10 minutes" / "1 hour" out of the
//     step text and offers a one-tap countdown).
//   - Holds the Screen Wake Lock for the entire session so the phone
//     doesn't sleep on the counter; releases it on unmount.
//
// Reads from BOTH planes:
//   - source="mealdb" → /api/meal/:id (browse plane)
//   - source="saved"  → /api/recipes/:id (collection plane, offline-friendly)

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Lock,
  Play,
  Square,
  Timer,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMealdbMeal } from "@/hooks/useMealdb";
import { useRecipe } from "@/hooks/useRecipes";
import { mealdbToInput } from "@/lib/api";
import { acquireWakeLock, isWakeLockSupported, type WakeLockHandle } from "@/lib/wakelock";
import { cn } from "@/lib/utils";
import type { Ingredient } from "@/types/recipe";

interface Props {
  source: "mealdb" | "saved";
}

interface CookingDoc {
  title: string;
  imageUrl?: string;
  ingredients: Ingredient[];
  steps: string[];
}

export default function Cooking({ source }: Props) {
  const { id } = useParams<{ id: string }>();

  if (source === "mealdb") return <CookingFromMealdb id={id!} />;
  return <CookingFromSaved id={id!} />;
}

function CookingFromMealdb({ id }: { id: string }) {
  const { data, isLoading, isError } = useMealdbMeal(id);
  const meal = data?.meals?.[0];
  const doc: CookingDoc | null = useMemo(() => {
    if (!meal) return null;
    const input = mealdbToInput(meal);
    return {
      title: input.title,
      imageUrl: input.imageUrl,
      ingredients: input.ingredients ?? [],
      steps: input.steps ?? [],
    };
  }, [meal]);
  if (isLoading) return <CookingSkeleton />;
  if (isError || !doc) return <CookingEmpty />;
  return <CookingShell doc={doc} backTo={`/recipe/${id}`} />;
}

function CookingFromSaved({ id }: { id: string }) {
  const { data, isLoading, isError } = useRecipe(id);
  if (isLoading) return <CookingSkeleton />;
  if (isError || !data) return <CookingEmpty />;
  const doc: CookingDoc = {
    title: data.title,
    imageUrl: data.imageUrl,
    ingredients: data.ingredients,
    steps: data.steps,
  };
  return <CookingShell doc={doc} backTo={`/collection/${id}`} />;
}

// -------------------------------------------------------------------------

function CookingShell({ doc, backTo }: { doc: CookingDoc; backTo: string }) {
  const total = doc.steps.length;
  const [stepIndex, setStepIndex] = useState(0);
  const [wakeHandle, setWakeHandle] = useState<WakeLockHandle | null>(null);
  const [wakeError, setWakeError] = useState<string | null>(null);

  // Acquire (and re-acquire on visibility) the screen wake lock for
  // the entire cooking session. Release on unmount.
  useEffect(() => {
    let cancelled = false;
    let handle: WakeLockHandle | null = null;
    if (!isWakeLockSupported()) {
      setWakeError("Wake lock isn't supported in this browser. Tap the screen periodically to keep it on.");
    } else {
      acquireWakeLock()
        .then((h) => {
          if (cancelled) {
            void h.release();
            return;
          }
          handle = h;
          setWakeHandle(h);
        })
        .catch(() => setWakeError("Couldn't keep the screen awake. Cooking will still work."));
    }
    return () => {
      cancelled = true;
      void handle?.release();
    };
  }, []);

  // Keyboard nav: ←/→ to move between steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") setStepIndex((i) => Math.min(i + 1, total - 1));
      if (e.key === "ArrowLeft") setStepIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const step = doc.steps[stepIndex] ?? "";
  const stepTimer = useMemo(() => detectTimer(step), [step]);

  return (
    <div className="-mx-4 -my-6 sm:-my-8 min-h-[calc(100vh-4rem)] bg-background">
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Exit
          </Link>
          <WakeLockBadge held={!!wakeHandle?.isHeld()} error={wakeError} />
        </div>

        <header className="mt-6">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Cooking
          </p>
          <h1 className="font-display text-3xl sm:text-5xl tracking-tight mt-1">
            {doc.title}
          </h1>
        </header>

        <Progress current={stepIndex + 1} total={total} />

        <section
          aria-live="polite"
          className="mt-8 rounded-2xl bg-card border border-border/60 p-6 sm:p-10 shadow-sm animate-fade-in"
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="font-display text-sm uppercase tracking-[0.2em] text-primary">
              Step {stepIndex + 1}
            </p>
            <p className="text-sm text-muted-foreground">
              of {total}
            </p>
          </div>
          <p className="mt-4 font-sans text-2xl sm:text-3xl leading-snug">{step}</p>
          {stepTimer && <StepTimer minutes={stepTimer} />}
        </section>

        <nav
          aria-label="Step navigation"
          className="mt-8 flex items-center justify-between gap-3"
        >
          <Button
            size="xl"
            variant="outline"
            onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
            disabled={stepIndex === 0}
            aria-label="Previous step"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Previous
          </Button>
          {stepIndex < total - 1 ? (
            <Button
              size="xl"
              onClick={() => setStepIndex((i) => Math.min(i + 1, total - 1))}
              aria-label="Next step"
            >
              Next <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="xl" asChild>
              <Link to={backTo}>Done</Link>
            </Button>
          )}
        </nav>

        <details className="mt-12 rounded-xl border border-border/60 bg-card p-5 group open:shadow-sm">
          <summary className="cursor-pointer font-display text-lg tracking-tight">
            Ingredients
          </summary>
          <ul className="mt-4 space-y-2">
            {doc.ingredients.map((ing, i) => (
              <li
                key={`${ing.name}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5"
              >
                <span className="font-medium">{ing.name}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {ing.quantity}
                  {ing.unit ? ` ${ing.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuetext={`Step ${current} of ${total}`}
      className="mt-6 h-2 rounded-full bg-muted overflow-hidden"
    >
      <div
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function WakeLockBadge({ held, error }: { held: boolean; error: string | null }) {
  if (error) {
    return (
      <Badge variant="outline" className="font-normal" title={error}>
        <Unlock className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Screen may sleep
      </Badge>
    );
  }
  return (
    <Badge variant={held ? "sage" : "outline"} className="font-normal">
      {held ? (
        <>
          <Lock className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Screen stays on
        </>
      ) : (
        <>
          <Unlock className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Locking screen…
        </>
      )}
    </Badge>
  );
}

/** Recognizes "10 minutes" / "1 hour 15 minutes" / "30 secs" inside step text. */
function detectTimer(text: string): number | null {
  const lower = text.toLowerCase();
  let total = 0;
  const hourMatch = lower.match(/(\d+)\s*(?:hours?|hrs?|h\b)/);
  const minMatch = lower.match(/(\d+)\s*(?:minutes?|mins?|m\b)/);
  const secMatch = lower.match(/(\d+)\s*(?:seconds?|secs?|s\b)/);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  if (!hourMatch && !minMatch && secMatch) total += Math.max(1, Math.round(parseInt(secMatch[1], 10) / 60));
  return total > 0 && total <= 240 ? total : null;
}

function StepTimer({ minutes }: { minutes: number }) {
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(minutes * 60);
  const startedAt = useRef<number | null>(null);
  const initial = useRef(minutes * 60);

  useEffect(() => {
    setRunning(false);
    setRemaining(minutes * 60);
    initial.current = minutes * 60;
  }, [minutes]);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000);
      const next = Math.max(0, initial.current - elapsed);
      setRemaining(next);
      if (next === 0) {
        setRunning(false);
        try {
          // A short, gentle audio ping. Not all browsers will play
          // without user gesture; this hook is fired off the user's
          // initial tap so it should usually succeed.
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch {
          /* ignore */
        }
      }
    };
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [running]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="mt-6 flex items-center gap-3 flex-wrap rounded-xl bg-accent/50 border border-border/60 px-4 py-3">
      <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">Timer detected</span>
      <span
        aria-live="polite"
        className={cn(
          "font-display text-2xl tabular-nums tracking-tight",
          remaining === 0 ? "text-primary" : "",
        )}
      >
        {display}
      </span>
      <Button
        size="sm"
        variant={running ? "outline" : "default"}
        onClick={() => {
          if (remaining === 0) {
            setRemaining(initial.current);
          }
          setRunning((r) => !r);
        }}
        aria-pressed={running}
      >
        {running ? (
          <>
            <Square className="h-4 w-4" aria-hidden="true" /> Stop
          </>
        ) : (
          <>
            <Play className="h-4 w-4" aria-hidden="true" /> Start {minutes}m
          </>
        )}
      </Button>
    </div>
  );
}

function CookingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

function CookingEmpty() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-10 text-center">
      <h2 className="font-display text-2xl">Recipe not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn't find that recipe. It may have been removed.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to browse</Link>
      </Button>
    </div>
  );
}
