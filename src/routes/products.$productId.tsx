import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProductById } from "@/lib/products.functions";
import { addCartItem } from "@/lib/cart.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { ArrowLeft, ShoppingCart, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

const productQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["product", id],
    queryFn: () => getProductById({ data: { id } }),
  });

export const Route = createFileRoute("/products/$productId")({
  head: ({ params }) => ({
    meta: [
      { title: `Product — Virtual Try-On` },
      {
        name: "description",
        content: "View product details and try it on with AI.",
      },
      { property: "og:title", content: `Product — Virtual Try-On` },
      {
        property: "og:description",
        content: "View product details and try it on with AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productQueryOptions(params.productId)),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { data: product } = useSuspenseQuery(productQueryOptions(productId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);
  const addToCart = useServerFn(addCartItem);

  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
  }).format(product.price_cents / 100);

  const selectedVariant = product.product_variants?.find(
    (v) => v.id === selectedVariantId,
  );
  const finalPriceCents =
    selectedVariant?.price_cents ?? product.price_cents;
  const finalPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
  }).format(finalPriceCents / 100);

  async function handleAddToCart() {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setIsAdding(true);
    try {
      await addToCart({
        data: {
          productId: product.id,
          variantId: selectedVariantId || undefined,
          quantity: 1,
        },
      });
      navigate({ to: "/cart" });
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/products"
        className="mb-8 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to catalog
      </Link>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Images */}
        <div className="space-y-4">
          <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted">
            {product.product_images && product.product_images[0] ? (
              <img
                src={product.product_images[0].url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
          </div>
          {product.product_images && product.product_images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.product_images.slice(1).map((img) => (
                <div
                  key={img.id}
                  className="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                >
                  <img
                    src={img.url}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.category && (
            <Badge variant="secondary" className="w-fit">
              {product.category.name}
            </Badge>
          )}
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-4 text-2xl font-medium text-foreground">
            {finalPrice}
          </p>
          <p className="mt-6 text-base text-muted-foreground">
            {product.description ?? "No description available."}
          </p>

          {product.product_variants && product.product_variants.length > 0 && (
            <div className="mt-8 space-y-2">
              <Label htmlFor="variant">Variant</Label>
              <Select
                value={selectedVariantId}
                onValueChange={setSelectedVariantId}
              >
                <SelectTrigger id="variant" className="w-full sm:w-64">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {product.product_variants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.name}
                      {variant.price_cents !== null &&
                        variant.price_cents !== product.price_cents && (
                          <span className="ml-2 text-muted-foreground">
                            (+{new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: product.currency,
                            }).format((variant.price_cents - product.price_cents) / 100)})
                          </span>
                        )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" onClick={handleAddToCart} disabled={isAdding}>
              <ShoppingCart className="mr-2 h-5 w-5" />
              {isAdding ? "Adding…" : "Add to Cart"}
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link
                to="/try-on"
                search={{ productId: product.id }}
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Try It On
              </Link>
            </Button>
          </div>

          <div className="mt-8 rounded-lg border border-border bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Powered by AI. Try this product on yourself to see fit, color, and
              style before purchase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
