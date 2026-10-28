import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { PricingPacks } from "@/components/PricingPacks";
import {
  Sparkles,
  ShoppingBag,
  Palette,
  BarChart3,
  ArrowRight,
  Activity,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Virtual Try-On — Try Clothing on Any Subject" },
      {
        name: "description",
        content:
          "Preview clothing on yourself or a subject you have permission to use. Create AI try-ons and artistic styles, starting with 5 free tokens.",
      },
      {
        property: "og:title",
        content: "Virtual Try-On — Try Clothing on Any Subject",
      },
      {
        property: "og:description",
        content:
          "For everyone imagining a new outfit: AI clothing previews and artistic styles, with 5 free starter tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://images.unsplash.com/photo-1539109132314-d49c02d7129d?auto=format&fit=crop&q=80&w=1200" },
      { name: "twitter:image", content: "https://images.unsplash.com/photo-1539109132314-d49c02d7129d?auto=format&fit=crop&q=80&w=1200" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-bg py-24 sm:py-32">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-64 bg-hero-violet/10 blur-[120px] rounded-full" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 relative">
          <div className="flex flex-col items-center text-center">
            <div className="space-y-6 mb-16">
              <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.1] text-foreground">
                Virtual Try-On{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-hero-violet to-hero-cyan">
                  for Everyone
                </span>
              </h1>
              <p className="font-body text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Try clothing on yourself or a subject you have permission to use.
                Explore a new outfit, create a styled portrait, or bring a clothing idea to life.
                Start with 5 free tokens.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full px-8 font-display"
                >
                  <Link to="/auth">
                    Try an Outfit Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8 border-hero-border hover:border-hero-cyan hover:bg-hero-cyan/5 font-display"
                >
                  <Link to="/products">Explore Clothing</Link>
                </Button>
              </div>
            </div>

            {/* Main Visual Stage */}
            <div className="relative w-full max-w-4xl aspect-video group">
              <div className="absolute inset-0 bg-gradient-to-t from-hero-bg via-transparent to-transparent z-10" />
              <div className="absolute -inset-1 bg-gradient-to-r from-hero-violet to-hero-cyan rounded-2xl opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-700" />
              <div className="relative h-full w-full bg-hero-surface border border-hero-border rounded-2xl overflow-hidden flex shadow-2xl">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="w-full h-full bg-cover bg-center opacity-60 grayscale group-hover:grayscale-0 transition-all duration-1000"
                    style={{
                      backgroundImage:
                        "url('https://images.unsplash.com/photo-1539109132314-d49c02d7129d?auto=format&fit=crop&q=80&w=1200')",
                    }}
                  />
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-hero-cyan to-transparent animate-scan shadow-[0_0_15px_var(--hero-cyan)]" />
                  <div className="absolute top-10 left-10 flex flex-col gap-3 font-body text-[10px] tracking-widest uppercase">
                    <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-2 border border-hero-border rounded-md text-foreground">
                      <span className="w-2 h-2 rounded-full bg-hero-cyan animate-pulse" />
                      OUTFIT INSPIRATION
                    </div>
                    <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-2 border border-hero-border rounded-md text-foreground">
                      <span className="w-2 h-2 rounded-full bg-hero-violet" />
                      CREATIVE POSSIBILITIES
                    </div>
                  </div>
                  <div className="absolute bottom-10 right-10">
                    <div className="bg-black/60 backdrop-blur-xl border border-hero-cyan/30 p-4 rounded-xl flex items-center gap-4">
                      <div className="flex flex-col text-left">
                        <span className="text-[10px] text-hero-cyan font-bold tracking-widest">
                          VIRTUAL TRY-ON
                        </span>
                        <span className="font-display text-2xl text-foreground">
                          Imagine it
                        </span>
                      </div>
                      <div className="w-10 h-10 rounded-full border-4 border-hero-cyan border-t-transparent animate-spin" />
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 border-[40px] border-black/20 pointer-events-none" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-4 z-20">
                <div className="bg-hero-surface border border-hero-border px-5 py-2 rounded-full text-sm font-medium flex items-center gap-2 text-foreground">
                  <Activity className="w-4 h-4 text-hero-violet" />
                  Your Subject
                </div>
                <div className="bg-hero-surface border border-hero-border px-5 py-2 rounded-full text-sm font-medium flex items-center gap-2 text-foreground">
                  <Zap className="w-4 h-4 text-hero-cyan" />
                  Your Outfit
                </div>
              </div>
            </div>

            {/* Trusted By */}
            <div className="mt-24 pt-8 border-t border-hero-border w-full max-w-4xl">
              <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-6">
                For anyone imagining a new look
              </p>
              <div className="flex flex-wrap justify-center sm:justify-between items-center gap-6 sm:gap-0 opacity-30 grayscale contrast-200">
                {["Personal style", "Creative portraits", "Outfit ideas", "Fashion projects"].map((brand) => (
                  <span
                    key={brand}
                    className="font-display text-lg text-foreground"
                  >
                    {brand}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-secondary/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
              More ways to imagine your look
            </h2>
            <p className="font-body mx-auto mt-4 max-w-2xl text-muted-foreground">
              A personal outfit idea or a creative project — everyone is welcome.
              AI previews are inspiration, not a guarantee of physical fit.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShoppingBag,
                title: "Clothing",
                description:
                  "Explore dresses, tops, and outerwear on yourself or your chosen subject.",
                accent: "text-hero-violet",
              },
              {
                icon: Sparkles,
                title: "Your Subject",
                description:
                  "Create with a photo of yourself or someone who has given you permission.",
                accent: "text-hero-cyan",
              },
              {
                icon: Palette,
                title: "Artistic Styles",
                description:
                  "Reimagine finished images in watercolor, film noir, and illustrated looks.",
                accent: "text-hero-violet",
              },
              {
                icon: BarChart3,
                title: "Creative Projects",
                description:
                  "Explore outfit concepts for portraits, fashion ideas, or your next project.",
                accent: "text-hero-cyan",
              },
            ].map((feature) => (
              <Card key={feature.title} className="bg-background border-border">
                <CardContent className="p-6">
                  <feature.icon className={`h-8 w-8 ${feature.accent}`} />
                  <h3 className="font-display mt-4 text-lg font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="font-body mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Simple, pay-as-you-go pricing
            </h2>
            <p className="font-body mx-auto mt-4 max-w-2xl text-muted-foreground">
              Start with 5 free try-ons when you sign up. Need more? Grab a token pack.
            </p>
          </div>
          <PricingPacksWithUser />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-hero-bg">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
            What outfit will you imagine next?
          </h2>
          <p className="font-body mx-auto mt-4 max-w-2xl text-muted-foreground">
            Start with your subject and a clothing idea. Your first 5 tokens are free —
            for personal looks, creative work, and everything in between.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-full px-8 font-display"
            >
              <Link to="/auth">Get Started</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full px-8 border-hero-border hover:border-hero-cyan hover:bg-hero-cyan/5 font-display"
            >
              <Link to="/products">Browse Catalog</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PricingPacksWithUser() {
  const { user } = useAuth();
  return <PricingPacks email={user?.email} />;
}
