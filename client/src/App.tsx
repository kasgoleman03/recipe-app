import { Routes, Route, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { OfflineToast } from "@/components/OfflineToast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";

import Home from "@/pages/Home";
import Details from "@/pages/Details";
import Collection from "@/pages/Collection";
import SavedDetails from "@/pages/SavedDetails";
import Cooking from "@/pages/Cooking";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main id="main" className="container mx-auto flex-1 w-full px-4 py-6 sm:py-8">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/recipe/:id" element={<Details />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/collection/:id" element={<SavedDetails />} />
            <Route path="/cook/source/:id" element={<Cooking source="mealdb" />} />
            <Route path="/cook/saved/:id" element={<Cooking source="saved" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer className="border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        <p className="font-display tracking-tight">Warm Kitchen</p>
        <p className="text-xs mt-1">Recipes via TheMealDB · Built with Go + React</p>
      </footer>
      <OfflineToast />
      <Toaster position="bottom-right" />
    </div>
  );
}
