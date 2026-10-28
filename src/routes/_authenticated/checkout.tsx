import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [
    { title: "Checkout — Virtual Try-On" },
    { name: "description", content: "View the checkout status for your saved Virtual Try-On cart." },
    { property: "og:title", content: "Checkout — Virtual Try-On" },
    { property: "og:description", content: "Your saved cart and checkout status on Virtual Try-On." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Checkout</h1>
      <p className="mt-3 text-muted-foreground">
        Payment is being wired up next. Your cart is saved to your account in the meantime.
      </p>
      <Button asChild className="mt-8">
        <Link to="/cart">Back to cart</Link>
      </Button>
    </div>
  );
}
