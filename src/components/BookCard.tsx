import { useState, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import bookPlaceholder from "@/assets/book-placeholder.png";

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  description?: string | null;
  cover_url?: string | null;
}

const BookCard = forwardRef<HTMLAnchorElement, BookCardProps>(
  ({ id, title, author, genre, cover_url }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = cover_url && !imgError;

    return (
      <Link to={`/book/${id}`} className="group block" ref={ref}>
        <Card className="overflow-hidden border-0 bg-transparent shadow-none transition-all duration-300">
          {/* Cover */}
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-md ring-1 ring-border/30 transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1.5 group-hover:ring-primary/20">
            <img
              src={showImage ? cover_url : bookPlaceholder}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={() => setImgError(true)}
            />
            {/* Title overlay on placeholder */}
            {!showImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <span className="text-center font-display text-sm font-bold leading-tight text-white drop-shadow-md line-clamp-3">
                  {title}
                </span>
                <span className="mt-1 text-center text-[10px] text-white/70 drop-shadow-sm">
                  {author}
                </span>
              </div>
            )}
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
            {genre && (
              <div className="absolute bottom-2 left-2 right-2 flex justify-start opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <Badge className="rounded-full bg-background/80 text-foreground/80 backdrop-blur-sm text-[10px] px-2 py-0.5 shadow-sm">
                  {genre}
                </Badge>
              </div>
            )}
          </div>

          {/* Info */}
          <CardContent className="px-1 pt-3 pb-0">
            <h3 className="font-display text-sm font-semibold leading-snug line-clamp-2 transition-colors group-hover:text-primary">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{author}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }
);

BookCard.displayName = "BookCard";

export default BookCard;
