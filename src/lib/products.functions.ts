import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function createPublishableClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export const getCategories = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createPublishableClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
);

export const getProducts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        categorySlug: z.string().optional(),
        limit: z.number().max(50).default(24),
        offset: z.number().default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = createPublishableClient();

    let query = supabase
      .from("products")
      .select(
        "id, name, slug, description, price_cents, currency, status, category_id, category:categories(name, slug), product_images(url, sort_order)",
      )
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(data.limit)
      .range(data.offset, data.offset + data.limit - 1);

    if (data.categorySlug) {
      query = query.eq("category.slug", data.categorySlug);
    }

    const { data: products, error } = await query;
    if (error) throw error;
    return products ?? [];
  });

export const getProductById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = createPublishableClient();
    const { data: product, error } = await supabase
      .from("products")
      .select(
        "*, category:categories(*), product_images(*), product_variants(*)",
      )
      .eq("id", data.id)
      .eq("status", "published")
      .single();
    if (error) throw error;
    return product;
  });

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        slug: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        priceCents: z.number().int().nonnegative(),
        currency: z.string().length(3).default("USD"),
        categoryId: z.string().uuid(),
        status: z.enum(["draft", "published"]).default("draft"),
        imageUrls: z.array(z.string().url()).max(10).default([]),
        variants: z
          .array(
            z.object({
              name: z.string().min(1),
              sku: z.string().optional().nullable(),
              priceCents: z.number().int().nonnegative().nullable().optional(),
              stockQuantity: z.number().int().nonnegative().default(0),
            }),
          )
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "brand",
    });
    if (!hasRole) throw new Error("Only brand accounts can create products");

    const { data: product, error: productError } = await context.supabase
      .from("products")
      .insert({
        brand_id: context.userId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        price_cents: data.priceCents,
        currency: data.currency,
        category_id: data.categoryId,
        status: data.status,
      })
      .select()
      .single();
    if (productError) throw productError;

    if (data.imageUrls.length > 0) {
      const imageInserts = data.imageUrls.map((url, index) => ({
        product_id: product.id,
        url,
        sort_order: index,
      }));
      const { error: imageError } = await context.supabase
        .from("product_images")
        .insert(imageInserts);
      if (imageError) throw imageError;
    }

    if (data.variants && data.variants.length > 0) {
      const variantInserts = data.variants.map((variant) => ({
        product_id: product.id,
        name: variant.name,
        sku: variant.sku ?? null,
        price_cents: variant.priceCents ?? null,
        stock_quantity: variant.stockQuantity,
      }));
      const { error: variantError } = await context.supabase
        .from("product_variants")
        .insert(variantInserts);
      if (variantError) throw variantError;
    }

    return product;
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional().nullable(),
        priceCents: z.number().int().nonnegative().optional(),
        status: z.enum(["draft", "published"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: fetchError } = await context.supabase
      .from("products")
      .select("brand_id")
      .eq("id", data.id)
      .single();
    if (fetchError) throw fetchError;
    if (product.brand_id !== context.userId) throw new Error("Forbidden");

    const update: Partial<{
      name: string;
      description: string | null;
      price_cents: number;
      status: "draft" | "published";
    }> = {};
    if (data.name !== undefined) update["name"] = data.name;
    if (data.description !== undefined) update["description"] = data.description ?? null;
    if (data.priceCents !== undefined) update["price_cents"] = data.priceCents;
    if (data.status !== undefined) update["status"] = data.status;

    const { error } = await context.supabase
      .from("products")
      .update(update)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: fetchError } = await context.supabase
      .from("products")
      .select("brand_id")
      .eq("id", data.id)
      .single();
    if (fetchError) throw fetchError;
    if (product.brand_id !== context.userId) throw new Error("Forbidden");

    const { error } = await context.supabase
      .from("products")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
