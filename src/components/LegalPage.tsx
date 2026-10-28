import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Button asChild variant="ghost" size="sm" className="mb-8">
        <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Home</Link>
      </Button>
      <p className="mb-3 text-sm text-muted-foreground">Virtual Try-On · Updated October 28, 2026</p>
      <h1 className="font-display text-4xl font-bold text-foreground">{title}</h1>
      <div className="mt-8 space-y-8 text-base leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}