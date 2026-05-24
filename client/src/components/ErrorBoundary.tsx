import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (typeof console !== "undefined") {
      console.error("UI error:", error, info);
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container mx-auto py-16 max-w-xl text-center" role="alert">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-2xl tracking-tight">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.state.error.message || "An unexpected error happened."}
        </p>
        <div className="mt-6">
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      </div>
    );
  }
}
