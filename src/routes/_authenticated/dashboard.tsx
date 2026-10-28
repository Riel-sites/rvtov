import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getTryOnSessions } from "@/lib/tryon.functions";
import { getProducts } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Camera, Sparkles, ShoppingBag, ArrowRight, Clock, ImageOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Try-On Studio — Virtual Try-On" },
      { name: "description", content: "Your personal virtual try-on studio. Review past sessions and start new try-ons." },
      { property: "og:title", content: "Your Try-On Studio — Virtual Try-On" },
      { property: "og:description", content: "Your personal virtual try-on studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["try-on-sessions"],
      queryFn: () => getTryOnSessions(),
    });
    await context.queryClient.ensureQueryData({
      queryKey: ["recommended-products"],
      queryFn: () => getProducts({ data: { limit: 4, offset: 0 } }),
    });
    return {};
  },
  component: TryOnHomePage,
});

function TryOnHomePage() {
  const { user } = useAuth();

  const sessionsQuery = useSuspenseQuery({
    queryKey: ["try-on-sessions"],
    queryFn: () => getTryOnSessions(),
  });

  const productsQuery = useSuspenseQuery({
    queryKey: ["recommended-products"],
    queryFn: () => getProducts({ data: { limit: 4, offset: 0 } }),
  });

  const sessions = sessionsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const firstName = user?.user_metadata?.["full_name"]?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Welcome hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary/80 via-background to-muted p-8 sm:p-12">
        <div className="relative z-10 max-w-2xl">
          <Badge variant="outline" className="mb-4 border-accent/30 text-accent">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Your personal studio
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Discover how products look on you, save your favorite sessions, and shop with confidence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/try-on">
                <Camera className="mr-2 h-4 w-4" />
                Start a try-on
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/products">Browse catalog</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Quick stats / actions */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          label="Completed try-ons"
          value={completedSessions}
          icon={Sparkles}
          href="/try-on"
          cta="Try another"
        />
        <QuickStatCard
          label="Saved sessions"
          value={sessions.length}
          icon={Camera}
          href="/try-on"
          cta="View history"
        />
        <QuickStatCard
          label="Products ready"
          value={products.length}
          icon={ShoppingBag}
          href="/products"
          cta="Shop now"
        />
      </section>

      <Separator className="my-10" />

      {/* Recent sessions */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Recent try-ons</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/try-on" className="gap-1">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {sessions.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-secondary p-4">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-foreground">No try-ons yet</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Upload a photo and pick a product to see your first AI-generated try-on in seconds.
              </p>
              <Button asChild className="mt-6">
                <Link to="/try-on">Start your first try-on</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sessions.slice(0, 4).map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>

      <Separator className="my-10" />

      {/* Recommended products */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Try these next</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/products" className="gap-1">
              View catalog <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {products.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-secondary p-4">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-foreground">No products yet</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                The catalog is being curated. Check back soon for products you can try on.
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link to="/products">Browse catalog</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickStatCard({
  label,
  value,
  icon: Icon,
  href,
  cta,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  cta: string;
}) {
  return (
    <Card className="bg-background">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className="rounded-lg bg-secondary p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
        <Button asChild variant="ghost" className="mt-4 h-auto px-0 py-0 text-sm text-accent hover:text-accent/80">
          <Link to={href} className="gap-1">
            {cta} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SessionCard({ session }: { session: Awaited<ReturnType<typeof getTryOnSessions>>[number] }) {
  const formattedDate = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="overflow-hidden bg-background">
      <div className="relative aspect-square bg-muted">
        {session.resultUrl ? (
          <img
            src={session.resultUrl}
            alt={session.prompt ?? "Try-on result"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">Preview unavailable</p>
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge variant="secondary" className="text-xs capitalize">
            {session.status}
          </Badge>
        </div>
      </div>
      <CardContent className="p-4">
        <p className="truncate text-sm font-medium text-foreground">
          {session.product?.name ?? "Custom try-on"}
        </p>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formattedDate}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductCard({
  product,
}: {
  product: Awaited<ReturnType<typeof getProducts>>[number];
}) {
  const imageUrl =
    product.product_images?.[0]?.url ??
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23222'/%3E%3C/svg%3E";
  const price = (product.price_cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: product.currency ?? "USD",
  });

  const tryOnPrompt = [product.category?.name, product.name].filter(Boolean).join(" — ");

  return (
    <Card className="group flex h-full flex-col overflow-hidden bg-background transition-colors hover:bg-accent/10">
      <Link
        to="/products/$productId"
        params={{ productId: product.id }}
        className="block"
        aria-label={`View ${product.name}`}
      >
        <div className="aspect-square overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <CardHeader className="p-4 pb-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {product.category?.name ?? "Product"}
          </p>
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{product.name}</h3>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <p className="text-sm font-medium text-foreground">{price}</p>
        </CardContent>
      </Link>
      <CardContent className="mt-auto flex gap-2 p-4 pt-0">
        <Button asChild size="sm" className="flex-1">
          <Link to="/try-on" search={{ productId: product.id, prompt: tryOnPrompt }} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Try it on
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/products/$productId" params={{ productId: product.id }}>
            Details
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
