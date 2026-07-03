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
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          page_source: string | null
          population_id: string | null
          problem_id: string | null
          rank_position: number | null
          session_id: string
          therapist_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          page_source?: string | null
          population_id?: string | null
          problem_id?: string | null
          rank_position?: number | null
          session_id: string
          therapist_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          page_source?: string | null
          population_id?: string | null
          problem_id?: string | null
          rank_position?: number | null
          session_id?: string
          therapist_id?: string | null
        }
        Relationships: []
      }
      cta_clicks: {
        Row: {
          billable: boolean
          created_at: string
          cta_id: string
          id: string
          ip_hash: string | null
          session_id: string
          source_problem_id: string | null
          therapist_id: string
          user_agent: string | null
        }
        Insert: {
          billable?: boolean
          created_at?: string
          cta_id?: string
          id?: string
          ip_hash?: string | null
          session_id: string
          source_problem_id?: string | null
          therapist_id: string
          user_agent?: string | null
        }
        Update: {
          billable?: boolean
          created_at?: string
          cta_id?: string
          id?: string
          ip_hash?: string | null
          session_id?: string
          source_problem_id?: string | null
          therapist_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cta_clicks_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          challenge_passed: boolean
          challenge_presented: string | null
          created_at: string
          cta_event_id: string | null
          delivery_channel: string | null
          delivery_status: string
          id: string
          message: string
          population_id: string | null
          problem_id: string | null
          provider_message_id: string | null
          session_id: string
          therapist_id: string
          visitor_name: string
          visitor_phone: string
        }
        Insert: {
          challenge_passed?: boolean
          challenge_presented?: string | null
          created_at?: string
          cta_event_id?: string | null
          delivery_channel?: string | null
          delivery_status?: string
          id?: string
          message: string
          population_id?: string | null
          problem_id?: string | null
          provider_message_id?: string | null
          session_id: string
          therapist_id: string
          visitor_name: string
          visitor_phone: string
        }
        Update: {
          challenge_passed?: boolean
          challenge_presented?: string | null
          created_at?: string
          cta_event_id?: string | null
          delivery_channel?: string | null
          delivery_status?: string
          id?: string
          message?: string
          population_id?: string | null
          problem_id?: string | null
          provider_message_id?: string | null
          session_id?: string
          therapist_id?: string
          visitor_name?: string
          visitor_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_cta_event_id_fkey"
            columns: ["cta_event_id"]
            isOneToOne: false
            referencedRelation: "cta_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      population_groups: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      problem_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: number
          problem_id: number
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: number
          problem_id: number
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: number
          problem_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "problem_aliases_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_intents: {
        Row: {
          id: string
          intent_text: string
          problem_slug: string | null
        }
        Insert: {
          id?: string
          intent_text: string
          problem_slug?: string | null
        }
        Update: {
          id?: string
          intent_text?: string
          problem_slug?: string | null
        }
        Relationships: []
      }
      problems: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          name_en: string
          name_he: string
          parent_id: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name_en: string
          name_he: string
          parent_id?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name_en?: string
          name_he?: string
          parent_id?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problems_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      query_classifications: {
        Row: {
          created_at: string
          id: string
          normalized_query: string
          result: Json
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_query: string
          result: Json
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_query?: string
          result?: Json
          source?: string
        }
        Relationships: []
      }
      semantic_search_logs: {
        Row: {
          avg_semantic_similarity_score: number | null
          cache_hit: boolean
          clarification_selected: boolean
          clarification_shown: boolean
          classifier_source: string | null
          created_at: string
          filtered_therapist_count: number | null
          final_results_count: number | null
          id: string
          matches: Json
          normalized_query: string | null
          pre_rank_candidates_count: number | null
          raw_query: string | null
          result_count: number
          selected_problem_slug: string | null
        }
        Insert: {
          avg_semantic_similarity_score?: number | null
          cache_hit?: boolean
          clarification_selected?: boolean
          clarification_shown?: boolean
          classifier_source?: string | null
          created_at?: string
          filtered_therapist_count?: number | null
          final_results_count?: number | null
          id?: string
          matches?: Json
          normalized_query?: string | null
          pre_rank_candidates_count?: number | null
          raw_query?: string | null
          result_count?: number
          selected_problem_slug?: string | null
        }
        Update: {
          avg_semantic_similarity_score?: number | null
          cache_hit?: boolean
          clarification_selected?: boolean
          clarification_shown?: boolean
          classifier_source?: string | null
          created_at?: string
          filtered_therapist_count?: number | null
          final_results_count?: number | null
          id?: string
          matches?: Json
          normalized_query?: string | null
          pre_rank_candidates_count?: number | null
          raw_query?: string | null
          result_count?: number
          selected_problem_slug?: string | null
        }
        Relationships: []
      }
      therapist_languages: {
        Row: {
          id: string
          language_id: string
          therapist_id: string
        }
        Insert: {
          id?: string
          language_id: string
          therapist_id: string
        }
        Update: {
          id?: string
          language_id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_languages_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_languages_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_populations: {
        Row: {
          id: string
          population_id: string
          therapist_id: string
        }
        Insert: {
          id?: string
          population_id: string
          therapist_id: string
        }
        Update: {
          id?: string
          population_id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_populations_population_id_fkey"
            columns: ["population_id"]
            isOneToOne: false
            referencedRelation: "population_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_populations_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_problems: {
        Row: {
          id: string
          population_id: string | null
          problem_id: string
          therapist_id: string
        }
        Insert: {
          id?: string
          population_id?: string | null
          problem_id: string
          therapist_id: string
        }
        Update: {
          id?: string
          population_id?: string | null
          problem_id?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_problems_population_id_fkey"
            columns: ["population_id"]
            isOneToOne: false
            referencedRelation: "population_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_problems_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapists: {
        Row: {
          bio_raw: string | null
          city: string
          contact_destination: string | null
          country: string
          created_at: string
          full_description: string | null
          full_name: string
          id: string
          image_url: string | null
          is_active: boolean
          latitude: number | null
          license_number: string | null
          longitude: number | null
          phone: string | null
          preferred_contact_channel: Database["public"]["Enums"]["contact_channel"]
          professional_title: string
          profile_claimed: boolean
          region: string | null
          semantic_profile: Json
          short_intro: string | null
          slug: string
          verified: boolean
          years_experience: number
        }
        Insert: {
          bio_raw?: string | null
          city: string
          contact_destination?: string | null
          country?: string
          created_at?: string
          full_description?: string | null
          full_name: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          license_number?: string | null
          longitude?: number | null
          phone?: string | null
          preferred_contact_channel?: Database["public"]["Enums"]["contact_channel"]
          professional_title: string
          profile_claimed?: boolean
          region?: string | null
          semantic_profile?: Json
          short_intro?: string | null
          slug: string
          verified?: boolean
          years_experience?: number
        }
        Update: {
          bio_raw?: string | null
          city?: string
          contact_destination?: string | null
          country?: string
          created_at?: string
          full_description?: string | null
          full_name?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          license_number?: string | null
          longitude?: number | null
          phone?: string | null
          preferred_contact_channel?: Database["public"]["Enums"]["contact_channel"]
          professional_title?: string
          profile_claimed?: boolean
          region?: string | null
          semantic_profile?: Json
          short_intro?: string | null
          slug?: string
          verified?: boolean
          years_experience?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_cta_click: {
        Args: {
          _cta_id?: string
          _ip_hash?: string
          _session_id: string
          _source_problem_id?: string
          _therapist_id: string
          _user_agent?: string
        }
        Returns: {
          already_exists: boolean
          billable: boolean
          click_id: string
        }[]
      }
    }
    Enums: {
      contact_channel: "whatsapp" | "sms" | "email"
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
      contact_channel: ["whatsapp", "sms", "email"],
    },
  },
} as const
