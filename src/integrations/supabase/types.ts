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
      batches: {
        Row: {
          batch_code: string
          batch_type: string
          box_id: string | null
          created_at: string
          created_by: string | null
          current_state: string
          eta: string | null
          flagged_at: string | null
          flagged_by: string | null
          flagged_reason: string | null
          id: string
          inventory_state: string | null
          is_flagged: boolean | null
          is_redo: boolean | null
          is_terminated: boolean | null
          lead_time_days: number | null
          order_id: string | null
          origin_state: string | null
          parent_batch_id: string | null
          parent_batch_id_split: string | null
          product_id: string
          qr_code_data: string | null
          quantity: number
          redo_by: string | null
          redo_reason: string | null
          terminated_by: string | null
          terminated_reason: string | null
          updated_at: string
        }
        Insert: {
          batch_code: string
          batch_type?: string
          box_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          eta?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          id?: string
          inventory_state?: string | null
          is_flagged?: boolean | null
          is_redo?: boolean | null
          is_terminated?: boolean | null
          lead_time_days?: number | null
          order_id?: string | null
          origin_state?: string | null
          parent_batch_id?: string | null
          parent_batch_id_split?: string | null
          product_id: string
          qr_code_data?: string | null
          quantity?: number
          redo_by?: string | null
          redo_reason?: string | null
          terminated_by?: string | null
          terminated_reason?: string | null
          updated_at?: string
        }
        Update: {
          batch_code?: string
          batch_type?: string
          box_id?: string | null
          created_at?: string
          created_by?: string | null
          current_state?: string
          eta?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          id?: string
          inventory_state?: string | null
          is_flagged?: boolean | null
          is_redo?: boolean | null
          is_terminated?: boolean | null
          lead_time_days?: number | null
          order_id?: string | null
          origin_state?: string | null
          parent_batch_id?: string | null
          parent_batch_id_split?: string | null
          product_id?: string
          qr_code_data?: string | null
          quantity?: number
          redo_by?: string | null
          redo_reason?: string | null
          terminated_by?: string | null
          terminated_reason?: string | null
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
            foreignKeyName: "batches_parent_batch_id_fkey"
            columns: ["parent_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_parent_batch_id_split_fkey"
            columns: ["parent_batch_id_split"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
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
      extra_products: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extra_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_production: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          machine_id: string
          recorded_by: string | null
          state_transition: string
          unit_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          machine_id: string
          recorded_by?: string | null
          state_transition: string
          unit_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          machine_id?: string
          recorded_by?: string | null
          state_transition?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_production_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_production_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_production_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
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
      order_items: {
        Row: {
          created_at: string | null
          id: string
          needs_boxing: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          needs_boxing?: boolean
          order_id: string
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
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
          redo_counter: number | null
          shipping_type: string | null
          status: string
          termination_counter: number | null
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
          redo_counter?: number | null
          shipping_type?: string | null
          status?: string
          termination_counter?: number | null
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
          redo_counter?: number | null
          shipping_type?: string | null
          status?: string
          termination_counter?: number | null
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
      parent_products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          needs_packing: boolean | null
          parent_sku: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          needs_packing?: boolean | null
          parent_sku: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          needs_packing?: boolean | null
          parent_sku?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_bom: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          raw_material_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity: number
          raw_material_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          raw_material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      product_colors: {
        Row: {
          color_name: string
          created_at: string | null
          id: string
          parent_product_id: string
        }
        Insert: {
          color_name: string
          created_at?: string | null
          id?: string
          parent_product_id: string
        }
        Update: {
          color_name?: string
          created_at?: string | null
          id?: string
          parent_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_colors_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "parent_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_potential_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          parent_product_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          parent_product_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          parent_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_potential_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_potential_customers_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "parent_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          created_at: string | null
          id: string
          parent_product_id: string
          size_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          parent_product_id: string
          size_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          parent_product_id?: string
          size_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "parent_products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          color_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          needs_packing: boolean | null
          parent_product_id: string | null
          size_id: string | null
          sku: string
        }
        Insert: {
          color_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          needs_packing?: boolean | null
          parent_product_id?: string | null
          size_id?: string | null
          sku: string
        }
        Update: {
          color_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          needs_packing?: boolean | null
          parent_product_id?: string | null
          size_id?: string | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "product_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "parent_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
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
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_material_receipts: {
        Row: {
          details: Json | null
          id: string
          order_id: string | null
          received_at: string | null
        }
        Insert: {
          details?: Json | null
          id?: string
          order_id?: string | null
          received_at?: string | null
        }
        Update: {
          details?: Json | null
          id?: string
          order_id?: string | null
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          version_number: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          version_number?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
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
      raw_materials: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
          unit: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
          unit?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
          unit?: string | null
        }
        Relationships: []
      }
      shipment_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          quantity: number
          shipment_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          quantity: number
          shipment_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          quantity?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string
          sealed_at: string | null
          sealed_by: string | null
          shipment_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          sealed_at?: string | null
          sealed_by?: string | null
          shipment_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          sealed_at?: string | null
          sealed_by?: string | null
          shipment_code?: string
          status?: string
          updated_at?: string
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
      unit_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          eta: string | null
          id: string
          new_state: string
          prev_state: string | null
          reason: string | null
          unit_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          eta?: string | null
          id?: string
          new_state: string
          prev_state?: string | null
          reason?: string | null
          unit_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          eta?: string | null
          id?: string
          new_state?: string
          prev_state?: string | null
          reason?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_stage_eta: {
        Row: {
          created_at: string | null
          eta: string
          id: string
          lead_time_days: number | null
          notified: boolean | null
          stage: string
          started_by: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string | null
          eta: string
          id?: string
          lead_time_days?: number | null
          notified?: boolean | null
          stage: string
          started_by?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string | null
          eta?: string
          id?: string
          lead_time_days?: number | null
          notified?: boolean | null
          stage?: string
          started_by?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_stage_eta_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          assigned_to: string | null
          batch_id: string | null
          created_at: string | null
          damage_action: string | null
          damage_reason: string | null
          damaged_at: string | null
          damaged_by: string | null
          id: string
          is_damaged: boolean | null
          metadata: Json | null
          order_id: string
          order_item_id: string
          original_state: string | null
          product_id: string
          qr_code_data: string | null
          serial_no: string | null
          state: Database["public"]["Enums"]["unit_state"]
          updated_at: string | null
          version: number | null
        }
        Insert: {
          assigned_to?: string | null
          batch_id?: string | null
          created_at?: string | null
          damage_action?: string | null
          damage_reason?: string | null
          damaged_at?: string | null
          damaged_by?: string | null
          id?: string
          is_damaged?: boolean | null
          metadata?: Json | null
          order_id: string
          order_item_id: string
          original_state?: string | null
          product_id: string
          qr_code_data?: string | null
          serial_no?: string | null
          state?: Database["public"]["Enums"]["unit_state"]
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          assigned_to?: string | null
          batch_id?: string | null
          created_at?: string | null
          damage_action?: string | null
          damage_reason?: string | null
          damaged_at?: string | null
          damaged_by?: string | null
          id?: string
          is_damaged?: boolean | null
          metadata?: Json | null
          order_id?: string
          order_item_id?: string
          original_state?: string | null
          product_id?: string
          qr_code_data?: string | null
          serial_no?: string | null
          state?: Database["public"]["Enums"]["unit_state"]
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "units_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      check_late_units: { Args: never; Returns: undefined }
      generate_batch_code: { Args: never; Returns: string }
      generate_box_code: { Args: never; Returns: string }
      generate_parent_sku: { Args: never; Returns: string }
      generate_shipment_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "manufacture_lead"
        | "manufacturer"
        | "packaging_manager"
        | "packer"
        | "boxing_manager"
        | "boxer"
        | "qc"
        | "admin"
        | "viewer"
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
        "manufacture_lead",
        "manufacturer",
        "packaging_manager",
        "packer",
        "boxing_manager",
        "boxer",
        "qc",
        "admin",
        "viewer",
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
