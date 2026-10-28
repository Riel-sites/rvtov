import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  brand_name: string | null;
  roles: string[];
  created_at: string;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message === "forbidden" ? "Admins only" : error.message);
    return (data ?? []).map((u) => ({ ...u, roles: u.roles ?? [] }));
  });

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "brand"]),
  grant: z.boolean(),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => setRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_user_role", {
      _user_id: data.userId,
      _role: data.role,
      _grant: data.grant,
    });
    if (error) {
      const msg = error.message.includes("own admin role")
        ? "You can't remove your own admin role."
        : error.message === "forbidden"
          ? "Admins only"
          : error.message;
      throw new Error(msg);
    }
    const { logMonitoringEvent } = await import("@/lib/monitoring.server");
    await logMonitoringEvent({
      event_type: "role_changed",
      user_id: context.userId,
      route: "/admin",
      status: data.grant ? "granted" : "revoked",
      detail: { target_user_id: data.userId, role: data.role },
    });
    return { ok: true };
  });

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => resetPasswordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Admins only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    const { logMonitoringEvent } = await import("@/lib/monitoring.server");
    await logMonitoringEvent({
      event_type: "role_changed",
      user_id: context.userId,
      route: "/admin",
      status: "password_reset",
      detail: { target_user_id: data.userId },
    });
    return { ok: true };
  });
