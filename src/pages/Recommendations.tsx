import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import BookCard from "@/components/BookCard";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, BookOpen, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
}

const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || "https://bookminds-backend.onrender.com"
).replace(/\/$/, "");

async function fetchRecommendationsFromBackend(userId: string): Promise<Book[] | null> {
  if (!BACKEND_URL) {
    return null;
  }

  const candidatePaths = [
    "/recommend-books",
    "/api/recommend-books",
    "/recommendations",
    "/api/recommendations",
  ];

  for (const path of candidatePaths) {
    try {
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      if (Array.isArray(payload?.recommendations)) {
        return payload.recommendations as Book[];
      }
      if (Array.isArray(payload)) {
        return payload as Book[];
      }
      if (Array.isArray(payload?.data)) {
        return payload.data as Book[];
      }
    } catch {
      // Try the next route if this one is unavailable.
    }
  }

  throw new Error("Could not fetch recommendations from backend API.");
}

export default function Recommendations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_feedback")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => setHasRated(!!(data && data.length > 0)));
  }, [user]);

  const fetchRecommendations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const backendRecommendations = await fetchRecommendationsFromBackend(user.id);
      if (backendRecommendations) {
        setBooks(backendRecommendations);
        return;
      }

      const { data, error } = await supabase.functions.invoke("recommend-books", {
        body: { user_id: user.id },
      });
      if (error) throw error;
      setBooks(data?.recommendations || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to get recommendations", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user && hasRated) fetchRecommendations();
  }, [user, hasRated]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <Navbar />

      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="container py-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold">For You</h1>
                <p className="text-sm text-muted-foreground">AI-powered picks based on your taste</p>
              </div>
            </div>
            {hasRated && (
              <Button
                onClick={fetchRecommendations}
                disabled={loading}
                variant="outline"
                className="gap-2 rounded-full"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
          </motion.div>
        </div>
      </div>

      <div className="container py-8">
        {!hasRated ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-md py-20 text-center"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
              <BookOpen className="h-10 w-10 text-primary/50" />
            </div>
            <h2 className="font-display text-2xl font-bold">Rate books to unlock AI picks</h2>
            <p className="mt-3 text-muted-foreground">
              Like or dislike a few books in the library to help our AI understand your preferences.
            </p>
            <Link to="/browse">
              <Button className="mt-8 gap-2 rounded-full px-6 shadow-lg">
                Browse Library <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="relative">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <Sparkles className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Analyzing your taste profile...</p>
          </div>
        ) : books.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">No recommendations yet. Try rating more books!</p>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              {books.length} recommendation{books.length !== 1 ? "s" : ""} based on your preferences
            </p>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {books.map((book, i) => (
                <motion.div
                  key={book.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.35 }}
                >
                  <BookCard {...book} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
