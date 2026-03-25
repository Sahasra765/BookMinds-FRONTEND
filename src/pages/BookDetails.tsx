import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  ThumbsUp, ThumbsDown, ArrowLeft, BookOpen, Clock, List,
  CheckCircle2, ExternalLink, ShoppingBag, Lock, ChevronLeft,
  ChevronRight, Globe, Settings, Sun, Moon, Type, Minus, Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import bookPlaceholder from "@/assets/book-placeholder.png";
import { motion, AnimatePresence } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ReadingTheme = "light" | "dark" | "sepia";

const READING_THEMES: Record<ReadingTheme, { bg: string; text: string; muted: string; border: string; card: string; label: string }> = {
  light: {
    bg: "bg-[hsl(40,33%,97%)]",
    text: "text-[hsl(220,20%,18%)]",
    muted: "text-[hsl(220,10%,46%)]",
    border: "border-[hsl(35,20%,88%)]",
    card: "bg-[hsl(0,0%,100%)]",
    label: "Light",
  },
  dark: {
    bg: "bg-[hsl(225,18%,8%)]",
    text: "text-[hsl(40,15%,88%)]",
    muted: "text-[hsl(40,10%,55%)]",
    border: "border-[hsl(225,14%,18%)]",
    card: "bg-[hsl(225,16%,12%)]",
    label: "Dark",
  },
  sepia: {
    bg: "bg-[hsl(38,40%,90%)]",
    text: "text-[hsl(30,30%,18%)]",
    muted: "text-[hsl(30,15%,45%)]",
    border: "border-[hsl(35,25%,78%)]",
    card: "bg-[hsl(38,35%,93%)]",
    label: "Sepia",
  },
};

const FONT_SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24];
const DEFAULT_FONT_SIZE_IDX = 3; // 17px

interface Book {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
  pages: number | null;
  content: string;
}

interface Chapter {
  title: string;
  content: string;
  index: number;
  wordCount: number;
}

const COPYRIGHT_MARKERS = [
  "This is a copyrighted novel",
  "copyrighted novel",
  "Please purchase a copy",
  "Full text reading is not available due to copyright",
  "copyright restrictions",
];

function isPublicDomain(book: Book): boolean {
  if (!book.content || book.content.length < 500) return false;
  const lower = book.content.toLowerCase();
  return !COPYRIGHT_MARKERS.some(m => lower.includes(m.toLowerCase()));
}

function extractOpenLibraryUrl(content: string): string | null {
  const match = content.match(/https:\/\/openlibrary\.org\/works\/[^\s)]+/);
  return match ? match[0] : null;
}

interface PreviewSection {
  type: "about" | "first_line" | "details" | "links";
  title: string;
  content: string;
}

function parsePreviewContent(content: string): PreviewSection[] {
  const sections: PreviewSection[] = [];
  
  // Extract ABOUT THIS BOOK section
  const aboutMatch = content.match(/📖 ABOUT THIS BOOK\n\n?([\s\S]*?)(?=\n\n📝|\n\n📋|\n\n🔗|$)/);
  if (aboutMatch?.[1]?.trim()) {
    sections.push({ type: "about", title: "About This Book", content: aboutMatch[1].trim() });
  }
  
  // Extract FIRST LINE
  const firstLineMatch = content.match(/📝 FIRST LINE\n\n?"?([^"]*)"?/);
  if (firstLineMatch?.[1]?.trim()) {
    sections.push({ type: "first_line", title: "First Line", content: firstLineMatch[1].trim() });
  }
  
  // Extract BOOK DETAILS
  const detailsMatch = content.match(/📋 BOOK DETAILS\n([\s\S]*?)(?=\n\n🔗|$)/);
  if (detailsMatch?.[1]?.trim()) {
    sections.push({ type: "details", title: "Book Details", content: detailsMatch[1].trim() });
  }

  return sections;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Robust chapter parser for Project Gutenberg texts.
 * Tries multiple heading patterns in order of specificity,
 * and falls back to splitting into readable sections.
 */
