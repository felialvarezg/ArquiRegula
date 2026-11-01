"use client";

import { Heart, BookOpen } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-secondary/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-center sm:flex-row sm:px-6 sm:text-left">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span>
            Base de conocimiento: 23 fragmentos de LGUC, OGUC y Ley 19.537 ·
          
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        
          <Heart className="h-3 w-3 fill-primary text-primary" />
        </div>
      </div>
    </footer>
  );
}
