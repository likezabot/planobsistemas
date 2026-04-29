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
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          payload: Json | null
          restaurant_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json | null
          restaurant_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json | null
          restaurant_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          change_amount: number
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          item_type: string
          new_quantity: number
          old_quantity: number
          order_id: string | null
          reason: string
          restaurant_id: string
          tenant_id: string
        }
        Insert: {
          change_amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          item_type: string
          new_quantity: number
          old_quantity: number
          order_id?: string | null
          reason: string
          restaurant_id: string
          tenant_id: string
        }
        Update: {
          change_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          item_type?: string
          new_quantity?: number
          old_quantity?: number
          order_id?: string | null
          reason?: string
          restaurant_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          is_required: boolean
          max_options: number
          min_options: number
          name: string
          restaurant_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          max_options?: number
          min_options?: number
          name: string
          restaurant_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          max_options?: number
          min_options?: number
          name?: string
          restaurant_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      option_item_price_overrides: {
        Row: {
          created_at: string
          id: string
          option_item_id: string
          price_cents: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_item_id: string
          price_cents?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_item_id?: string
          price_cents?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_item_price_overrides_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_item_price_overrides_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      option_items: {
        Row: {
          active: boolean
          allow_out_of_stock_sale: boolean | null
          code: string | null
          cost_cents: number | null
          created_at: string
          group_id: string
          id: string
          low_stock_alert: number | null
          name: string
          price_cents: number
          sort_order: number | null
          stock_quantity: number | null
          track_stock: boolean | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          code?: string | null
          cost_cents?: number | null
          created_at?: string
          group_id: string
          id?: string
          low_stock_alert?: number | null
          name: string
          price_cents?: number
          sort_order?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          code?: string | null
          cost_cents?: number | null
          created_at?: string
          group_id?: string
          id?: string
          low_stock_alert?: number | null
          name?: string
          price_cents?: number
          sort_order?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          customization: Json | null
          id: string
          note: string | null
          order_id: string
          product_id: string
          quantity: number
          subtotal_cents: number | null
          total_price_cents: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          customization?: Json | null
          id?: string
          note?: string | null
          order_id: string
          product_id: string
          quantity: number
          subtotal_cents?: number | null
          total_price_cents: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          customization?: Json | null
          id?: string
          note?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          subtotal_cents?: number | null
          total_price_cents?: number
          unit_price_cents?: number
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
          address: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivery_fee_cents: number
          id: string
          idempotency_key: string
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          print_status: Database["public"]["Enums"]["order_print_status"] | null
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          delivery_fee_cents?: number
          id?: string
          idempotency_key: string
          notes?: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"]
          print_status?:
            | Database["public"]["Enums"]["order_print_status"]
            | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tenant_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivery_fee_cents?: number
          id?: string
          idempotency_key?: string
          notes?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"]
          print_status?:
            | Database["public"]["Enums"]["order_print_status"]
            | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tenant_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pizza_configs: {
        Row: {
          allow_edge_customization: boolean
          max_flavors: number
          price_rule: Database["public"]["Enums"]["pizza_price_rule"]
          product_id: string
        }
        Insert: {
          allow_edge_customization?: boolean
          max_flavors?: number
          price_rule?: Database["public"]["Enums"]["pizza_price_rule"]
          product_id: string
        }
        Update: {
          allow_edge_customization?: boolean
          max_flavors?: number
          price_rule?: Database["public"]["Enums"]["pizza_price_rule"]
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pizza_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pizza_flavor_prices: {
        Row: {
          created_at: string
          flavor_id: string
          id: string
          price_cents: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          flavor_id: string
          id?: string
          price_cents?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          flavor_id?: string
          id?: string
          price_cents?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pizza_flavor_prices_flavor_id_fkey"
            columns: ["flavor_id"]
            isOneToOne: false
            referencedRelation: "pizza_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pizza_flavor_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      pizza_flavors: {
        Row: {
          active: boolean
          allow_out_of_stock_sale: boolean | null
          category: string | null
          code: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          ingredients: string | null
          low_stock_alert: number | null
          name: string
          restaurant_id: string
          sort_order: number
          stock_quantity: number | null
          tenant_id: string
          track_stock: boolean | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          category?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string | null
          low_stock_alert?: number | null
          name: string
          restaurant_id: string
          sort_order?: number
          stock_quantity?: number | null
          tenant_id: string
          track_stock?: boolean | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          category?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          ingredients?: string | null
          low_stock_alert?: number | null
          name?: string
          restaurant_id?: string
          sort_order?: number
          stock_quantity?: number | null
          tenant_id?: string
          track_stock?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      print_agents: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          restaurant_id: string
          secret_key: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          restaurant_id: string
          secret_key?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          restaurant_id?: string
          secret_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_agents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          agent_id: string | null
          attempts: number
          claimed_at: string | null
          created_at: string | null
          id: string
          last_error: string | null
          order_id: string
          payload: Json
          payload_hash: string
          printed_at: string | null
          restaurant_id: string
          source: string
          status: string
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          order_id: string
          payload: Json
          payload_hash: string
          printed_at?: string | null
          restaurant_id: string
          source: string
          status?: string
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          order_id?: string
          payload?: Json
          payload_hash?: string
          printed_at?: string | null
          restaurant_id?: string
          source?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          group_id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          group_id: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          group_id?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pizza_flavors: {
        Row: {
          flavor_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          flavor_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          flavor_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_pizza_flavors_flavor_id_fkey"
            columns: ["flavor_id"]
            isOneToOne: false
            referencedRelation: "pizza_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pizza_flavors_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          allow_out_of_stock_sale: boolean | null
          code: string | null
          cost_cents: number | null
          created_at: string
          diameter_cm: number | null
          id: string
          low_stock_alert: number | null
          name: string
          price_cents: number
          product_id: string
          slices: number | null
          sort_order: number | null
          stock_quantity: number | null
          track_stock: boolean | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          code?: string | null
          cost_cents?: number | null
          created_at?: string
          diameter_cm?: number | null
          id?: string
          low_stock_alert?: number | null
          name: string
          price_cents?: number
          product_id: string
          slices?: number | null
          sort_order?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          code?: string | null
          cost_cents?: number | null
          created_at?: string
          diameter_cm?: number | null
          id?: string
          low_stock_alert?: number | null
          name?: string
          price_cents?: number
          product_id?: string
          slices?: number | null
          sort_order?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          allow_out_of_stock_sale: boolean | null
          category_id: string | null
          cest: string | null
          cfop: string | null
          code: string | null
          cost_cents: number
          created_at: string
          csosn: string | null
          cst: string | null
          description: string | null
          fiscal_notes: string | null
          fiscal_unit: string | null
          id: string
          image_url: string | null
          low_stock_alert: number | null
          name: string
          ncm: string | null
          origin: string | null
          price_cents: number
          restaurant_id: string
          sort_order: number
          stock_quantity: number | null
          tenant_id: string
          track_stock: boolean | null
          type: Database["public"]["Enums"]["product_type"] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          category_id?: string | null
          cest?: string | null
          cfop?: string | null
          code?: string | null
          cost_cents?: number
          created_at?: string
          csosn?: string | null
          cst?: string | null
          description?: string | null
          fiscal_notes?: string | null
          fiscal_unit?: string | null
          id?: string
          image_url?: string | null
          low_stock_alert?: number | null
          name: string
          ncm?: string | null
          origin?: string | null
          price_cents?: number
          restaurant_id: string
          sort_order?: number
          stock_quantity?: number | null
          tenant_id: string
          track_stock?: boolean | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_out_of_stock_sale?: boolean | null
          category_id?: string | null
          cest?: string | null
          cfop?: string | null
          code?: string | null
          cost_cents?: number
          created_at?: string
          csosn?: string | null
          cst?: string | null
          description?: string | null
          fiscal_notes?: string | null
          fiscal_unit?: string | null
          id?: string
          image_url?: string | null
          low_stock_alert?: number | null
          name?: string
          ncm?: string | null
          origin?: string | null
          price_cents?: number
          restaurant_id?: string
          sort_order?: number
          stock_quantity?: number | null
          tenant_id?: string
          track_stock?: boolean | null
          type?: Database["public"]["Enums"]["product_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_order_attempts: {
        Row: {
          blocked: boolean
          created_at: string
          id: string
          idempotency_key: string
          normalized_phone: string
          restaurant_id: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          id?: string
          idempotency_key: string
          normalized_phone: string
          restaurant_id: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          id?: string
          idempotency_key?: string
          normalized_phone?: string
          restaurant_id?: string
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accounting_reports_enabled: boolean
          created_at: string
          id: string
          inventory_enabled: boolean | null
          inventory_mode: string | null
          name: string
          pizza_module_enabled: boolean
          public_menu_enabled: boolean
          slug: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accounting_reports_enabled?: boolean
          created_at?: string
          id?: string
          inventory_enabled?: boolean | null
          inventory_mode?: string | null
          name: string
          pizza_module_enabled?: boolean
          public_menu_enabled?: boolean
          slug: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accounting_reports_enabled?: boolean
          created_at?: string
          id?: string
          inventory_enabled?: boolean | null
          inventory_mode?: string | null
          name?: string
          pizza_module_enabled?: boolean
          public_menu_enabled?: boolean
          slug?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_print_job:
        | { Args: { p_agent_id: string; p_job_id: string }; Returns: boolean }
        | {
            Args: { p_agent_id: string; p_job_id: string; p_secret_key: string }
            Returns: boolean
          }
      complete_print_job:
        | { Args: { p_agent_id: string; p_job_id: string }; Returns: boolean }
        | {
            Args: { p_agent_id: string; p_job_id: string; p_secret_key: string }
            Returns: boolean
          }
      create_internal_order: {
        Args: {
          _address?: string
          _customer_name: string
          _customer_phone: string
          _idempotency_key: string
          _items: Json
          _notes?: string
          _order_type: Database["public"]["Enums"]["order_type"]
          _payment_method: Database["public"]["Enums"]["payment_method"]
          _restaurant_id: string
        }
        Returns: Json
      }
      create_print_job_for_order: {
        Args: { p_order_id: string; p_reason?: string; p_source: string }
        Returns: string
      }
      create_public_order: {
        Args: {
          _address?: string
          _customer_name: string
          _customer_phone: string
          _idempotency_key: string
          _items: Json
          _notes?: string
          _order_type: Database["public"]["Enums"]["order_type"]
          _payment_method: Database["public"]["Enums"]["payment_method"]
          _restaurant_slug: string
        }
        Returns: Json
      }
      export_catalog: { Args: { _restaurant_id: string }; Returns: Json }
      fail_print_job:
        | {
            Args: { p_agent_id: string; p_error: string; p_job_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_agent_id: string
              p_error: string
              p_job_id: string
              p_secret_key: string
            }
            Returns: boolean
          }
      get_dashboard_stats: {
        Args: { _days_back: number; _restaurant_id: string }
        Returns: Json
      }
      get_pending_print_jobs: {
        Args: {
          p_after_timestamp?: string
          p_agent_id: string
          p_restaurant_id: string
          p_secret_key: string
        }
        Returns: {
          agent_id: string | null
          attempts: number
          claimed_at: string | null
          created_at: string | null
          id: string
          last_error: string | null
          order_id: string
          payload: Json
          payload_hash: string
          printed_at: string | null
          restaurant_id: string
          source: string
          status: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_categories: {
        Args: { _slug: string }
        Returns: {
          id: string
          name: string
          sort_order: number
        }[]
      }
      get_public_product_details: {
        Args: { _product_id: string }
        Returns: Json
      }
      get_public_products: {
        Args: { _slug: string }
        Returns: {
          allow_out_of_stock_sale: boolean
          category_id: string
          description: string
          has_options: boolean
          id: string
          image_url: string
          name: string
          price_cents: number
          sort_order: number
          stock_quantity: number
          track_stock: boolean
          type: Database["public"]["Enums"]["product_type"]
        }[]
      }
      get_public_restaurant: {
        Args: { _slug: string }
        Returns: {
          id: string
          inventory_enabled: boolean
          inventory_mode: string
          name: string
          pizza_module_enabled: boolean
          public_menu_enabled: boolean
          slug: string
          timezone: string
        }[]
      }
      has_any_role_in_restaurant: {
        Args: {
          _restaurant_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_any_role_in_tenant: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _restaurant_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_catalog: {
        Args: {
          _deactivate_missing?: boolean
          _payload: Json
          _restaurant_id: string
        }
        Returns: Json
      }
      is_member_of_restaurant: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_of_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      reprint_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: string
      }
      reset_stuck_print_jobs: {
        Args: { p_restaurant_id: string; p_stuck_minutes?: number }
        Returns: number
      }
      update_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
          _reason?: string
        }
        Returns: undefined
      }
      update_stock: {
        Args: {
          p_created_by?: string
          p_item_id: string
          p_item_type: string
          p_new_quantity: number
          p_order_id?: string
          p_reason: string
          p_restaurant_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "cashier"
        | "waiter"
        | "kitchen"
        | "support"
      order_print_status: "none" | "pending" | "printed" | "failed"
      order_status:
        | "new"
        | "accepted"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "completed"
        | "cancelled"
      order_type: "pickup" | "delivery"
      payment_method: "money" | "card" | "pix" | "online"
      pizza_price_rule: "max" | "average" | "sum"
      product_type: "simple" | "variable" | "pizza" | "combo"
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
      app_role: ["owner", "manager", "cashier", "waiter", "kitchen", "support"],
      order_print_status: ["none", "pending", "printed", "failed"],
      order_status: [
        "new",
        "accepted",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
      ],
      order_type: ["pickup", "delivery"],
      payment_method: ["money", "card", "pix", "online"],
      pizza_price_rule: ["max", "average", "sum"],
      product_type: ["simple", "variable", "pizza", "combo"],
    },
  },
} as const