function parseChapters(content: string): Chapter[] {
  // Normalize line endings
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Ordered from most specific to least specific
  const patterns: { regex: RegExp; minMatches: number }[] = [
    // "CHAPTER I", "CHAPTER 1", "CHAPTER I.", "CHAPTER I — THE BEGINNING", etc.
    { regex: /^(CHAPTER\s+[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // "Chapter 1", "Chapter I", "Chapter 1: Title", "Chapter I — Title"
    { regex: /^(Chapter\s+[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // "CHAPTER THE FIRST", "CHAPTER THE LAST"
    { regex: /^(CHAPTER\s+THE\s+\w+.*)$/gm, minMatches: 2 },
    // "I.", "II.", "III." as standalone Roman numeral headings (common in older texts)
    { regex: /^([IVXLCDM]+\.\s*.*)$/gm, minMatches: 3 },
    // "BOOK I", "BOOK THE FIRST", "BOOK 1"
    { regex: /^(BOOK\s+(?:THE\s+)?[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // "PART I", "PART 1", "Part One"
    { regex: /^(PART\s+[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    { regex: /^(Part\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\w+)[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // "ACT I", "ACT 1" (for plays)
    { regex: /^(ACT\s+[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // "SCENE I", "Scene 1"
    { regex: /^(SCENE\s+[IVXLCDM\d]+[.:\s\-—]*.*)$/gm, minMatches: 2 },
    // Markdown headings (# Title, ## Title)
    { regex: /^(#{1,3}\s+.+)$/gm, minMatches: 3 },
    // ALL-CAPS headings on their own line (4-50 chars, not common words)
    { regex: /^([A-Z][A-Z\s,'\-]{3,49})$/gm, minMatches: 4 },
  ];

  for (const { regex, minMatches } of patterns) {
    // Reset regex lastIndex
    regex.lastIndex = 0;
    const matches = [...text.matchAll(regex)];

    if (matches.length >= minMatches) {
      const chapters: Chapter[] = [];
      let chapterIndex = 0;

      for (let i = 0; i < matches.length; i++) {
        const matchStart = matches[i].index!;
        const matchEnd = i + 1 < matches.length ? matches[i + 1].index! : text.length;
        let title = matches[i][0].replace(/^#+\s*/, "").trim();

        // Clean up title
        if (title.length > 80) title = title.substring(0, 77) + "...";
        // Remove trailing punctuation artifacts
        title = title.replace(/[\s\-—:]+$/, "").trim();

        const chapterContent = text.substring(matchStart + matches[i][0].length, matchEnd).trim();
        const words = countWords(chapterContent);

        // Only include chapters with meaningful content (at least ~50 words)
        if (words >= 50) {
          chapters.push({
            title: title || `Chapter ${chapterIndex + 1}`,
            content: chapterContent,
            index: chapterIndex,
            wordCount: words,
          });
          chapterIndex++;
        }
      }

      // If we got at least 2 real chapters, use this pattern
      if (chapters.length >= 2) {
        // Check if there's a preface/intro before the first chapter heading
        const firstMatchStart = matches[0].index!;
        if (firstMatchStart > 500) {
          const preface = text.substring(0, firstMatchStart).trim();
          const prefaceWords = countWords(preface);
          if (prefaceWords >= 50) {
            chapters.unshift({
              title: "Preface",
              content: preface,
              index: 0,
              wordCount: prefaceWords,
            });
            // Re-index
            chapters.forEach((ch, i) => { ch.index = i; });
          }
        }
        return chapters;
      }
    }
  }

  // Fallback: split into ~4000-char readable sections with clean paragraph breaks
  const sections: Chapter[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let current = "";
  let idx = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    current += trimmed + "\n\n";

    if (current.length > 4000) {
      const words = countWords(current);
      sections.push({
        title: `Section ${idx + 1}`,
        content: current.trim(),
        index: idx,
        wordCount: words,
      });
      current = "";
      idx++;
    }
  }
  if (current.trim()) {
    const words = countWords(current);
    sections.push({
      title: `Section ${idx + 1}`,
      content: current.trim(),
      index: idx,
      wordCount: words,
    });
  }

  return sections.length > 0
    ? sections
    : [{ title: "Full Text", content: text, index: 0, wordCount: countWords(text) }];
}

function formatReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 250);
  if (minutes < 1) return "< 1 min";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

export default function BookDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(() => {
    try { return (localStorage.getItem("bm-reading-theme") as ReadingTheme) || "light"; } catch { return "light"; }
  });
  const [fontSizeIdx, setFontSizeIdx] = useState(() => {
    try { return parseInt(localStorage.getItem("bm-font-size-idx") || String(DEFAULT_FONT_SIZE_IDX)); } catch { return DEFAULT_FONT_SIZE_IDX; }
  });
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapters = useMemo(
    () => (book?.content && isPublicDomain(book) ? parseChapters(book.content) : []),
    [book]
  );
  const bookIsPublicDomain = book ? isPublicDomain(book) : false;
  const openLibraryUrl = book ? extractOpenLibraryUrl(book.content) : null;
  // Persist reading preferences
  useEffect(() => {
    try { localStorage.setItem("bm-reading-theme", readingTheme); } catch {}
  }, [readingTheme]);
  useEffect(() => {
    try { localStorage.setItem("bm-font-size-idx", String(fontSizeIdx)); } catch {}
  }, [fontSizeIdx]);

  const fontSize = FONT_SIZES[fontSizeIdx] || 17;
  const lineHeight = fontSize <= 16 ? 1.95 : fontSize <= 20 ? 1.85 : 1.75;

  const theme = READING_THEMES[readingTheme];

  // Track scroll progress within reader
  const handleReaderScroll = useCallback(() => {
    if (!readerRef.current) return;
    const el = readerRef.current;
    const pct = el.scrollHeight - el.clientHeight > 0
      ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
      : 0;
    setScrollProgress(Math.round(pct));
  }, []);

  const totalWords = useMemo(() => chapters.reduce((sum, ch) => sum + ch.wordCount, 0), [chapters]);

  // Load book
  useEffect(() => {
    if (!id) return;
    const fetchBook = async () => {
      const { data } = await supabase.from("books").select("*").eq("id", id).single();
      setBook(data);
      setLoading(false);
    };
    fetchBook();
  }, [id]);

  // Load feedback
  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from("user_feedback")
      .select("liked")
      .eq("book_id", id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFeedback(data.liked);
      });
  }, [id, user]);

  // Load saved reading progress
  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from("reading_progress")
      .select("progress, completed")
      .eq("book_id", id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProgressPct(data.progress);
          setCompleted(data.completed);
          if (chapters.length > 0 && data.progress > 0) {
            const chapterIdx = Math.min(
              Math.floor((data.progress / 100) * chapters.length),
              chapters.length - 1
            );
            setCurrentChapter(chapterIdx);
          }
        }
      });
  }, [id, user, chapters.length]);

  const saveProgress = useCallback(
    (chapterIdx: number, isCompleted: boolean) => {
      if (!user || !id) return;
      const pct =
        chapters.length > 0
          ? Math.round(((chapterIdx + 1) / chapters.length) * 100)
          : 0;
      setProgressPct(pct);
      setCompleted(isCompleted);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        await supabase.from("reading_progress").upsert(
          {
            user_id: user.id,
            book_id: id,
            progress: pct,
            completed: isCompleted,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id" }
        );
      }, 1000);
    },
    [user, id, chapters.length]
  );

  useEffect(() => {
    if (reading && chapters.length > 0) {
      const isLast = currentChapter === chapters.length - 1;
      saveProgress(currentChapter, isLast && completed);
    }
  }, [currentChapter, reading]);

  const handleFeedback = async (liked: boolean) => {
    if (!user || !id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to rate books.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("user_feedback")
      .upsert({ user_id: user.id, book_id: id, liked }, { onConflict: "user_id,book_id" });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setFeedback(liked);
      toast({
        title: liked ? "Liked! 👍" : "Noted 👎",
        description: "Your feedback shapes future recommendations.",
      });
    }
  };

  const goToChapter = (idx: number) => {
    setCurrentChapter(idx);
    setShowToc(false);
    readerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const markCompleted = () => {
    saveProgress(chapters.length - 1, true);
    toast({ title: "Book completed! 🎉", description: "Great job finishing this book." });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            <p className="text-sm text-muted-foreground">Loading book details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container flex flex-col items-center py-32 text-center">
          <BookOpen className="h-16 w-16 text-muted-foreground/30" />
          <h2 className="mt-6 font-display text-2xl font-bold">Book not found</h2>
          <p className="mt-2 text-muted-foreground">
            This book may have been removed or doesn't exist.
          </p>
          <Link to="/browse">
            <Button className="mt-6">Back to Library</Button>
          </Link>
        </div>
      </div>
    );
  }

  const readingTime = totalWords > 0 ? formatReadingTime(totalWords) : null;
  const readerProgress =
    chapters.length > 0 ? Math.round(((currentChapter + 1) / chapters.length) * 100) : 0;

  // =========================================================
  // KINDLE-STYLE FULL-SCREEN READING MODE
  // =========================================================
  if (reading && chapters.length > 0 && bookIsPublicDomain) {
    const chapter = chapters[currentChapter];
    const paragraphs = chapter.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const chapterReadingTime = formatReadingTime(chapter.wordCount);

    return (
      <div className={`fixed inset-0 z-50 flex flex-col ${theme.bg} transition-colors duration-500`}>
        {/* Thin progress bar at the very top */}
        <div className={`h-0.5 w-full ${readingTheme === "dark" ? "bg-[hsl(225,14%,16%)]" : readingTheme === "sepia" ? "bg-[hsl(35,25%,78%)]" : "bg-[hsl(40,20%,92%)]"}`}>
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${readerProgress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

        {/* Toolbar */}
        <div className={`flex items-center justify-between ${theme.border} border-b ${theme.card} px-3 py-2 shadow-sm transition-colors duration-500`}>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReading(false)}
              className={`gap-1.5 ${theme.text} hover:bg-primary/10`}
            >
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Exit</span>
            </Button>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowToc(!showToc)}
              className={`gap-1.5 ${theme.text} hover:bg-primary/10`}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Contents</span>
            </Button>
          </div>

          {/* Center: chapter info */}
          <div className="flex items-center gap-2 overflow-hidden max-w-[40%]">
            <span className={`hidden text-xs font-medium ${theme.muted} truncate sm:inline`}>
              {chapter.title}
            </span>
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 shrink-0 ${theme.border}`}>
              {currentChapter + 1}/{chapters.length}
            </Badge>
          </div>

          {/* Right: settings + nav */}
          <div className="flex items-center gap-1">
            {/* Settings popover */}
            <Popover open={showSettings} onOpenChange={setShowSettings}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className={`${theme.text} hover:bg-primary/10`}>
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" align="end">
                <h4 className="font-display text-sm font-bold mb-4">Reading Settings</h4>

                {/* Font size */}
                <div className="mb-5">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Font Size
                  </label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={fontSizeIdx === 0}
                      onClick={() => setFontSizeIdx(Math.max(0, fontSizeIdx - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <div className="flex-1">
                      <Slider
                        value={[fontSizeIdx]}
                        onValueChange={([v]) => setFontSizeIdx(v)}
                        min={0}
                        max={FONT_SIZES.length - 1}
                        step={1}
                        className="w-full"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={fontSizeIdx === FONT_SIZES.length - 1}
                      onClick={() => setFontSizeIdx(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground mt-1">{fontSize}px</p>
                </div>

                {/* Reading theme */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Reading Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(READING_THEMES) as ReadingTheme[]).map((t) => {
                      const th = READING_THEMES[t];
                      const active = readingTheme === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setReadingTheme(t)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all ${
                            active ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                          }`}
                        >
                          <div className={`h-6 w-6 rounded-full ${th.bg} ring-1 ring-border`} />
                          <span className="text-[11px] font-medium">{th.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-5 mx-1" />

            <Button
              variant="ghost"
              size="sm"
              disabled={currentChapter === 0}
              onClick={() => goToChapter(currentChapter - 1)}
              className={`gap-1 ${theme.text} hover:bg-primary/10`}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden md:inline">Prev</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentChapter === chapters.length - 1}
              onClick={() => goToChapter(currentChapter + 1)}
              className={`gap-1 ${theme.text} hover:bg-primary/10`}
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex flex-1 overflow-hidden">
          {/* TOC Sidebar */}
          <AnimatePresence>
            {showToc && (
              <motion.div
                initial={{ x: -320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`absolute inset-y-0 left-0 z-10 w-80 ${theme.border} border-r ${theme.card} shadow-2xl md:relative transition-colors duration-500`}
              >
                <ScrollArea className="h-full">
                  <div className="p-5">
                    <h3 className={`mb-1 font-display text-sm font-bold ${theme.text}`}>
                      {book.title}
                    </h3>
                    <p className={`mb-4 text-xs ${theme.muted}`}>
                      {chapters.length} chapters · {formatReadingTime(totalWords)} total
                    </p>
                    <Separator className="mb-4" />
                    <div className="flex flex-col gap-0.5">
                      {chapters.map((ch, i) => {
                        const isActive = i === currentChapter;
                        const isRead = i < currentChapter;
                        return (
                          <button
                            key={i}
                            onClick={() => goToChapter(i)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                              isActive
                                ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/20"
                                : isRead
                                ? `${theme.muted} opacity-60 hover:opacity-100 hover:bg-primary/5`
                                : `${theme.text} opacity-80 hover:bg-primary/5`
                            }`}
                          >
                            {isRead ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                            ) : isActive ? (
                              <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <span className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="block truncate">{ch.title}</span>
                              <span className={`text-[10px] ${theme.muted} opacity-60`}>
                                {formatReadingTime(ch.wordCount)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main reading pane */}
          <div
            ref={readerRef}
            className={`flex-1 overflow-y-auto scroll-smooth ${theme.bg} transition-colors duration-500`}
            onScroll={handleReaderScroll}
          >
            <article className="mx-auto max-w-[720px] px-6 py-12 md:px-10 lg:py-16">
              {/* Chapter heading */}
              <motion.header
                key={currentChapter}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-12"
              >
                <p className={`text-xs font-medium uppercase tracking-[0.2em] ${theme.muted} mb-3`}>
                  Chapter {currentChapter + 1} of {chapters.length}
                </p>
                <h2 className={`font-display text-2xl font-bold leading-tight ${theme.text} md:text-3xl lg:text-4xl`}>
                  {chapter.title}
                </h2>
                <div className={`mt-3 flex items-center gap-3 text-xs ${theme.muted}`}>
                  <span className="flex items-center gap-1">
                    <Type className="h-3 w-3" /> {chapter.wordCount.toLocaleString()} words
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {chapterReadingTime}
                  </span>
                </div>
                <div className={`mt-6 h-px ${readingTheme === "sepia" ? "bg-[hsl(35,25%,75%)]" : theme.border.replace("border-", "bg-")}`} />
              </motion.header>

              {/* Chapter body with smooth fade-in */}
              <motion.div
                key={`body-${currentChapter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="space-y-[1.2em]"
                style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}
              >
                {paragraphs.map((paragraph, pi) => {
                  const isSubHeading =
                    paragraph.length < 80 &&
                    paragraph === paragraph.toUpperCase() &&
                    !paragraph.includes(".");
                  const isVerse =
                    paragraph.startsWith("  ") ||
                    paragraph.startsWith("\t") ||
                    (paragraph.split("\n").length > 2 &&
                      paragraph.split("\n").every((l) => l.trim().length < 60));

                  if (isSubHeading) {
                    return (
                      <h3
                        key={pi}
                        className={`pt-6 pb-2 text-center font-display font-bold uppercase tracking-wide ${theme.text} opacity-70`}
                        style={{ fontSize: `${fontSize - 1}px` }}
                      >
                        {paragraph}
                      </h3>
                    );
                  }

                  if (isVerse) {
                    return (
                      <blockquote
                        key={pi}
                        className={`border-l-2 ${readingTheme === "sepia" ? "border-[hsl(35,25%,70%)]" : "border-primary/20"} pl-6 py-2 italic ${theme.text} opacity-75 whitespace-pre-wrap`}
                        style={{ fontSize: `${fontSize - 1}px`, lineHeight: lineHeight + 0.1 }}
                      >
                        {paragraph}
                      </blockquote>
                    );
                  }

                  return (
                    <p
                      key={pi}
                      className={`font-reading ${theme.text} opacity-90`}
                      style={{
                        textIndent: pi > 0 ? "2em" : undefined,
                        fontSize: `${fontSize}px`,
                        lineHeight: lineHeight,
                      }}
                    >
                      {pi === 0 ? (
                        <>
                          <span className="float-left mr-2 mt-1 font-display text-[2.8em] font-bold leading-[0.8] text-primary">
                            {paragraph.charAt(0)}
                          </span>
                          {paragraph.slice(1)}
                        </>
                      ) : (
                        paragraph
                      )}
                    </p>
                  );
                })}
              </motion.div>

              {/* Bottom chapter navigation */}
              <div className={`mt-20 pt-10 ${theme.border} border-t`}>
                <div className="flex items-stretch gap-4">
                  <div className="flex-1">
                    {currentChapter > 0 && (
                      <button
                        onClick={() => goToChapter(currentChapter - 1)}
                        className={`group flex w-full flex-col items-start rounded-2xl ${theme.border} border ${theme.card} p-5 text-left transition-all hover:border-primary/30 hover:shadow-md`}
                      >
                        <span className={`flex items-center gap-1 text-xs font-medium ${theme.muted} mb-1.5`}>
                          <ChevronLeft className="h-3 w-3" /> Previous
                        </span>
                        <span className={`text-sm font-semibold ${theme.text} opacity-80 line-clamp-1 group-hover:text-primary transition-colors`}>
                          {chapters[currentChapter - 1].title}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    {currentChapter < chapters.length - 1 ? (
                      <button
                        onClick={() => goToChapter(currentChapter + 1)}
                        className={`group flex w-full flex-col items-end rounded-2xl ${theme.border} border ${theme.card} p-5 text-right transition-all hover:border-primary/30 hover:shadow-md`}
                      >
                        <span className={`flex items-center gap-1 text-xs font-medium ${theme.muted} mb-1.5`}>
                          Next <ChevronRight className="h-3 w-3" />
                        </span>
                        <span className={`text-sm font-semibold ${theme.text} opacity-80 line-clamp-1 group-hover:text-primary transition-colors`}>
                          {chapters[currentChapter + 1].title}
                        </span>
                      </button>
                    ) : (
                      <div className={`flex w-full flex-col items-center justify-center rounded-2xl ${theme.border} border ${theme.card} p-5 text-center`}>
                        <p className={`text-sm ${theme.muted} mb-3`}>
                          You've finished the book! 🎉
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-full mb-3"
                          onClick={markCompleted}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Mark as Completed
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant={feedback === true ? "default" : "outline"}
                            size="sm"
                            className="gap-1.5 rounded-full"
                            onClick={() => handleFeedback(true)}
                          >
                            <ThumbsUp className="h-4 w-4" /> Loved it
                          </Button>
                          <Button
                            variant={feedback === false ? "destructive" : "outline"}
                            size="sm"
                            className="gap-1.5 rounded-full"
                            onClick={() => handleFeedback(false)}
                          >
                            <ThumbsDown className="h-4 w-4" /> Not for me
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className={`flex items-center justify-between ${theme.border} border-t ${theme.card} px-4 py-1.5 text-[11px] ${theme.muted} transition-colors duration-500`}>
          <span>{book.title} — {book.author}</span>
          <div className="flex items-center gap-3">
            <span>Page scroll: {scrollProgress}%</span>
            <span>·</span>
            <span>Overall: {readerProgress}%</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // BOOK DETAIL PAGE
  // =========================================================
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <Navbar />

      {/* Hero header with cover */}
      <div className="relative overflow-hidden border-b bg-muted/30">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="container relative py-10">
          <Link
            to="/browse"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Library
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid gap-10 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]"
          >
            {/* Cover */}
            <div className="mx-auto w-full max-w-[280px] md:mx-0 md:max-w-none">
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl shadow-xl ring-1 ring-border/50">
                <img
                  src={book.cover_url && !coverError ? book.cover_url : bookPlaceholder}
                  alt={book.title}
                  className="h-full w-full object-cover"
                  onError={() => setCoverError(true)}
                />
                {(!book.cover_url || coverError) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                    <span className="text-center font-display text-lg font-bold text-white drop-shadow-lg leading-tight">
                      {book.title}
                    </span>
                    <span className="mt-2 text-center text-sm text-white/70 drop-shadow-sm">
                      {book.author}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10" />
                {user && progressPct > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-foreground/70">
                        {completed ? "Completed" : `${progressPct}% read`}
                      </span>
                      {completed && <CheckCircle2 className="h-3 w-3 text-accent" />}
                    </div>
                    <Progress value={progressPct} className="h-1" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col justify-center">
              <div className="flex flex-wrap gap-2">
                {bookIsPublicDomain ? (
                  <Badge className="rounded-full px-3 py-0.5 text-xs font-semibold bg-emerald-600/90 text-white hover:bg-emerald-600">
                    <BookOpen className="h-3 w-3 mr-1" /> Public Domain — Full Text
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-3 py-0.5 text-xs font-semibold gap-1"
                  >
                    <Lock className="h-3 w-3" /> Copyrighted — Preview Only
                  </Badge>
                )}
                {book.genre && (
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-0.5 text-xs font-semibold"
                  >
                    {book.genre}
                  </Badge>
                )}
                {bookIsPublicDomain && chapters.length > 0 && (
                  <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs">
                    {chapters.length} chapters
                  </Badge>
                )}
                {totalWords > 0 && (
                  <Badge variant="outline" className="rounded-full px-3 py-0.5 text-xs">
                    {totalWords.toLocaleString()} words
                  </Badge>
                )}
                {readingTime && (
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-0.5 text-xs gap-1"
                  >
                    <Clock className="h-3 w-3" /> {readingTime}
                  </Badge>
                )}
                {completed && (
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-0.5 text-xs gap-1 border-accent text-accent"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </Badge>
                )}
              </div>

              <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
                {book.title}
              </h1>
              <p className="mt-3 text-lg text-muted-foreground">
                by <span className="font-medium text-foreground/80">{book.author}</span>
              </p>

              {book.description && (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                  {book.description}
                </p>
              )}

              {/* Progress bar */}
              {user && progressPct > 0 && !completed && bookIsPublicDomain && (
                <div className="mt-6 max-w-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Reading progress
                    </span>
                    <span className="text-sm font-semibold text-primary">{progressPct}%</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                {bookIsPublicDomain && chapters.length > 0 ? (
                  <Button
                    onClick={() => setReading(true)}
                    className="gap-2 rounded-full px-6 shadow-lg"
                  >
                    <BookOpen className="h-4 w-4" />
                    {progressPct > 0 && !completed
                      ? "Continue Reading"
                      : completed
                      ? "Read Again"
                      : "Start Reading"}
                  </Button>
                ) : !bookIsPublicDomain ? (
                  <>
                    {openLibraryUrl && (
                      <a href={openLibraryUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="gap-2 rounded-full px-6 shadow-lg">
                          <ExternalLink className="h-4 w-4" /> Read on Open Library
                        </Button>
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(book.title + " " + book.author + " buy book")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" className="gap-2 rounded-full px-6">
                        <ShoppingBag className="h-4 w-4" /> Purchase Book
                      </Button>
                    </a>
                  </>
                ) : null}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Rate:</p>
                  <Button
                    variant={feedback === true ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleFeedback(true)}
                    className="gap-1.5 rounded-full px-5"
                  >
                    <ThumbsUp className="h-4 w-4" /> Like
                  </Button>
                  <Button
                    variant={feedback === false ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => handleFeedback(false)}
                    className="gap-1.5 rounded-full px-5"
                  >
                    <ThumbsDown className="h-4 w-4" /> Dislike
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Copyrighted book notice */}
      {!bookIsPublicDomain && (
        <div className="container py-10">
          <div className="mx-auto max-w-2xl space-y-8">
            {/* Preview content sections */}
            {(() => {
              const sections = parsePreviewContent(book.content);
              if (sections.length === 0) return null;
              return sections.map((section, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                >
                  {section.type === "about" && (
                    <div className="rounded-2xl border bg-card p-8">
                      <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" /> {section.title}
                      </h3>
                      <div className="reading-text text-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {section.content}
                      </div>
                    </div>
                  )}
                  {section.type === "first_line" && (
                    <div className="rounded-2xl border bg-muted/30 p-8">
                      <h3 className="font-display text-lg font-bold mb-3 text-muted-foreground">Opening Line</h3>
                      <blockquote className="border-l-4 border-primary/30 pl-6 py-2 font-reading text-lg italic leading-relaxed text-foreground/70">
                        "{section.content}"
                      </blockquote>
                    </div>
                  )}
                  {section.type === "details" && (
                    <div className="rounded-2xl border bg-card/50 p-6">
                      <h3 className="font-display text-lg font-bold mb-3">Details</h3>
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        {section.content.split("\n").filter(l => l.trim()).map((line, li) => (
                          <p key={li}>{line.trim()}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ));
            })()}

            {/* Copyright notice + links */}
            <div className="rounded-2xl border border-amber-200/50 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20 p-8 text-center">
              <Lock className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400 mb-4" />
              <h3 className="font-display text-xl font-bold text-foreground mb-2">
                Full Text Not Available
              </h3>
              <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
                This book is protected by copyright. You can read it through the platforms below.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                {openLibraryUrl && (
                  <a href={openLibraryUrl} target="_blank" rel="noopener noreferrer">
                    <Button className="gap-2 rounded-full shadow-md">
                      <ExternalLink className="h-4 w-4" /> Read on Open Library
                    </Button>
                  </a>
                )}
                <a
                  href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + " " + book.author)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="gap-2 rounded-full">
                    <ShoppingBag className="h-4 w-4" /> Amazon
                  </Button>
                </a>
                <a
                  href={`https://www.goodreads.com/search?q=${encodeURIComponent(book.title + " " + book.author)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="gap-2 rounded-full">
                    <BookOpen className="h-4 w-4" /> Goodreads
                  </Button>
                </a>
                <a
                  href={`https://books.google.com/books?q=${encodeURIComponent(book.title + " " + book.author)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="gap-2 rounded-full">
                    <Globe className="h-4 w-4" /> Google Books
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapter list (public domain only) */}
      {bookIsPublicDomain && chapters.length > 1 && (
        <div className="container py-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold">
              <List className="h-5 w-5 text-primary" /> Table of Contents
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {chapters.length} chapters · {totalWords.toLocaleString()} words ·{" "}
              {readingTime} total reading time
            </p>
            <div className="grid gap-1.5">
              {chapters.map((ch, i) => {
                const isRead = user && i < currentChapter;
                const isCurrent = user && i === currentChapter && progressPct > 0;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentChapter(i);
                      setReading(true);
                    }}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all hover:bg-muted/50 hover:border-primary/20 ${
                      isCurrent ? "border-primary/30 bg-primary/5 ring-1 ring-primary/10" : "bg-card/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isRead ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                      ) : isCurrent ? (
                        <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/20 text-center text-[10px] leading-4 text-muted-foreground/50">
                          {i + 1}
                        </span>
                      )}
                      <span
                        className={`text-sm font-medium ${
                          isRead
                            ? "text-muted-foreground line-through decoration-muted-foreground/30"
                            : isCurrent
                            ? "text-primary"
                            : ""
                        }`}
                      >
                        {ch.title}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {isCurrent ? "In progress" : formatReadingTime(ch.wordCount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
