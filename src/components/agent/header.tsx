"use client";

import { Building2, Github, FileText } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">
              ArquiRegula <span className="text-primary">Chile</span>
            </h1>
            <p className="text-[11px] text-muted-foreground sm:text-xs">
              Agente de IA para regularización de edificaciones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            LGUC · OGUC · Ley 19.537
          </span>
          <a
            href="https://www.bcn.cl/leychile/navegar?idNorma=8201"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex"
          >
            <FileText className="h-3.5 w-3.5" />
            BCN
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Repositorio"
          >
            <Github className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
