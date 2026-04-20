export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          billing_address: string | null
          branch_code: string
          created_at: string
          deleted_at: string | null
          email: string | null
          iban: string | null
          id: string
          kvk_number: string | null
          monthly_budget_cents: number | null
          name: string
          payment_term_days: number
          phone: string | null
          shipping_address: string | null
          updated_at: string | null
          vat_number: string | null
          visiting_address: string | null
        }
        Insert: {
          active?: boolean
          billing_address?: string | null
          branch_code: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kvk_number?: string | null
          monthly_budget_cents?: number | null
          name: string
          payment_term_days?: number
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          vat_number?: string | null
          visiting_address?: string | null
        }
        Update: {
          active?: boolean
          billing_address?: string | null
          branch_code?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kvk_number?: string | null
          monthly_budget_cents?: number | null
          name?: string
          payment_term_days?: number
          phone?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          vat_number?: string | null
          visiting_address?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          reorder_level: number
          updated_at: string | null
          warehouse_location: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_level?: number
          updated_at?: string | null
          warehouse_location?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_level?: number
          updated_at?: string | null
          warehouse_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delta: number
          id: string
          product_id: string
          reason: Database["public"]["Enums"]["inventory_movement_reason"]
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delta: number
          id?: string
          product_id: string
          reason: Database["public"]["Enums"]["inventory_movement_reason"]
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          product_id?: string
          reason?: Database["public"]["Enums"]["inventory_movement_reason"]
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_net_cents: number
          line_vat_cents: number
          quantity: number
          unit_price_cents: number
          updated_at: string | null
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_net_cents?: number
          line_vat_cents?: number
          quantity: number
          unit_price_cents: number
          updated_at?: string | null
          vat_rate: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_net_cents?: number
          line_vat_cents?: number
          quantity?: number
          unit_price_cents?: number
          updated_at?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string
          created_at: string
          deleted_at: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          mollie_payment_id: string | null
          order_id: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          total_gross_cents: number
          total_net_cents: number
          total_vat_cents: number
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          mollie_payment_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_gross_cents?: number
          total_net_cents?: number
          total_vat_cents?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          mollie_payment_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_gross_cents?: number
          total_net_cents?: number
          total_vat_cents?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload_json: Json
          read_at: string | null
          sent_at: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload_json?: Json
          read_at?: string | null
          sent_at?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload_json?: Json
          read_at?: string | null
          sent_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      numbering_sequences: {
        Row: {
          key: string
          next_value: number
          updated_at: string
        }
        Insert: {
          key: string
          next_value?: number
          updated_at?: string
        }
        Update: {
          key?: string
          next_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      public_holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          region: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          region?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          region?: string
        }
        Relationships: []
      }
      order_edit_history: {
        Row: {
          after_snapshot: Json
          before_snapshot: Json
          edit_reason: string | null
          edited_at: string
          edited_by_user_id: string | null
          id: string
          order_id: string
        }
        Insert: {
          after_snapshot: Json
          before_snapshot: Json
          edit_reason?: string | null
          edited_at?: string
          edited_by_user_id?: string | null
          id?: string
          order_id: string
        }
        Update: {
          after_snapshot?: Json
          before_snapshot?: Json
          edit_reason?: string | null
          edited_at?: string
          edited_by_user_id?: string | null
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_edit_history_edited_by_user_id_fkey"
            columns: ["edited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_edit_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_net_cents: number
          order_id: string
          product_id: string
          quantity_approved: number | null
          quantity_packed: number
          quantity_requested: number
          quantity_shipped: number
          unit_price_cents_snapshot: number
          updated_at: string | null
          vat_rate_snapshot: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_net_cents?: number
          order_id: string
          product_id: string
          quantity_approved?: number | null
          quantity_packed?: number
          quantity_requested: number
          quantity_shipped?: number
          unit_price_cents_snapshot: number
          updated_at?: string | null
          vat_rate_snapshot: number
        }
        Update: {
          created_at?: string
          id?: string
          line_net_cents?: number
          order_id?: string
          product_id?: string
          quantity_approved?: number | null
          quantity_packed?: number
          quantity_requested?: number
          quantity_shipped?: number
          unit_price_cents_snapshot?: number
          updated_at?: string | null
          vat_rate_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          branch_approved_at: string | null
          branch_approved_by_user_id: string | null
          branch_id: string
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          edit_count: number
          id: string
          is_rush: boolean
          last_edited_at: string | null
          last_edited_by_user_id: string | null
          notes: string | null
          order_number: string
          rejection_reason: string | null
          rush_set_at: string | null
          rush_set_by_user_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          submitted_at: string | null
          total_gross_cents: number
          total_net_cents: number
          total_vat_cents: number
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          branch_approved_at?: string | null
          branch_approved_by_user_id?: string | null
          branch_id: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          edit_count?: number
          id?: string
          is_rush?: boolean
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          notes?: string | null
          order_number: string
          rejection_reason?: string | null
          rush_set_at?: string | null
          rush_set_by_user_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          total_gross_cents?: number
          total_net_cents?: number
          total_vat_cents?: number
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          branch_approved_at?: string | null
          branch_approved_by_user_id?: string | null
          branch_id?: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          edit_count?: number
          id?: string
          is_rush?: boolean
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          notes?: string | null
          order_number?: string
          rejection_reason?: string | null
          rush_set_at?: string | null
          rush_set_by_user_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          total_gross_cents?: number
          total_net_cents?: number
          total_vat_cents?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_approved_by_user_id_fkey"
            columns: ["branch_approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_last_edited_by_user_id_fkey"
            columns: ["last_edited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          pallet_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          pallet_id: string
          quantity: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          pallet_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pallet_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallet_items_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
        ]
      }
      pallets: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          order_id: string
          packed_at: string | null
          packed_by_user_id: string | null
          pallet_number: string
          status: Database["public"]["Enums"]["pallet_status"]
          updated_at: string | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          packed_at?: string | null
          packed_by_user_id?: string | null
          pallet_number: string
          status?: Database["public"]["Enums"]["pallet_status"]
          updated_at?: string | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          packed_at?: string | null
          packed_by_user_id?: string | null
          pallet_number?: string
          status?: Database["public"]["Enums"]["pallet_status"]
          updated_at?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pallets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallets_packed_by_user_id_fkey"
            columns: ["packed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          recorded_by_user_id: string | null
          reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          recorded_by_user_id?: string | null
          reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          recorded_by_user_id?: string | null
          reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          deleted_at: string | null
          id: string
          product_id: string
          unit_multiplier: number
          updated_at: string | null
        }
        Insert: {
          barcode: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          product_id: string
          unit_multiplier?: number
          updated_at?: string | null
        }
        Update: {
          barcode?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          product_id?: string
          unit_multiplier?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_path: string | null
          max_order_qty: number | null
          min_order_qty: number
          name: string
          sku: string
          unit: string
          unit_price_cents: number
          updated_at: string | null
          vat_rate: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          max_order_qty?: number | null
          min_order_qty?: number
          name: string
          sku: string
          unit?: string
          unit_price_cents?: number
          updated_at?: string | null
          vat_rate?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          max_order_qty?: number | null
          min_order_qty?: number
          name?: string
          sku?: string
          unit?: string
          unit_price_cents?: number
          updated_at?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: Database["public"]["Enums"]["return_item_condition"]
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          resolution:
            | Database["public"]["Enums"]["return_item_resolution"]
            | null
          return_id: string
          updated_at: string | null
        }
        Insert: {
          condition: Database["public"]["Enums"]["return_item_condition"]
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          resolution?:
            | Database["public"]["Enums"]["return_item_resolution"]
            | null
          return_id: string
          updated_at?: string | null
        }
        Update: {
          condition?: Database["public"]["Enums"]["return_item_condition"]
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          resolution?:
            | Database["public"]["Enums"]["return_item_resolution"]
            | null
          return_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          branch_id: string
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          order_id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          requested_by_user_id: string
          rma_number: string
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          requested_by_user_id: string
          rma_number: string
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          requested_by_user_id?: string
          rma_number?: string
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_pallets: {
        Row: {
          created_at: string
          id: string
          pallet_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pallet_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pallet_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_pallets_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_pallets_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string
          created_at: string
          deleted_at: string | null
          delivered_at: string | null
          id: string
          order_id: string
          shipped_at: string | null
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          carrier: string
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id: string
          shipped_at?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          carrier?: string
          created_at?: string
          deleted_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id?: string
          shipped_at?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          login_disabled: boolean
          notification_preferences: Json
          phone: string | null
          ui_catalog_view: Database["public"]["Enums"]["ui_catalog_view"]
          ui_theme: Database["public"]["Enums"]["ui_theme"]
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          login_disabled?: boolean
          notification_preferences?: Json
          phone?: string | null
          ui_catalog_view?: Database["public"]["Enums"]["ui_catalog_view"]
          ui_theme?: Database["public"]["Enums"]["ui_theme"]
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          login_disabled?: boolean
          notification_preferences?: Json
          phone?: string | null
          ui_catalog_view?: Database["public"]["Enums"]["ui_catalog_view"]
          ui_theme?: Database["public"]["Enums"]["ui_theme"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_sequence: { Args: { p_key: string }; Returns: number }
      cleanup_old_notifications: {
        Args: {
          p_cutoff: string
          p_retention_days: number
          p_max_count: number
        }
        Returns: { deleted_count: number; capped: boolean }[]
      }
      current_user_has_branch: {
        Args: { target_branch: string }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { target_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      current_user_roles: {
        Args: never
        Returns: {
          branch_id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      user_shares_branch_with_caller: {
        Args: { target_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      inventory_movement_reason:
        | "order_reserved"
        | "order_released"
        | "packed"
        | "adjustment_in"
        | "adjustment_out"
        | "return_in"
      invoice_status: "draft" | "issued" | "paid" | "overdue" | "cancelled"
      order_status:
        | "draft"
        | "submitted"
        | "branch_approved"
        | "approved"
        | "rejected"
        | "picking"
        | "packed"
        | "shipped"
        | "delivered"
        | "closed"
        | "cancelled"
      pallet_status: "open" | "packed" | "shipped" | "delivered"
      payment_method:
        | "manual_bank_transfer"
        | "ideal_mollie"
        | "credit_note"
        | "other"
      return_item_condition: "damaged" | "wrong_item" | "surplus" | "other"
      return_item_resolution: "refund" | "replace" | "credit_note"
      return_status:
        | "requested"
        | "approved"
        | "rejected"
        | "received"
        | "processed"
        | "closed"
      ui_catalog_view: "table" | "grid"
      ui_theme: "system" | "light" | "dark"
      user_role:
        | "branch_user"
        | "branch_manager"
        | "packer"
        | "administration"
        | "super_admin"
        | "hq_operations_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      inventory_movement_reason: [
        "order_reserved",
        "order_released",
        "packed",
        "adjustment_in",
        "adjustment_out",
        "return_in",
      ],
      invoice_status: ["draft", "issued", "paid", "overdue", "cancelled"],
      order_status: [
        "draft",
        "submitted",
        "branch_approved",
        "approved",
        "rejected",
        "picking",
        "packed",
        "shipped",
        "delivered",
        "closed",
        "cancelled",
      ],
      pallet_status: ["open", "packed", "shipped", "delivered"],
      payment_method: [
        "manual_bank_transfer",
        "ideal_mollie",
        "credit_note",
        "other",
      ],
      return_item_condition: ["damaged", "wrong_item", "surplus", "other"],
      return_item_resolution: ["refund", "replace", "credit_note"],
      return_status: [
        "requested",
        "approved",
        "rejected",
        "received",
        "processed",
        "closed",
      ],
      ui_catalog_view: ["table", "grid"],
      ui_theme: ["system", "light", "dark"],
      user_role: [
        "branch_user",
        "branch_manager",
        "packer",
        "administration",
        "super_admin",
        "hq_operations_manager",
      ],
    },
  },
} as const
