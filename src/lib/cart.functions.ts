import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCartItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cart_items")
      .select(
        "*, product:products(id, name, price_cents, currency, product_images(url)), variant:product_variants(id, name, price_cents)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const addCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        quantity: z.number().int().positive().default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", context.userId)
      .eq("product_id", data.productId);

    if (data.variantId) {
      query = query.eq("variant_id", data.variantId);
    } else {
      query = query.is("variant_id", null);
    }

    const { data: existing, error: findError } = await query.maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { error } = await context.supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + data.quantity })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("cart_items").insert({
        user_id: context.userId,
        product_id: data.productId,
        variant_id: data.variantId ?? null,
        quantity: data.quantity,
      });
      if (error) throw error;
    }

    return { ok: true };
  });

export const updateCartItemQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        cartItemId: z.string().uuid(),
        quantity: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.quantity === 0) {
      const { error } = await context.supabase
        .from("cart_items")
        .delete()
        .eq("id", data.cartItemId)
        .eq("user_id", context.userId);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("cart_items")
        .update({ quantity: data.quantity })
        .eq("id", data.cartItemId)
        .eq("user_id", context.userId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const removeCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cartItemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cart_items")
      .delete()
      .eq("id", data.cartItemId)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
