export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      checkpoints: {
        Row: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manual_code: string
          name: string
          qr_version?: number
          radius_m?: number
          route_order: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manual_code?: string
          name?: string
          qr_version?: number
          radius_m?: number
          route_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          note: string
          photos: string[]
          scan_id: string
        }
        Insert: {
          created_at: string
          id: string
          note?: string
          photos?: string[]
          scan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          photos?: string[]
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scan_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          accuracy_m: number | null
          checkpoint_id: string
          distance_m: number | null
          guard_id: string
          id: string
          latitude: number | null
          location_status: string
          longitude: number | null
          received_at: string
          scanned_at: string
        }
        Insert: {
          accuracy_m?: number | null
          checkpoint_id: string
          distance_m?: number | null
          guard_id: string
          id: string
          latitude?: number | null
          location_status?: string
          longitude?: number | null
          received_at?: string
          scanned_at: string
        }
        Update: {
          accuracy_m?: number | null
          checkpoint_id?: string
          distance_m?: number | null
          guard_id?: string
          id?: string
          latitude?: number | null
          location_status?: string
          longitude?: number | null
          received_at?: string
          scanned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      scan_rows: {
        Row: {
          accuracy_m: number | null
          checkpoint_id: string | null
          checkpoint_latitude: number | null
          checkpoint_longitude: number | null
          checkpoint_name: string | null
          checkpoint_radius_m: number | null
          distance_m: number | null
          guard_id: string | null
          guard_name: string | null
          id: string | null
          latitude: number | null
          location_status: string | null
          longitude: number | null
          received_at: string | null
          report: Json | null
          scanned_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_guard_id_fkey"
            columns: ["guard_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_checkpoint: {
        Args: { p_name: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }
        SetofOptions: {
          from: "*"
          to: "checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guard_summaries: {
        Args: { p_from: string; p_to: string }
        Returns: {
          guard_id: string
          guard_name: string
          last_scan_at: string
          scans_today: number
        }[]
      }
      missed_checkpoints: {
        Args: { p_from: string; p_to: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }[]
        SetofOptions: {
          from: "*"
          to: "checkpoints"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      move_checkpoint: {
        Args: { p_id: string; p_up: boolean }
        Returns: undefined
      }
      qr_payload: { Args: { p_checkpoint_id: string }; Returns: string }
      reissue_checkpoint: {
        Args: { p_id: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }
        SetofOptions: {
          from: "*"
          to: "checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      route_checkpoints: {
        Args: never
        Returns: {
          active: boolean
          id: string
          name: string
          route_order: number
        }[]
      }
      set_account_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      set_checkpoint_location: {
        Args: { p_id: string; p_lat: number; p_lng: number; p_radius_m: number }
        Returns: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }
        SetofOptions: {
          from: "*"
          to: "checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_report: {
        Args: {
          p_created_at: string
          p_id: string
          p_note: string
          p_photos: string[]
          p_scan_id: string
        }
        Returns: undefined
      }
      submit_scan: {
        Args: {
          p_accuracy_m?: number
          p_code: string
          p_id: string
          p_lat?: number
          p_lng?: number
          p_scanned_at: string
        }
        Returns: Json
      }
      update_checkpoint: {
        Args: { p_active: boolean; p_id: string; p_name: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manual_code: string
          name: string
          qr_version: number
          radius_m: number
          route_order: number
        }
        SetofOptions: {
          from: "*"
          to: "checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "guard" | "supervisor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["guard", "supervisor"],
    },
  },
} as const

