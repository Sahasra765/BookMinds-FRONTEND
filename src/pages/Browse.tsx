import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import BookCard from "@/components/BookCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Library, SlidersHorizontal, Download, Loader2, BookOpen, Globe, Sparkles, Zap, BookMarked } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
}

const GENRES = ["All", "Fiction", "Science Fiction", "Fantasy", "Mystery", "Romance", "Adventure", "Gothic", "Historical Fiction", "Horror"];

const PAGE_SIZE = 60;

export default function Browse() {
  const [books, setBooks] = useState<Book[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [curatedOffset, setCuratedOffset] = useState(0);
  const [curatedDone, setCuratedDone] = useState(false);
  const [dynamicSubjectIdx, setDynamicSubjectIdx] = useState(0);
  const [dynamicPage, setDynamicPage] = useState(1);
  const [dynamicDone, setDynamicDone] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number; label: string } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const cancelBulkRef = useRef(false);
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const { toast } = useToast();

  // Open Library search
  const [olSearch, setOlSearch] = useState("");
  const [olSearching, setOlSearching] = useState(false);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("books").select("id, title, author, genre, description, cover_url", { count: "exact" });
    if (genre !== "All") query = query.eq("genre", genre);
    if (search) query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`);
    const { data, count } = await query.order("title").limit(1000);
    setBooks(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [search, genre]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // Auto-load curated books if library is empty on first visit
  const autoLoadTriggered = useRef(false);
  useEffect(() => {
    if (!loading && books.length === 0 && !autoLoadTriggered.current && !bulkLoading) {
      autoLoadTriggered.current = true;
      loadAllBooks();
    }
  }, [loading, books.length]);

  const loadBatch = async (mode: "curated" | "dynamic", opts?: any) => {
    setLoadingBooks(true);
    try {
      const bodyPayload: any = { mode, count: 15 };
      if (mode === "curated") {
        bodyPayload.offset = opts?.offset ?? curatedOffset;
      } else {
        bodyPayload.subject_index = opts?.subjectIdx ?? dynamicSubjectIdx;
        bodyPayload.page = opts?.page ?? dynamicPage;
      }

      const { data, error } = await supabase.functions.invoke("fetch-gutenberg-books", {
        body: bodyPayload,
      });
      if (error) throw error;

      const inserted = data?.inserted || 0;
      if (mode === "curated") {
        const hasMore = data?.has_more ?? false;
        setCuratedDone(!hasMore);
        if (data?.next_offset) setCuratedOffset(data.next_offset);
        if (data?.total_available) {
          setLoadProgress({
            loaded: data.next_offset || curatedOffset,
            total: data.total_available,
            label: "Loading curated classics...",
          });
        }
        return { hasMore, inserted, canDynamic: data?.can_load_dynamic };
      } else {
        const hasMore = data?.has_more ?? false;
        setDynamicDone(!hasMore);
        if (data?.next_subject_index !== null && data?.next_subject_index !== undefined) {
          setDynamicSubjectIdx(data.next_subject_index);
        }
        if (data?.next_page !== null && data?.next_page !== undefined) {
          setDynamicPage(data.next_page);
        }
        if (data?.total_subjects) {
          setLoadProgress({
            loaded: data.current_subject || 0,
            total: data.total_subjects,
            label: `Discovering ${data.subject || "books"}...`,
          });
        }
        return { hasMore, inserted };
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to load books", variant: "destructive" });
      return { hasMore: false, inserted: 0 };
    } finally {
      setLoadingBooks(false);
    }
  };

  const loadAllBooks = async () => {
    setBulkLoading(true);
    cancelBulkRef.current = false;
    let totalInserted = 0;

    // Phase 1: Load all curated books
    let cOffset = curatedOffset;
    let cMore = !curatedDone;
    while (cMore && !cancelBulkRef.current) {
      const result = await loadBatch("curated", { offset: cOffset });
      totalInserted += result.inserted;
      cMore = result.hasMore;
      cOffset = cOffset + 15;
      fetchBooks();
    }

    // Phase 2: Dynamic loading from Gutendex subjects
    let dSubjectIdx = 0;
    let dPage = 1;
    let dMore = true;
    let batchCount = 0;
    const MAX_DYNAMIC_BATCHES = 40; // ~600 additional books max

    while (dMore && !cancelBulkRef.current && batchCount < MAX_DYNAMIC_BATCHES) {
      const result = await loadBatch("dynamic", { subjectIdx: dSubjectIdx, page: dPage });
      totalInserted += result.inserted;
      dMore = result.hasMore;
      batchCount++;
      // Read updated state
      dSubjectIdx = dynamicSubjectIdx;
      dPage = dynamicPage;
      if (batchCount % 3 === 0) fetchBooks();
    }

    setBulkLoading(false);
    setLoadProgress(null);
    fetchBooks();

    if (!cancelBulkRef.current) {
      toast({
        title: "Library loaded! 📚",
        description: `Added ${totalInserted} novels to your library.`,
      });
    }
  };

  const cancelBulkLoad = () => {
    cancelBulkRef.current = true;
    toast({ title: "Loading stopped", description: "You can resume loading later." });
  };

  const searchOpenLibrary = async () => {
    if (!olSearch.trim()) return;
    setOlSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-openlibrary", {
        body: { query: olSearch.trim(), limit: 20 },
      });
      if (error) throw error;
      const inserted = data?.inserted || 0;
      const skipped = data?.skipped || 0;
      const totalFound = data?.total_found || 0;
      toast({
        title: inserted > 0 ? `Added ${inserted} books!` : "Search complete",
        description: inserted > 0
          ? `Found ${totalFound} results. Added ${inserted} new books${skipped > 0 ? `, ${skipped} already in library` : ""}.`
          : skipped > 0 ? `All ${skipped} matching books are already in your library.` : "No matching books found.",
      });
      fetchBooks();
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setOlSearching(false);
    }
  };

  const quickAddGenre = async (query: string, label: string) => {
    setOlSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-openlibrary", {
        body: { query, limit: 20 },
      });
      if (error) throw error;
      const ins = data?.inserted || 0;
      toast({
        title: ins > 0 ? `Added ${ins} ${label.toLowerCase()}!` : "Search complete",
        description: ins > 0 ? `${ins} new books added to your library.` : "These books are already in your library.",
      });
      fetchBooks();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setOlSearching(false);
    }
  };

  const displayedBooks = books.slice(0, displayLimit);
  const hasMoreToShow = displayLimit < books.length;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <Navbar />

      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="container py-10">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Library className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="font-display text-3xl font-bold">Browse Library</h1>
                  <p className="text-sm text-muted-foreground">
                    {totalCount > 0 ? `${totalCount} books` : "Public-domain classics & modern fiction"}
                    {totalCount >= 500 && <span className="ml-1 text-primary font-medium">• Large collection</span>}
                  </p>
                </div>
              </div>
              {!bulkLoading && (
                <div className="flex gap-2 flex-wrap">
                  {!curatedDone && (
                    <Button
                      onClick={() => loadBatch("curated").then(() => fetchBooks())}
                      disabled={loadingBooks}
                      variant="outline"
                      className="gap-2 rounded-full"
                    >
                      {loadingBooks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Load 15 More
                    </Button>
                  )}
                  <Button
                    onClick={loadAllBooks}
                    disabled={loadingBooks || bulkLoading}
                    className="gap-2 rounded-full"
                  >
                    <Zap className="h-4 w-4" />
                    {curatedDone ? "Load More Books" : "Build Full Library"}
                  </Button>
                </div>
              )}
              {bulkLoading && (
                <div className="flex items-center gap-3">
                  <div className="w-56">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {loadProgress?.label || "Loading..."}
                      </span>
                      <span className="text-xs font-medium">
                        {loadProgress ? `${loadProgress.loaded}/${loadProgress.total}` : "..."}
                      </span>
                    </div>
                    <Progress value={loadProgress ? (loadProgress.loaded / loadProgress.total) * 100 : 0} className="h-2" />
                  </div>
                  <Button variant="outline" size="sm" onClick={cancelBulkLoad} className="rounded-full">
                    Stop
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container py-6">
        <Tabs defaultValue="library" className="w-full">
          <TabsList className="mb-6 rounded-full">
            <TabsTrigger value="library" className="rounded-full gap-1.5">
              <Library className="h-3.5 w-3.5" /> My Library
              {totalCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 rounded-full px-1.5 text-[10px]">
                  {totalCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="discover" className="rounded-full gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Discover Books
            </TabsTrigger>
          </TabsList>

          {/* Library Tab */}
          <TabsContent value="library">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search your library by title or author..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-12 rounded-xl pl-11 text-base shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
                {GENRES.map((g) => (
                  <Button
                    key={g}
                    variant={genre === g ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGenre(g)}
                    className={`shrink-0 rounded-full px-4 text-xs ${genre === g ? "shadow-sm" : ""}`}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="mt-16 flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                <p className="text-sm text-muted-foreground">Loading books...</p>
              </div>
            ) : books.length === 0 ? (
              <div className="mt-20 flex flex-col items-center text-center">
                <Library className="h-16 w-16 text-muted-foreground/30" />
                <h3 className="mt-4 font-display text-xl font-semibold">No books found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {search || genre !== "All"
                    ? "Try a different search or genre filter."
                    : "Building your library... This may take a moment."}
                </p>
                {bulkLoading && (
                  <div className="mt-6 w-64">
                    <Progress value={loadProgress ? (loadProgress.loaded / loadProgress.total) * 100 : 0} className="h-2" />
                    <p className="mt-2 text-xs text-muted-foreground">{loadProgress?.label || "Loading..."}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="mt-6 text-sm text-muted-foreground">
                  Showing {Math.min(displayLimit, books.length)} of {books.length} book{books.length !== 1 ? "s" : ""}
                  {books.length >= 500 && (
                    <BookMarked className="inline ml-1.5 h-3.5 w-3.5 text-primary" />
                  )}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {displayedBooks.map((book, i) => (
                    <motion.div
                      key={book.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4), duration: 0.3 }}
                    >
                      <BookCard {...book} />
                    </motion.div>
                  ))}
                </div>
                {hasMoreToShow && (
                  <div className="mt-8 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
                      className="rounded-full px-8 gap-2"
                    >
                      <BookOpen className="h-4 w-4" />
                      Show More ({books.length - displayLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Discover Tab */}
          <TabsContent value="discover">
            <div className="mx-auto max-w-3xl">
              <div className="text-center mb-8">
                <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-bold">Discover Modern Books</h2>
                <p className="mt-2 text-muted-foreground">
                  Search millions of books on Open Library. Modern copyrighted books show metadata, covers, and preview content with links to read externally.
                </p>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, author, or subject..."
                    value={olSearch}
                    onChange={(e) => setOlSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchOpenLibrary()}
                    className="h-12 rounded-xl pl-11 text-base shadow-sm"
                  />
                </div>
                <Button
                  onClick={searchOpenLibrary}
                  disabled={olSearching || !olSearch.trim()}
                  className="h-12 rounded-xl px-6 gap-2"
                >
                  {olSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  {olSearching ? "Searching..." : "Search"}
                </Button>
              </div>

              {/* Popular author suggestions */}
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Popular Authors</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {[
                    "Stephen King", "Colleen Hoover", "Brandon Sanderson", "Agatha Christie",
                    "Neil Gaiman", "J.K. Rowling", "George R.R. Martin", "Dan Brown",
                    "Freida McFadden", "Ana Huang", "Sarah J. Maas", "Haruki Murakami",
                    "James Patterson", "Nora Roberts", "Lee Child", "Gillian Flynn",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs justify-start"
                      onClick={() => setOlSearch(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Genre-based loading */}
              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quick Add by Genre</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: "Bestselling Thrillers", query: "bestselling thriller novels" },
                    { label: "Romance Novels", query: "popular romance novels 2020" },
                    { label: "Fantasy Epics", query: "epic fantasy novels series" },
                    { label: "Sci-Fi Classics", query: "best science fiction novels" },
                    { label: "Mystery & Crime", query: "mystery crime fiction bestseller" },
                    { label: "Contemporary Fiction", query: "contemporary literary fiction award" },
                    { label: "Horror Novels", query: "horror novels bestselling" },
                    { label: "Historical Fiction", query: "historical fiction novels popular" },
                    { label: "Young Adult", query: "young adult novels bestselling" },
                  ].map(({ label, query }) => (
                    <Button
                      key={label}
                      variant="outline"
                      className="h-auto rounded-xl p-4 flex flex-col items-start gap-1 text-left hover:border-primary/30 hover:bg-primary/5"
                      disabled={olSearching}
                      onClick={() => quickAddGenre(query, label)}
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-[11px] text-muted-foreground">Add popular titles to library</span>
                    </Button>
                  ))}
                </div>
              </div>

              <p className="mt-8 text-center text-xs text-muted-foreground">
                Powered by Open Library. Copyrighted books include preview content and external reading links.
                <br />
                Public-domain books offer full-text reading within BookMinds.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
