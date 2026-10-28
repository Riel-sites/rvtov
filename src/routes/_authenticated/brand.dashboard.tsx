import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/brand/dashboard")({
  head: () => ({
    meta: [
      { title: "Brand Dashboard | Virtual Try-On" },
      { name: "description", content: "Manage your products and orders." },
      { property: "og:title", content: "Brand Dashboard | Virtual Try-On" },
      { property: "og:description", content: "Manage your products and orders." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BrandDashboardPage,
});

function BrandDashboardPage() {
  const { isBrand, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Skeleton className="h-8 w-56" />
      </div>
    );
  }

  if (!isBrand && !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Brands only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is for brand and retailer accounts. Contact us if you'd like to sell on the platform.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Brand Dashboard</h1>
      <p className="mt-3 text-muted-foreground">
        Product management for brands is coming next. In the meantime you can browse the catalog.
      </p>
      <Button asChild className="mt-8">
        <Link to="/products">View catalog</Link>
      </Button>
    </div>
  );
}
