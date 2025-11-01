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
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          id?: string
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
          id: string
          notes: string | null
          order_number: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          status?: string
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
      products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          lead_time_days: number | null
          name: string
          sku: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_time_days?: number | null
          name: string
          sku: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          lead_time_days?: number | null
          name?: string
          sku?: string
        }
        Relationships: []
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
          notified: boolean | null
          stage: string
          started_by: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string | null
          eta: string
          id?: string
          notified?: boolean | null
          stage: string
          started_by?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string | null
          eta?: string
          id?: string
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
          created_at: string | null
          id: string
          metadata: Json | null
          order_id: string
          order_item_id: string
          product_id: string
          qr_code_data: string | null
          serial_no: string | null
          state: Database["public"]["Enums"]["unit_state"]
          updated_at: string | null
          version: number | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id: string
          order_item_id: string
          product_id: string
          qr_code_data?: string | null
          serial_no?: string | null
          state?: Database["public"]["Enums"]["unit_state"]
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string
          order_item_id?: string
          product_id?: string
          qr_code_data?: string | null
          serial_no?: string | null
          state?: Database["public"]["Enums"]["unit_state"]
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
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
      ],
    },
  },
} as const
