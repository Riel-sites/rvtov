import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getCategories, getProducts } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";

const categoriesQueryOptions = queryOptions({
  queryKey: ["categories"],
  queryFn: () => getCategories(),
});

const productsQueryOptions = (categorySlug?: string) =>
  queryOptions({
    queryKey: ["products", categorySlug ?? "all"],
    queryFn: () => getProducts({ data: { categorySlug } }),
  });

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Product Catalog — Virtual Try-On" },
      {
        name: "description",
        content:
          "Browse clothing, jewelry, eyewear, and makeup products with AI virtual try-on.",
      },
      { property: "og:title", content: "Product Catalog — Virtual Try-On" },
      {
        property: "og:description",
        content:
          "Browse clothing, jewelry, eyewear, and makeup products with AI virtual try-on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(categoriesQueryOptions),
      context.queryClient.ensureQueryData(productsQueryOptions()),
    ]),
  errorComponent: CatalogError,
  component: ProductsPage,
});

function CatalogError() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        Catalog temporarily unavailable
      </h1>
      <p className="mt-3 text-muted-foreground">
        We couldn&apos;t load products just now. Please try again in a moment.
      </p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}

function ProductsPage() {
  const { data: categories } = useSuspenseQuery(categoriesQueryOptions);
  const { data: products } = useSuspenseQuery(productsQueryOptions());

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {/* Sidebar filters */}
        <aside className="w-full md:w-64">
          <h2 className="text-lg font-semibold text-foreground">Categories</h2>
          <nav className="mt-4 flex flex-col gap-2">
            <Link
              to="/products"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
            >
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                to="/products"
                search={{ category: category.slug }}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-accent-foreground" }}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Product grid */}
        <div className="flex-1">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Catalog
            </h1>
            <span className="text-sm text-muted-foreground">
              {products.length} products
            </span>
          </div>

          {products.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted p-12 text-center">
              <p className="text-muted-foreground">No products available yet.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
}: {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price_cents: number;
    currency: string;
    status: string;
    category_id: string | null;
    category: { name: string; slug: string } | null;
    product_images: { url: string; sort_order: number }[];
  };
}) {
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
  }).format(product.price_cents / 100);

  const imageUrl = product.product_images[0]?.url;

  return (
    <Card className="group flex flex-col overflow-hidden bg-background">
      <Link to="/products/$productId" params={{ productId: product.id }}>
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
          {product.category && (
            <Badge className="absolute left-3 top-3 bg-background/80 text-foreground">
              {product.category.name}
            </Badge>
          )}
        </div>
      </Link>
      <CardContent className="flex flex-1 flex-col p-4">
        <Link
          to="/products/$productId"
          params={{ productId: product.id }}
          className="text-lg font-semibold text-foreground hover:underline"
        >
          {product.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {product.description ?? "No description"}
        </p>
        <p className="mt-4 text-lg font-medium text-foreground">{price}</p>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button asChild variant="outline" className="w-full">
          <Link to="/products/$productId" params={{ productId: product.id }}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            View Details
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
