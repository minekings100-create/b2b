/**
 * Database types — hand-maintained until first `npm run db:types` run.
 *
 * The generator will overwrite this file once migrations have been applied
 * to the hosted project. Until then, rows are hand-typed with just enough
 * shape to satisfy the SDK's generic constraints for Phase 1 queries.
 */
export type UserRole =
  | "branch_user"
  | "branch_manager"
  | "packer"
  | "administration"
  | "super_admin";

export type UiTheme = "system" | "light" | "dark";

export type Database = {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          branch_code: string;
          email: string | null;
          phone: string | null;
          visiting_address: string | null;
          billing_address: string | null;
          shipping_address: string | null;
          kvk_number: string | null;
          vat_number: string | null;
          iban: string | null;
          monthly_budget_cents: number | null;
          payment_term_days: number;
          active: boolean;
          created_at: string;
          updated_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          branch_code: string;
          email?: string | null;
          phone?: string | null;
          visiting_address?: string | null;
          billing_address?: string | null;
          shipping_address?: string | null;
          kvk_number?: string | null;
          vat_number?: string | null;
          iban?: string | null;
          monthly_budget_cents?: number | null;
          payment_term_days?: number;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]> & {
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          active: boolean;
          ui_theme: UiTheme;
          created_at: string;
          updated_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          active?: boolean;
          ui_theme?: UiTheme;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          active?: boolean;
          ui_theme?: UiTheme;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      user_branch_roles: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          branch_id: string | null;
          role: UserRole;
        };
        Update: {
          role?: UserRole;
          branch_id?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          actor_user_id: string | null;
          before_json: unknown;
          after_json: unknown;
          created_at: string;
        };
        Insert: {
          entity_type: string;
          entity_id: string;
          action: string;
          actor_user_id?: string | null;
          before_json?: unknown;
          after_json?: unknown;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      numbering_sequences: {
        Row: { key: string; next_value: number; updated_at: string };
        Insert: { key: string; next_value?: number };
        Update: { next_value?: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      allocate_sequence: {
        Args: { p_key: string };
        Returns: number;
      };
      current_user_has_role: {
        Args: { target_role: UserRole };
        Returns: boolean;
      };
      current_user_has_branch: {
        Args: { target_branch: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      ui_theme: UiTheme;
    };
    CompositeTypes: Record<string, never>;
  };
};
