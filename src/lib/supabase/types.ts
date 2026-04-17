/**
 * Database types — placeholder.
 *
 * This file is overwritten by `npm run db:types` after migrations have been
 * applied to the hosted project. Until then, queries are effectively
 * untyped (Supabase SDK falls back to `any` at the column level). Once
 * migrations land, regenerate and commit the full file.
 */
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      user_role: "branch_user" | "branch_manager" | "packer" | "administration" | "super_admin";
      ui_theme: "system" | "light" | "dark";
    };
    CompositeTypes: Record<string, unknown>;
  };
};
