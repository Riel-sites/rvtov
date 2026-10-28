import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getCartItems, removeCartItem, updateCartItemQuantity } from "@/lib/cart.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const cartQueryOptions = queryOptions({
  queryKey: ["cart"],
  queryFn: () => getCartItems(),
});

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Shopping Cart — Virtual Try-On" },
      {
        name: "description",
        content: "Review your selected items and proceed to checkout.",
      },
      { property: "og:title", content: "Shopping Cart — Virtual Try-On" },
      {
        property: "og:description",
        content: "Review your selected items and proceed to checkout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(cartQueryOptions),
  component: CartPage,
});

function CartPage() {
  const { data: cartItems } = useSuspenseQuery(cartQueryOptions);
  const queryClient = useQueryClient();
  const updateQuantity = useServerFn(updateCartItemQuantity);
  const removeItem = useServerFn(removeCartItem);

  async function handleQuantityChange(cartItemId: string, quantity: number) {
    await updateQuantity({ data: { cartItemId, quantity } });
    queryClient.invalidateQueries({ queryKey: ["cart"] });
  }

  async function handleRemove(cartItemId: string) {
    await removeItem({ data: { cartItemId } });
    queryClient.invalidateQueries({ queryKey: ["cart"] });
  }

  const totalCents = cartItems.reduce((sum, item) => {
    const unitPrice =
      item.variant?.price_cents ?? item.product?.price_cents ?? 0;
    return sum + unitPrice * item.quantity;
  }, 0);

  const currency = cartItems[0]?.product?.currency ?? "USD";
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(totalCents / 100);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Shopping Cart
      </h1>

      {cartItems.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-muted p-12 text-center">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Button asChild className="mt-4">
            <Link to="/products">Browse Catalog</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onQuantityChange={handleQuantityChange}
                onRemove={handleRemove}
              />
            ))}
          </div>

          <div className="rounded-lg border border-border bg-muted p-6">
            <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{total}</span>
            </div>
            <div className="mt-4 flex items-center justify-between text-lg font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">{total}</span>
            </div>
            <Button asChild className="mt-6 w-full" size="lg">
              <Link to="/checkout">Proceed to Checkout</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: {
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      price_cents: number;
      currency: string;
      product_images: { url: string }[];
    } | null;
    variant: {
      id: string;
      name: string;
      price_cents: number | null;
    } | null;
  };
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}) {
  if (!item.product) return null;

  const unitPrice = item.variant?.price_cents ?? item.product.price_cents;
  const lineTotal = unitPrice * item.quantity;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: item.product.currency,
  }).format(lineTotal / 100);

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-background p-4">
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {item.product.product_images[0] ? (
          <img
            src={item.product.product_images[0].url}
            alt={item.product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <Link
            to="/products/$productId"
            params={{ productId: item.product.id }}
            className="font-semibold text-foreground hover:underline"
          >
            {item.product.name}
          </Link>
          {item.variant && (
            <p className="text-sm text-muted-foreground">
              {item.variant.name}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={item.quantity}
              onChange={(e) =>
                onQuantityChange(item.id, parseInt(e.target.value, 10) || 0)
              }
              className="w-20"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <p className="font-medium text-foreground">{formatted}</p>
        </div>
      </div>
    </div>
  );
}
