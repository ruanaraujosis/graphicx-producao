/**
 * Tipos do banco, no mesmo formato do gerador do Supabase.
 * Para regenerar a partir do banco: `npm run db:types`.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      marketplace_logs: {
        Row: {
          created_at: string
          direction: string
          duration_ms: number | null
          endpoint: string
          error: string | null
          id: number
          ok: boolean
          organization_id: string
          request_id: string | null
          shop_id: string | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          direction: string
          duration_ms?: number | null
          endpoint: string
          error?: string | null
          id?: never
          ok: boolean
          organization_id: string
          request_id?: string | null
          shop_id?: string | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          direction?: string
          duration_ms?: number | null
          endpoint?: string
          error?: string | null
          id?: never
          ok?: boolean
          organization_id?: string
          request_id?: string | null
          shop_id?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          finished_at: string | null
          id: number
          kind: string
          last_error: string | null
          organization_id: string
          payload: Json
          run_after: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          finished_at?: string | null
          id?: never
          kind: string
          last_error?: string | null
          organization_id: string
          payload?: Json
          run_after?: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          finished_at?: string | null
          id?: never
          kind?: string
          last_error?: string | null
          organization_id?: string
          payload?: Json
          run_after?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_jobs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          created_at: string
          external_item_id: string
          external_model_id: string
          external_sku: string | null
          external_price: number | null
          external_stock: number | null
          last_days_sent: number | null
          id: string
          last_price_sent: number | null
          last_stock_sent: number | null
          last_synced_at: string | null
          organization_id: string
          shop_id: string
          status: string
          sync_error: string | null
          title: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          external_item_id: string
          external_model_id?: string
          external_sku?: string | null
          external_price?: number | null
          external_stock?: number | null
          last_days_sent?: number | null
          id?: string
          last_price_sent?: number | null
          last_stock_sent?: number | null
          last_synced_at?: string | null
          organization_id: string
          shop_id: string
          status?: string
          sync_error?: string | null
          title?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          external_item_id?: string
          external_model_id?: string
          external_sku?: string | null
          external_price?: number | null
          external_stock?: number | null
          last_days_sent?: number | null
          id?: string
          last_price_sent?: number | null
          last_stock_sent?: number | null
          last_synced_at?: string | null
          organization_id?: string
          shop_id?: string
          status?: string
          sync_error?: string | null
          title?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_availability"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      label_templates: {
        Row: {
          background_path: string | null
          created_at: string
          created_by: string | null
          elements: Json
          height_mm: number
          id: string
          is_default: boolean
          kind: string
          name: string
          organization_id: string
          updated_at: string
          width_mm: number
        }
        Insert: {
          background_path?: string | null
          created_at?: string
          created_by?: string | null
          elements?: Json
          height_mm: number
          id?: string
          is_default?: boolean
          kind: string
          name: string
          organization_id: string
          updated_at?: string
          width_mm: number
        }
        Update: {
          background_path?: string | null
          created_at?: string
          created_by?: string | null
          elements?: Json
          height_mm?: number
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          organization_id?: string
          updated_at?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "label_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_boost_items: {
        Row: {
          active: boolean
          created_at: string
          external_item_id: string
          id: string
          last_boosted_at: string | null
          last_error: string | null
          organization_id: string
          position: number
          shop_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          external_item_id: string
          id?: string
          last_boosted_at?: string | null
          last_error?: string | null
          organization_id: string
          position?: number
          shop_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          external_item_id?: string
          id?: string
          last_boosted_at?: string | null
          last_error?: string | null
          organization_id?: string
          position?: number
          shop_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_boost_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_boost_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_categories: {
        Row: {
          category_id: number
          has_children: boolean
          marketplace: Database["public"]["Enums"]["marketplace"]
          name: string
          parent_id: number | null
          path: string
          updated_at: string
        }
        Insert: {
          category_id: number
          has_children?: boolean
          marketplace: Database["public"]["Enums"]["marketplace"]
          name: string
          parent_id?: number | null
          path: string
          updated_at?: string
        }
        Update: {
          category_id?: number
          has_children?: boolean
          marketplace?: Database["public"]["Enums"]["marketplace"]
          name?: string
          parent_id?: number | null
          path?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_publications: {
        Row: {
          attributes: Json
          category_id: number | null
          category_path: string | null
          created_at: string
          created_by: string | null
          description: string
          error: string | null
          external_item_id: string | null
          id: string
          item_status: string
          logistics: Json
          organization_id: string
          product_id: string
          published_at: string | null
          shop_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category_id?: number | null
          category_path?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          error?: string | null
          external_item_id?: string | null
          id?: string
          item_status?: string
          logistics?: Json
          organization_id: string
          product_id: string
          published_at?: string | null
          shop_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category_id?: number | null
          category_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          error?: string | null
          external_item_id?: string | null
          id?: string
          item_status?: string
          logistics?: Json
          organization_id?: string
          product_id?: string
          published_at?: string | null
          shop_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_publications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_publications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_publications_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reply_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          max_stars: number
          min_stars: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          max_stars: number
          min_stars: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          max_stars?: number
          min_stars?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reply_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          auto: boolean
          buyer_name: string | null
          comment: string | null
          commented_at: string | null
          created_at: string
          error: string | null
          external_comment_id: string
          external_item_id: string | null
          id: string
          item_title: string | null
          organization_id: string
          rating: number
          replied_at: string | null
          replied_by: string | null
          reply_text: string | null
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          auto?: boolean
          buyer_name?: string | null
          comment?: string | null
          commented_at?: string | null
          created_at?: string
          error?: string | null
          external_comment_id: string
          external_item_id?: string | null
          id?: string
          item_title?: string | null
          organization_id: string
          rating: number
          replied_at?: string | null
          replied_by?: string | null
          reply_text?: string | null
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          auto?: boolean
          buyer_name?: string | null
          comment?: string | null
          commented_at?: string | null
          created_at?: string
          error?: string | null
          external_comment_id?: string
          external_item_id?: string | null
          id?: string
          item_title?: string | null
          organization_id?: string
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          reply_text?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "marketplace_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_shops: {
        Row: {
          access_expires_at: string | null
          access_token_secret_id: string | null
          chat_message_enabled: boolean
          chat_template: string | null
          created_at: string
          created_by: string | null
          external_shop_id: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          marketplace: Database["public"]["Enums"]["marketplace"]
          name: string | null
          organization_id: string
          refresh_expires_at: string | null
          refresh_token_secret_id: string | null
          region: string | null
          status: string
          stock_ratio: number
          boost_enabled: boolean
          last_boost_at: string | null
          review_auto_reply: boolean
          review_signature: string | null
          reviews_synced_at: string | null
          orders_synced_until: string | null
          price_sync_enabled: boolean
          ship_mode: string
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_token_secret_id?: string | null
          chat_message_enabled?: boolean
          chat_template?: string | null
          created_at?: string
          created_by?: string | null
          external_shop_id: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          marketplace: Database["public"]["Enums"]["marketplace"]
          name?: string | null
          organization_id: string
          refresh_expires_at?: string | null
          refresh_token_secret_id?: string | null
          region?: string | null
          status?: string
          stock_ratio?: number
          boost_enabled?: boolean
          last_boost_at?: string | null
          review_auto_reply?: boolean
          review_signature?: string | null
          reviews_synced_at?: string | null
          orders_synced_until?: string | null
          price_sync_enabled?: boolean
          ship_mode?: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_token_secret_id?: string | null
          chat_message_enabled?: boolean
          chat_template?: string | null
          created_at?: string
          created_by?: string | null
          external_shop_id?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          marketplace?: Database["public"]["Enums"]["marketplace"]
          name?: string | null
          organization_id?: string
          refresh_expires_at?: string | null
          refresh_token_secret_id?: string | null
          region?: string | null
          status?: string
          stock_ratio?: number
          boost_enabled?: boolean
          last_boost_at?: string | null
          review_auto_reply?: boolean
          review_signature?: string | null
          reviews_synced_at?: string | null
          orders_synced_until?: string | null
          price_sync_enabled?: boolean
          ship_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_shops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_pairings: {
        Row: {
          code: string
          created_at: string
          device_id: string | null
          expires_at: string
          id: string
          linked_at: string | null
          organization_id: string | null
          secret_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          linked_at?: string | null
          organization_id?: string | null
          secret_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          linked_at?: string | null
          organization_id?: string | null
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_pairings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "tv_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_pairings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_devices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_seen_at: string | null
          cast_screen: string | null;
          cast_at: string | null;
          cast_by: string | null;
          name: string
          organization_id: string
          revoked_at: string | null
          show_financials: boolean
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          cast_screen?: string | null;
          cast_at?: string | null;
          cast_by?: string | null;
          name: string
          organization_id: string
          revoked_at?: string | null
          show_financials?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen_at?: string | null
          cast_screen?: string | null;
          cast_at?: string | null;
          cast_by?: string | null;
          name?: string
          organization_id?: string
          revoked_at?: string | null
          show_financials?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tv_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          monthly_goal: number | null
          organization_id: string
          tv_rotation_seconds: number
          updated_at: string
        }
        Insert: {
          monthly_goal?: number | null
          organization_id: string
          tv_rotation_seconds?: number
          updated_at?: string
        }
        Update: {
          monthly_goal?: number | null
          organization_id?: string
          tv_rotation_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          recurrence: string
          series_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          recurrence?: string
          series_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          recurrence?: string
          series_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          channel: Database["public"]["Enums"]["sales_channel"] | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          description: string
          due_date: string
          fee: number
          gross: number
          id: string
          net: number | null
          notes: string | null
          order_id: string | null
          organization_id: string
          payment_method_id: string | null
          received_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["sales_channel"] | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          description: string
          due_date: string
          fee?: number
          gross: number
          id?: string
          net?: number | null
          notes?: string | null
          order_id?: string | null
          organization_id: string
          payment_method_id?: string | null
          received_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["sales_channel"] | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          description?: string
          due_date?: string
          fee?: number
          gross?: number
          id?: string
          net?: number | null
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          payment_method_id?: string | null
          received_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          organization_id: string;
          last_number: number;
        };
        Insert: {
          organization_id: string;
          last_number?: number;
        };
        Update: {
          organization_id?: string;
          last_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_counters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          package_number: string | null;
          channel_fee: number | null;
          shipment_arranged_at: string | null;
          external_buyer_id: string | null;
          chat_sent_at: string | null;
          ship_by_at: string | null;
          external_status: string | null;
          shop_id: string | null;
          confirmed_at: string | null;
          id: string;
          organization_id: string;
          number: number;
          channel: Database["public"]["Enums"]["sales_channel"];
          status: Database["public"]["Enums"]["order_status"];
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          needs_art: boolean;
          due_date: string | null;
          payment_method_id: string | null;
          subtotal: number;
          discount: number;
          shipping: number;
          total: number;
          notes: string | null;
          tracking_code: string | null;
          external_id: string | null;
          cancel_reason: string | null;
          status_changed_at: string;
          approved_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          package_number?: string | null;
          channel_fee?: number | null;
          shipment_arranged_at?: string | null;
          external_buyer_id?: string | null;
          chat_sent_at?: string | null;
          ship_by_at?: string | null;
          external_status?: string | null;
          shop_id?: string | null;
          confirmed_at?: string | null;
          id?: string;
          organization_id: string;
          number?: number;
          channel?: Database["public"]["Enums"]["sales_channel"];
          status?: Database["public"]["Enums"]["order_status"];
          customer_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          needs_art?: boolean;
          due_date?: string | null;
          payment_method_id?: string | null;
          subtotal?: number;
          discount?: number;
          shipping?: number;
          total?: number;
          notes?: string | null;
          tracking_code?: string | null;
          external_id?: string | null;
          cancel_reason?: string | null;
          status_changed_at?: string;
          approved_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          package_number?: string | null;
          channel_fee?: number | null;
          shipment_arranged_at?: string | null;
          external_buyer_id?: string | null;
          chat_sent_at?: string | null;
          ship_by_at?: string | null;
          external_status?: string | null;
          shop_id?: string | null;
          confirmed_at?: string | null;
          id?: string;
          organization_id?: string;
          number?: number;
          channel?: Database["public"]["Enums"]["sales_channel"];
          status?: Database["public"]["Enums"]["order_status"];
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          needs_art?: boolean;
          due_date?: string | null;
          payment_method_id?: string | null;
          subtotal?: number;
          discount?: number;
          shipping?: number;
          total?: number;
          notes?: string | null;
          tracking_code?: string | null;
          external_id?: string | null;
          cancel_reason?: string | null;
          status_changed_at?: string;
          approved_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "marketplace_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          variant_id: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          stock_state: Database["public"]["Enums"]["order_item_stock"];
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          variant_id?: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          stock_state?: Database["public"]["Enums"]["order_item_stock"];
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          order_id?: string;
          variant_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price?: number;
          stock_state?: Database["public"]["Enums"]["order_item_stock"];
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          id: number;
          organization_id: string;
          order_id: string;
          type: Database["public"]["Enums"]["order_event_type"];
          from_status: Database["public"]["Enums"]["order_status"] | null;
          to_status: Database["public"]["Enums"]["order_status"] | null;
          message: string | null;
          actor_id: string | null;
          actor_label: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          organization_id: string;
          order_id: string;
          type: Database["public"]["Enums"]["order_event_type"];
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          to_status?: Database["public"]["Enums"]["order_status"] | null;
          message?: string | null;
          actor_id?: string | null;
          actor_label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          organization_id?: string;
          order_id?: string;
          type?: Database["public"]["Enums"]["order_event_type"];
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          to_status?: Database["public"]["Enums"]["order_status"] | null;
          message?: string | null;
          actor_id?: string | null;
          actor_label?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      art_links: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          token: string;
          expires_at: string;
          revoked_at: string | null;
          last_access_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          token?: string;
          expires_at?: string;
          revoked_at?: string | null;
          last_access_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          order_id?: string;
          token?: string;
          expires_at?: string;
          revoked_at?: string | null;
          last_access_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "art_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "art_links_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      art_files: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          path: string;
          file_name: string;
          size_bytes: number | null;
          mime_type: string | null;
          note: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          path: string;
          file_name: string;
          size_bytes?: number | null;
          mime_type?: string | null;
          note?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          order_id?: string;
          path?: string;
          file_name?: string;
          size_bytes?: number | null;
          mime_type?: string | null;
          note?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "art_files_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "art_files_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      art_versions: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          version: number;
          proof_path: string;
          proof_mime: string;
          final_path: string | null;
          final_name: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["art_version_status"];
          uploaded_by: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          version?: number;
          proof_path: string;
          proof_mime: string;
          final_path?: string | null;
          final_name?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["art_version_status"];
          uploaded_by?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          order_id?: string;
          version?: number;
          proof_path?: string;
          proof_mime?: string;
          final_path?: string | null;
          final_name?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["art_version_status"];
          uploaded_by?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "art_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "art_versions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      art_reviews: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          version_id: string;
          decision: string;
          comment: string | null;
          pins: Json;
          reviewer_name: string | null;
          ip: unknown | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          order_id: string;
          version_id: string;
          decision: string;
          comment?: string | null;
          pins?: Json;
          reviewer_name?: string | null;
          ip?: unknown | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          order_id?: string;
          version_id?: string;
          decision?: string;
          comment?: string | null;
          pins?: Json;
          reviewer_name?: string | null;
          ip?: unknown | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "art_reviews_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "art_reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "art_reviews_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "art_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          person_type: Database["public"]["Enums"]["person_type"];
          name: string;
          legal_name: string | null;
          document: string | null;
          email: string | null;
          phone: string | null;
          whatsapp: string | null;
          origin: Database["public"]["Enums"]["sales_channel"];
          cep: string | null;
          street: string | null;
          number: string | null;
          complement: string | null;
          district: string | null;
          city: string | null;
          state: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          person_type?: Database["public"]["Enums"]["person_type"];
          name: string;
          legal_name?: string | null;
          document?: string | null;
          email?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          origin?: Database["public"]["Enums"]["sales_channel"];
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          person_type?: Database["public"]["Enums"]["person_type"];
          name?: string;
          legal_name?: string | null;
          document?: string | null;
          email?: string | null;
          phone?: string | null;
          whatsapp?: string | null;
          origin?: Database["public"]["Enums"]["sales_channel"];
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          legal_name: string | null;
          document: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          cep: string | null;
          street: string | null;
          number: string | null;
          complement: string | null;
          district: string | null;
          city: string | null;
          state: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          legal_name?: string | null;
          document?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          legal_name?: string | null;
          document?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_backups: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          organization_id: string | null
          organization_name: string
          row_counts: Json
          size_bytes: number | null
          status: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          organization_id?: string | null
          organization_name: string
          row_counts?: Json
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          organization_name?: string
          row_counts?: Json
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_backups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          fulfillment: Database["public"]["Enums"]["fulfillment_mode"];
          production_days: number;
          ncm: string | null;
          cest: string | null;
          cfop: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          fulfillment?: Database["public"]["Enums"]["fulfillment_mode"];
          production_days?: number;
          ncm?: string | null;
          cest?: string | null;
          cfop?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          category_id?: string | null;
          name?: string;
          description?: string | null;
          fulfillment?: Database["public"]["Enums"]["fulfillment_mode"];
          production_days?: number;
          ncm?: string | null;
          cest?: string | null;
          cfop?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          sku: string;
          name: string;
          attributes: Json;
          base_price: number;
          weight_g: number | null;
          length_cm: number | null;
          width_cm: number | null;
          height_cm: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          sku: string;
          name: string;
          attributes?: Json;
          base_price?: number;
          weight_g?: number | null;
          length_cm?: number | null;
          width_cm?: number | null;
          height_cm?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_id?: string;
          sku?: string;
          name?: string;
          attributes?: Json;
          base_price?: number;
          weight_g?: number | null;
          length_cm?: number | null;
          width_cm?: number | null;
          height_cm?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          storage_path: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          storage_path: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_id?: string;
          storage_path?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_price_rules: {
        Row: {
          organization_id: string;
          channel: Database["public"]["Enums"]["sales_channel"];
          adjustment_pct: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          channel: Database["public"]["Enums"]["sales_channel"];
          adjustment_pct?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          channel?: Database["public"]["Enums"]["sales_channel"];
          adjustment_pct?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channel_price_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      variant_channel_prices: {
        Row: {
          organization_id: string;
          variant_id: string;
          channel: Database["public"]["Enums"]["sales_channel"];
          price: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          variant_id: string;
          channel: Database["public"]["Enums"]["sales_channel"];
          price: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          variant_id?: string;
          channel?: Database["public"]["Enums"]["sales_channel"];
          price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "variant_channel_prices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "variant_channel_prices_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      materials: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sku: string | null;
          unit: string;
          avg_cost: number;
          min_stock: number;
          supplier_id: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          sku?: string | null;
          unit: string;
          avg_cost?: number;
          min_stock?: number;
          supplier_id?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          sku?: string | null;
          unit?: string;
          avg_cost?: number;
          min_stock?: number;
          supplier_id?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "materials_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      bom_items: {
        Row: {
          organization_id: string;
          variant_id: string;
          material_id: string;
          quantity: number;
          waste_pct: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          variant_id: string;
          material_id: string;
          quantity: number;
          waste_pct?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          variant_id?: string;
          material_id?: string;
          quantity?: number;
          waste_pct?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bom_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bom_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bom_items_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          fee_pct: number;
          settlement_days: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          kind: string;
          fee_pct?: number;
          settlement_days?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          kind?: string;
          fee_pct?: number;
          settlement_days?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_balances: {
        Row: {
          id: string;
          organization_id: string;
          material_id: string | null;
          variant_id: string | null;
          on_hand: number;
          reserved: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          material_id?: string | null;
          variant_id?: string | null;
          on_hand?: number;
          reserved?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          material_id?: string | null;
          variant_id?: string | null;
          on_hand?: number;
          reserved?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_balances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_balances_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_balances_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          cost_at: number | null;
          id: number;
          organization_id: string;
          material_id: string | null;
          variant_id: string | null;
          type: Database["public"]["Enums"]["stock_movement_type"];
          quantity: number;
          unit_cost: number | null;
          reason: string | null;
          reference: string | null;
          created_by: string | null;
          created_at: string;
          order_item_id: string | null;
        };
        Insert: {
          cost_at?: number | null;
          id?: never;
          organization_id: string;
          material_id?: string | null;
          variant_id?: string | null;
          type: Database["public"]["Enums"]["stock_movement_type"];
          quantity: number;
          unit_cost?: number | null;
          reason?: string | null;
          reference?: string | null;
          created_by?: string | null;
          created_at?: string;
          order_item_id?: string | null;
        };
        Update: {
          cost_at?: number | null;
          id?: never;
          organization_id?: string;
          material_id?: string | null;
          variant_id?: string | null;
          type?: Database["public"]["Enums"]["stock_movement_type"];
          quantity?: number;
          unit_cost?: number | null;
          reason?: string | null;
          reference?: string | null;
          created_by?: string | null;
          created_at?: string;
          order_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          legal_name: string | null;
          document: string | null;
          phone: string | null;
          cep: string | null;
          street: string | null;
          number: string | null;
          complement: string | null;
          district: string | null;
          city: string | null;
          state: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          legal_name?: string | null;
          document?: string | null;
          phone?: string | null;
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          legal_name?: string | null;
          document?: string | null;
          phone?: string | null;
          cep?: string | null;
          street?: string | null;
          number?: string | null;
          complement?: string | null;
          district?: string | null;
          city?: string | null;
          state?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          email: string | null;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          email?: string | null;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          full_name?: string;
          email?: string | null;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role_id: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role_id: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role_id?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "organization_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_roles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          permissions: string[];
          is_admin: boolean;
          require_mfa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          permissions?: string[];
          is_admin?: boolean;
          require_mfa?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          permissions?: string[];
          is_admin?: boolean;
          require_mfa?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: number;
          organization_id: string | null;
          table_name: string;
          record_id: string | null;
          action: string;
          old_data: Json | null;
          new_data: Json | null;
          changed_fields: string[] | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          organization_id?: string | null;
          table_name: string;
          record_id?: string | null;
          action: string;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_fields?: string[] | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          organization_id?: string | null;
          table_name?: string;
          record_id?: string | null;
          action?: string;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_fields?: string[] | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      material_stock: {
        Row: {
          material_id: string;
          organization_id: string;
          name: string;
          unit: string;
          avg_cost: number;
          min_stock: number;
          supplier_id: string | null;
          active: boolean;
          on_hand: number;
          reserved: number;
          available: number;
          below_min: boolean;
          suggested_purchase: number;
          stock_value: number;
        };
        Relationships: [];
      };
      variant_availability: {
        Row: {
          variant_id: string;
          organization_id: string;
          product_id: string;
          sku: string;
          fulfillment: Database["public"]["Enums"]["fulfillment_mode"];
          ready_units: number;
          producible_units: number | null;
          bom_items: number;
          available_units: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      marketplace_save_tokens: {
        Args: { p_shop: string; p_access: string; p_refresh: string; p_access_expires: string; p_refresh_expires: string }
        Returns: undefined
      }
      marketplace_get_tokens: {
        Args: { p_shop: string }
        Returns: { access_token: string | null; refresh_token: string | null; access_expires_at: string | null; refresh_expires_at: string | null }[]
      }
      marketplace_forget_tokens: {
        Args: { p_shop: string }
        Returns: undefined
      }
      marketplace_enqueue: {
        Args: { p_shop: string; p_kind: string; p_payload?: Json; p_dedupe?: string | null; p_run_after?: string }
        Returns: number | null
      }
      marketplace_claim_jobs: {
        Args: { p_limit?: number }
        Returns: Database["public"]["Tables"]["marketplace_jobs"]["Row"][]
      }
      marketplace_upsert_order: {
        Args: { p_shop: string; p_order: Json }
        Returns: string | null
      }
      marketplace_upsert_listings: {
        Args: { p_shop: string; p_items: Json; p_complete?: boolean }
        Returns: number
      }
      marketplace_listing_targets: {
        Args: { p_shop: string }
        Returns: {
          listing_id: string
          external_item_id: string
          external_model_id: string
          stock: number | null
          price: number
          production_days: number
          last_stock_sent: number | null
          last_price_sent: number | null
          last_days_sent: number | null
          skip_reason: string | null
        }[]
      }
      marketplace_publication_payload: {
        Args: { p_publication: string }
        Returns: Json
      }
      backup_tables: { Args: never; Returns: string[] };
      marketing_shop_settings: {
        Args: {
          p_shop: string
          p_boost_enabled: boolean
          p_review_auto_reply: boolean
          p_review_signature: string | null
        }
        Returns: undefined
      }
      marketplace_finish_job: {
        Args: { p_job: number; p_ok: boolean; p_error?: string | null }
        Returns: undefined
      }
      tv_cast: {
        Args: { p_device: string; p_screen: string | null };
        Returns: undefined;
      };
      tv_cast_targets: {
        Args: { p_org: string };
        Returns: {
          id: string;
          name: string;
          last_seen_at: string | null;
          cast_screen: string | null;
          revoked: boolean;
        }[];
      };
      tv_command: { Args: { p_token: string }; Returns: Json };
      tv_snapshot: {
        Args: { p_token: string }
        Returns: Json
      }
      finance_product_margin: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          fees: number
          margin: number
          material_cost: number
          product_name: string
          quantity: number
          revenue: number
          sku: string
          variant_id: string
          variant_name: string
        }[]
      }
      finance_cash_flow: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          day: string
          paid: number
          received: number
          to_pay: number
          to_receive: number
        }[]
      }
      finance_dre: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          expenses: number
          fees: number
          gross_revenue: number
          material_cost: number
          month: string
          result: number
        }[]
      }
      change_order_status: {
        Args: { p_order: string; p_status: Database["public"]["Enums"]["order_status"]; p_note?: string | null };
        Returns: undefined;
      };
      create_order: {
        Args: { p_org: string; p_status: Database["public"]["Enums"]["order_status"]; p_fields: Json; p_items: Json };
        Returns: string;
      };
      update_order: {
        Args: { p_order: string; p_fields: Json; p_items: Json };
        Returns: undefined;
      };
      save_order_items: {
        Args: { p_order: string; p_items: Json };
        Returns: undefined;
      };
      quick_sale: {
        Args: { p_org: string; p_fields: Json; p_items: Json; p_paid?: boolean };
        Returns: string;
      };
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      resolve_art_link: {
        Args: { p_token: string };
        Returns: { link_id: string; organization_id: string; order_id: string }[];
      };
      register_client_art_file: {
        Args: {
          p_token: string;
          p_path: string;
          p_file_name: string;
          p_size: number;
          p_mime: string;
          p_note: string | null;
        };
        Returns: string;
      };
      submit_art_review: {
        Args: {
          p_token: string;
          p_version_id: string;
          p_decision: string;
          p_comment: string | null;
          p_pins: Json;
          p_reviewer_name: string | null;
          p_ip: unknown;
          p_user_agent: string | null;
        };
        Returns: undefined;
      };
      variant_price: {
        Args: { p_variant: string; p_channel: Database["public"]["Enums"]["sales_channel"] };
        Returns: number;
      };
      consume_bom: {
        Args: { p_variant: string; p_quantity: number; p_reference?: string | null };
        Returns: number;
      };
    };
    Enums: {
      marketplace: "shopee";
      order_status:
        | "orcamento"
        | "novo"
        | "aguardando_arte"
        | "arte_em_criacao"
        | "aguardando_aprovacao"
        | "aprovado"
        | "em_impressao"
        | "acabamento"
        | "expedicao"
        | "enviado"
        | "entregue"
        | "cancelado";
      order_item_stock: "livre" | "reservado" | "baixado";
      art_version_status: "pendente" | "aprovada" | "alteracao" | "substituida";
      order_event_type:
        | "criado"
        | "status"
        | "comentario"
        | "link_arte"
        | "arquivo_cliente"
        | "prova"
        | "arte_aprovada"
        | "alteracao_pedida"
        | "arte_final";
      sales_channel: "balcao" | "shopee" | "whatsapp";
      person_type: "pf" | "pj";
      fulfillment_mode: "sob_encomenda" | "pronta_entrega";
      stock_movement_type: "entrada" | "saida" | "ajuste" | "perda" | "consumo" | "reserva" | "liberacao";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
