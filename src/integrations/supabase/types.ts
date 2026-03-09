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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      boxes: {
        Row: {
          box_code: string
          content_type: string | null
          created_at: string
          id: string
          is_active: boolean
          items_list: Json | null
        }
        Insert: {
          box_code: string
          content_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          items_list?: Json | null
        }
        Update: {
          box_code?: string
          content_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          items_list?: Json | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          code: string | null
          country: string | null
          created_at: string
          id: string
          is_domestic: boolean | null
          name: string
        }
        Insert: {
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_domestic?: boolean | null
          name: string
        }
        Update: {
          code?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_domestic?: boolean | null
          name?: string
        }
        Relationships: []
      }
      extra_batch_history: {
        Row: {
          consuming_order_id: string | null
          consuming_order_item_id: string | null
          created_at: string
          event_type: string
          extra_batch_id: string | null
          from_state: string | null
          id: string
          notes: string | null
          performed_by: string | null
          product_id: string | null
          quantity: number
          source_order_id: string | null
          source_order_item_id: string | null
        }
        Insert: {
          consuming_order_id?: string | null
          consuming_order_item_id?: string | null
          created_at?: string
          event_type: string
          extra_batch_id?: string | null
          from_state?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id?: string | null
          quantity: number
          source_order_id?: string | null
          source_order_item_id?: string | null
        }
        Update: {
          consuming_order_id?: string | null
          consuming_order_item_id?: string | null
          created_at?: string
          event_type?: string
          extra_batch_id?: string | null
          from_state?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          product_id?: string | null
          quantity?: number
          source_order_id?: string | null
          source_order_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extra_batch_history_consuming_order_id_fkey"
            columns: ["consuming_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batch_history_consuming_order_item_id_fkey"
            columns: ["consuming_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batch_history_extra_batch_id_fkey"
            columns: ["extra_batch_id"]
            isOneToOne: false
            referencedRelation: "extra_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batch_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batch_history_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batch_history_source_order_item_id_fkey"
            columns: ["source_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_batches: {
        Row: {
          box_id: string
          boxing_machine_id: string | null
          created_at: string
          created_by: string | null
          current_state: string
          finishing_machine_id: string | null
          id: string
          inventory_state: string
          manufacturing_machine_id: string | null
          order_id: string | null
          order_item_id: string | null
          packaging_machine_id: string | null
          product_id: string
          qr_code_data: string | null
          quantity: number
          updated_at: string
        }
        Insert: {
          box_id: string
          boxing_machine_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          finishing_machine_id?: string | null
          id?: string
          inventory_state?: string
          manufacturing_machine_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          packaging_machine_id?: string | null
          product_id: string
          qr_code_data?: string | null
          quantity?: number
          updated_at?: string
        }
        Update: {
          box_id?: string
          boxing_machine_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          finishing_machine_id?: string | null
          id?: string
          inventory_state?: string
          manufacturing_machine_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          packaging_machine_id?: string | null
          product_id?: string
          qr_code_data?: string | null
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_batches_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "extra_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_boxing_machine_id_fkey"
            columns: ["boxing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_finishing_machine_id_fkey"
            columns: ["finishing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_manufacturing_machine_id_fkey"
            columns: ["manufacturing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_packaging_machine_id_fkey"
            columns: ["packaging_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_boxes: {
        Row: {
          box_code: string
          content_type: string | null
          created_at: string
          id: string
          is_active: boolean
          items_list: Json | null
        }
        Insert: {
          box_code: string
          content_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          items_list?: Json | null
        }
        Update: {
          box_code?: string
          content_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          items_list?: Json | null
        }
        Relationships: []
      }
      machines: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          order_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          target_user: string | null
          type: string
          unit_ids: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          order_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_user?: string | null
          type: string
          unit_ids?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          order_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_user?: string | null
          type?: string
          unit_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_batches: {
        Row: {
          box_id: string | null
          boxing_machine_id: string | null
          created_at: string
          created_by: string | null
          current_state: string
          eta: string | null
          finishing_machine_id: string | null
          from_extra_state: string | null
          id: string
          lead_time_days: number | null
          manufacturing_machine_id: string | null
          order_id: string
          order_item_id: string | null
          packaging_machine_id: string | null
          product_id: string
          qr_code_data: string | null
          quantity: number
          shipment_id: string | null
          updated_at: string
        }
        Insert: {
          box_id?: string | null
          boxing_machine_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          eta?: string | null
          finishing_machine_id?: string | null
          from_extra_state?: string | null
          id?: string
          lead_time_days?: number | null
          manufacturing_machine_id?: string | null
          order_id: string
          order_item_id?: string | null
          packaging_machine_id?: string | null
          product_id: string
          qr_code_data?: string | null
          quantity?: number
          shipment_id?: string | null
          updated_at?: string
        }
        Update: {
          box_id?: string | null
          boxing_machine_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          eta?: string | null
          finishing_machine_id?: string | null
          from_extra_state?: string | null
          id?: string
          lead_time_days?: number | null
          manufacturing_machine_id?: string | null
          order_id?: string
          order_item_id?: string | null
          packaging_machine_id?: string | null
          product_id?: string
          qr_code_data?: string | null
          quantity?: number
          shipment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batches_boxing_machine_id_fkey"
            columns: ["boxing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batches_finishing_machine_id_fkey"
            columns: ["finishing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batches_manufacturing_machine_id_fkey"
            columns: ["manufacturing_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batches_packaging_machine_id_fkey"
            columns: ["packaging_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_batches_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_comments: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          order_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          order_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_comments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          deducted_to_extra: number
          id: string
          needs_boxing: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          deducted_to_extra?: number
          id?: string
          needs_boxing?: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          deducted_to_extra?: number
          id?: string
          needs_boxing?: boolean
          order_id?: string
          product_id?: string
          quantity?: number
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
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          estimated_fulfillment_time: string | null
          id: string
          notes: string | null
          order_number: string
          priority: string | null
          shipping_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_fulfillment_time?: string | null
          id?: string
          notes?: string | null
          order_number: string
          priority?: string | null
          shipping_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_fulfillment_time?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          priority?: string | null
          shipping_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_main: boolean | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_main?: boolean | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_main?: boolean | null
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          color: string | null
          country: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          needs_packing: boolean | null
          size: string | null
          sku: string
        }
        Insert: {
          brand_id?: string | null
          color?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          needs_packing?: boolean | null
          size?: string | null
          sku: string
        }
        Update: {
          brand_id?: string | null
          color?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          needs_packing?: boolean | null
          size?: string | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          primary_role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_material_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          images: Json | null
          order_id: string
          version_number: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          images?: Json | null
          order_id: string
          version_number?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          images?: Json | null
          order_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_versions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          created_at: string
          created_by: string | null
          height_cm: number | null
          id: string
          length_cm: number | null
          notes: string | null
          order_id: string
          sealed_at: string | null
          sealed_by: string | null
          shipment_code: string
          status: string
          updated_at: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          order_id: string
          sealed_at?: string | null
          sealed_by?: string | null
          shipment_code: string
          status?: string
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          order_id?: string
          sealed_at?: string | null
          sealed_by?: string | null
          shipment_code?: string
          status?: string
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
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
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_machine_to_batches: {
        Args: {
          p_batch_ids: string[]
          p_machine_column: string
          p_machine_id: string
          p_requested_qty: number
        }
        Returns: Json
      }
      generate_batch_code: { Args: never; Returns: string }
      generate_box_code: { Args: never; Returns: string }
      generate_extra_batch_code: { Args: never; Returns: string }
      generate_extra_box_code: { Args: never; Returns: string }
      generate_shipment_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_order_batches_to_extra: {
        Args: {
          p_phase: string
          p_selections: Json
          p_target_box_id: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manufacturing_manager"
        | "finishing_manager"
        | "packaging_manager"
        | "boxing_manager"
      batch_type: "ORDER" | "EXTRA"
      inventory_state: "AVAILABLE" | "RESERVED" | "CONSUMED"
      unit_state:
        | "waiting_for_rm"
        | "in_manufacturing"
        | "manufactured"
        | "waiting_for_pm"
        | "in_packaging"
        | "packaged"
        | "waiting_for_bm"
        | "in_boxing"
        | "boxed"
        | "qced"
        | "finished"
        | "waiting_for_packaging_material"
        | "waiting_for_boxing_material"
        | "waiting_for_receiving"
        | "received"
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
      app_role: [
        "admin",
        "manufacturing_manager",
        "finishing_manager",
        "packaging_manager",
        "boxing_manager",
      ],
      batch_type: ["ORDER", "EXTRA"],
      inventory_state: ["AVAILABLE", "RESERVED", "CONSUMED"],
      unit_state: [
        "waiting_for_rm",
        "in_manufacturing",
        "manufactured",
        "waiting_for_pm",
        "in_packaging",
        "packaged",
        "waiting_for_bm",
        "in_boxing",
        "boxed",
        "qced",
        "finished",
        "waiting_for_packaging_material",
        "waiting_for_boxing_material",
        "waiting_for_receiving",
        "received",
      ],
    },
  },
} as const
