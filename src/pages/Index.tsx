import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Sparkles, Library, ArrowRight, Star, TrendingUp, Heart, Clock } from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import BookCard from "@/components/BookCard";

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
}

interface ReadingBook extends Book {
  progress: number;
  completed: boolean;
  updated_at: string;
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

export default function Index() {
  const { user } = useAuth();
  const [featuredBooks, setFeaturedBooks] = useState<Book[]>([]);
  const [currentlyReading, setCurrentlyReading] = useState<ReadingBook[]>([]);
  const [bookCount, setBookCount] = useState(0);

  useEffect(() => {
    supabase
      .from("books")
      .select("id, title, author, genre, description, cover_url", { count: "exact" })
      .limit(6)
      .then(({ data, count }) => {
        setFeaturedBooks(data || []);
        setBookCount(count || 0);
      });
  }, []);

  useEffect(() => {
    if (!user) { setCurrentlyReading([]); return; }
    supabase
      .from("reading_progress")
      .select("progress, completed, updated_at, book_id, books(id, title, author, genre, description, cover_url)")
      .eq("user_id", user.id)
      .eq("completed", false)
      .gt("progress", 0)
      .order("updated_at", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!data) return;
        const books: ReadingBook[] = data
          .filter((r: any) => r.books)
          .map((r: any) => ({
            ...(r.books as Book),
            progress: r.progress,
            completed: r.completed,
            updated_at: r.updated_at,
          }));
        setCurrentlyReading(books);
      });
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden hero-gradient">
          {/* Decorative orbs */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl animate-pulse-glow" />
            <div className="absolute top-1/2 -left-48 h-80 w-80 rounded-full bg-accent/5 blur-3xl animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
            <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-warm-gold-light/5 blur-3xl animate-pulse-glow" style={{ animationDelay: "3s" }} />
          </div>

          <div className="container relative py-24 md:py-40">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mx-auto max-w-4xl text-center"
            >
              <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                AI-Powered Book Discovery
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-display text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl"
              >
                Discover Your Next{" "}
                <span className="gradient-text">Favorite Book</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl text-balance"
              >
                BookMinds learns your unique taste through every like and dislike,
                then uses AI to surface books you'll truly love.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link to="/browse">
                  <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base shadow-lg transition-shadow hover:shadow-xl">
                    <Library className="h-5 w-5" /> Browse Library
                  </Button>
                </Link>
                <Link to="/recommendations">
                  <Button size="lg" variant="outline" className="h-12 gap-2 rounded-xl px-8 text-base">
                    <Sparkles className="h-5 w-5" /> Get Recommendations
                  </Button>
                </Link>
              </motion.div>

              {/* Stats */}
              <motion.div variants={fadeUp} className="mt-16 flex items-center justify-center gap-8 md:gap-12">
                {[
                  { icon: BookOpen, label: "Books Available", value: bookCount > 0 ? `${bookCount}+` : "500+" },
                  { icon: Star, label: "AI-Curated", value: "100%" },
                  { icon: Heart, label: "Personalized", value: "For You" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <Icon className="h-5 w-5 text-primary/70" />
                    <span className="text-xl font-bold md:text-2xl">{value}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Floating book covers */}
            <div className="pointer-events-none absolute top-20 left-8 hidden lg:block">
              <motion.div
                animate={{ y: [-8, 8, -8] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="h-32 w-24 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 shadow-lg backdrop-blur-sm"
                style={{ transform: "rotate(-12deg)" }}
              />
            </div>
            <div className="pointer-events-none absolute bottom-20 right-12 hidden lg:block">
              <motion.div
                animate={{ y: [8, -8, 8] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="h-36 w-28 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 shadow-lg backdrop-blur-sm"
                style={{ transform: "rotate(8deg)" }}
              />
            </div>
          </div>
        </section>

        {/* Currently Reading */}
        {currentlyReading.length > 0 && (
          <section className="border-t py-20">
            <div className="container">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="mb-10 flex items-end justify-between"
              >
                <div>
                  <span className="text-sm font-semibold uppercase tracking-widest text-primary">
                    <Clock className="mr-1.5 inline h-4 w-4" />
                    Continue Reading
                  </span>
                  <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Currently Reading</h2>
                </div>
                <Link to="/profile" className="hidden text-sm font-medium text-primary hover:underline sm:block">
                  View all →
                </Link>
              </motion.div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {currentlyReading.map((book, i) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                  >
                    <Link to={`/book/${book.id}`} className="group block">
                      <div className="glass-card-elevated flex gap-4 p-4 transition-all hover:-translate-y-0.5">
                        <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm">
                          {book.cover_url ? (
                            <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                              <BookOpen className="h-6 w-6 text-primary/40" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div>
                            <h3 className="font-display text-sm font-semibold leading-snug line-clamp-2 transition-colors group-hover:text-primary">
                              {book.title}
                            </h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">{book.author}</p>
                          </div>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span>{Math.round(book.progress)}% complete</span>
                            </div>
                            <Progress value={book.progress} className="h-1.5" />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Featured Books */}
        {featuredBooks.length > 0 && (
          <section className="border-t py-20">
            <div className="container">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="mb-10 flex items-end justify-between"
              >
                <div>
                  <span className="text-sm font-semibold uppercase tracking-widest text-primary">Curated For You</span>
                  <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Featured Books</h2>
                </div>
                <Link to="/browse" className="hidden text-sm font-medium text-primary hover:underline sm:block">
                  View all →
                </Link>
              </motion.div>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {featuredBooks.map((book, i) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                  >
                    <BookCard {...book} />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How It Works */}
        <section className="border-t bg-muted/30 py-24">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mx-auto mb-16 max-w-xl text-center"
            >
              <span className="text-sm font-semibold uppercase tracking-widest text-primary">How It Works</span>
              <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">
                Three Steps to Your Perfect Read
              </h2>
            </motion.div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  icon: Library,
                  title: "Browse & Explore",
                  desc: "Discover books across every genre, from timeless classics to hidden gems.",
                  step: "01",
                },
                {
                  icon: Heart,
                  title: "Rate & React",
                  desc: "Like or dislike books to build your unique taste profile for the AI.",
                  step: "02",
                },
                {
                  icon: Sparkles,
                  title: "Get AI Picks",
                  desc: "Our AI analyzes your preferences and serves up personalized recommendations.",
                  step: "03",
                },
              ].map(({ icon: Icon, title, desc, step }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  className="glass-card-elevated group relative overflow-hidden p-8 transition-all hover:-translate-y-1"
                >
                  <span className="absolute right-6 top-4 font-display text-5xl font-bold text-primary/10 transition-colors group-hover:text-primary/20">
                    {step}
                  </span>
                  <div className="relative">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-display text-xl font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="container relative text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <TrendingUp className="mx-auto h-10 w-10 text-primary/60" />
              <h2 className="mt-6 font-display text-3xl font-bold md:text-4xl text-balance">
                Ready to discover books<br className="hidden md:block" /> you'll actually love?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                Join BookMinds and let AI transform how you find your next great read.
              </p>
              <Link to="/auth">
                <Button size="lg" className="mt-8 h-12 gap-2 rounded-xl px-8 text-base shadow-lg">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="container flex flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-display text-sm font-semibold">BookMinds</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 BookMinds. AI-powered book discovery.
          </p>
        </div>
      </footer>
    </div>
  );
}
