"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Post-MVP Sprint 1 — deactivated-login check.
 *
 * After a successful Supabase Auth sign-in, look up `login_disabled`
 * on the matching `public.users` row. If true, sign the session
 * straight back out and surface a clean error on /login. Keeps Auth
 * as the identity layer and our table as the authorization layer.
 */
const DEACTIVATED_MSG =
  "This account is deactivated. Contact an administrator.";

const PasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const MagicLinkSchema = z.object({
  email: z.string().email(),
});

export type FormState = { error?: string; success?: string } | undefined;

export async function signInWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = PasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  // Post-sign-in deactivation check — admin client bypasses RLS since
  // we may not trust the just-created session yet.
  if (data.user) {
    const adm = createAdminClient();
    const { data: row } = await adm
      .from("users")
      .select("login_disabled")
      .eq("id", data.user.id)
      .maybeSingle();
    if (row?.login_disabled) {
      await supabase.auth.signOut();
      return { error: DEACTIVATED_MSG };
    }
  }

  redirect("/dashboard");
}

export async function signInWithMagicLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = MagicLinkSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const supabase = createClient();
  const origin =
    headers().get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/callback` },
  });
  if (error) return { error: error.message };
  return { success: "Check your inbox for the sign-in link." };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
