export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_notification_deliveries: {
        Row: {
          account_id: string;
          attempts: number;
          created_at: string;
          entity_key: string;
          id: string;
          last_attempt_at: string;
          last_error: string | null;
          notification_kind: string;
          provider_message_id: string | null;
          sent_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          attempts?: number;
          created_at?: string;
          entity_key: string;
          id?: string;
          last_attempt_at?: string;
          last_error?: string | null;
          notification_kind: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          attempts?: number;
          created_at?: string;
          entity_key?: string;
          id?: string;
          last_attempt_at?: string;
          last_error?: string | null;
          notification_kind?: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_notification_deliveries_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      account_support_requests: {
        Row: {
          account_id: string;
          category: string;
          created_at: string;
          id: string;
          message: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          staff_response: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          category: string;
          created_at?: string;
          id?: string;
          message: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_response?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          category?: string;
          created_at?: string;
          id?: string;
          message?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          staff_response?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_support_requests_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_events: {
        Row: {
          created_at: string;
          event_name: string;
          id: string;
          identity_hash: string | null;
          page_source: string | null;
          population_id: string | null;
          problem_id: string | null;
          rank_position: number | null;
          session_id: string;
          therapist_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_name: string;
          id?: string;
          identity_hash?: string | null;
          page_source?: string | null;
          population_id?: string | null;
          problem_id?: string | null;
          rank_position?: number | null;
          session_id: string;
          therapist_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          id?: string;
          identity_hash?: string | null;
          page_source?: string | null;
          population_id?: string | null;
          problem_id?: string | null;
          rank_position?: number | null;
          session_id?: string;
          therapist_id?: string | null;
        };
        Relationships: [];
      };
      billing_price_settings: {
        Row: {
          created_at: string;
          currency: string;
          lead_price_agorot: number | null;
          pricing_active: boolean;
          singleton: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          lead_price_agorot?: number | null;
          pricing_active?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          lead_price_agorot?: number | null;
          pricing_active?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      contact_channel_settings: {
        Row: {
          created_at: string;
          email_enabled: boolean;
          phone_enabled: boolean;
          singleton: boolean;
          updated_at: string;
          updated_by: string | null;
          whatsapp_enabled: boolean;
        };
        Insert: {
          created_at?: string;
          email_enabled?: boolean;
          phone_enabled?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp_enabled?: boolean;
        };
        Update: {
          created_at?: string;
          email_enabled?: boolean;
          phone_enabled?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp_enabled?: boolean;
        };
        Relationships: [];
      };
      contact_email_suppressions: {
        Row: {
          created_at: string;
          email_normalized: string;
          last_confirmed_at: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          email_normalized: string;
          last_confirmed_at?: string;
          source: string;
        };
        Update: {
          created_at?: string;
          email_normalized?: string;
          last_confirmed_at?: string;
          source?: string;
        };
        Relationships: [];
      };
      cta_clicks: {
        Row: {
          billable: boolean;
          created_at: string;
          cta_id: string;
          id: string;
          ip_hash: string | null;
          session_id: string;
          source_problem_id: string | null;
          therapist_id: string;
          user_agent: string | null;
        };
        Insert: {
          billable?: boolean;
          created_at?: string;
          cta_id?: string;
          id?: string;
          ip_hash?: string | null;
          session_id: string;
          source_problem_id?: string | null;
          therapist_id: string;
          user_agent?: string | null;
        };
        Update: {
          billable?: boolean;
          created_at?: string;
          cta_id?: string;
          id?: string;
          ip_hash?: string | null;
          session_id?: string;
          source_problem_id?: string | null;
          therapist_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cta_clicks_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      email_lead_deliveries: {
        Row: {
          accepted_at: string | null;
          billable_eligible: boolean;
          billed_at: string | null;
          budget_reservation_id: string | null;
          channel: string;
          created_at: string;
          cta_event_id: string | null;
          deferred_at: string | null;
          delivered_at: string | null;
          error_code: string | null;
          failed_at: string | null;
          id: string;
          lead_id: string;
          provider: string;
          provider_message_id: string | null;
          reservation_released_at: string | null;
          status: string;
          therapist_id: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          billable_eligible?: boolean;
          billed_at?: string | null;
          budget_reservation_id?: string | null;
          channel?: string;
          created_at?: string;
          cta_event_id?: string | null;
          deferred_at?: string | null;
          delivered_at?: string | null;
          error_code?: string | null;
          failed_at?: string | null;
          id?: string;
          lead_id: string;
          provider?: string;
          provider_message_id?: string | null;
          reservation_released_at?: string | null;
          status?: string;
          therapist_id: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          billable_eligible?: boolean;
          billed_at?: string | null;
          budget_reservation_id?: string | null;
          channel?: string;
          created_at?: string;
          cta_event_id?: string | null;
          deferred_at?: string | null;
          delivered_at?: string | null;
          error_code?: string | null;
          failed_at?: string | null;
          id?: string;
          lead_id?: string;
          provider?: string;
          provider_message_id?: string | null;
          reservation_released_at?: string | null;
          status?: string;
          therapist_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_lead_deliveries_budget_reservation_id_fkey";
            columns: ["budget_reservation_id"];
            isOneToOne: false;
            referencedRelation: "monthly_budget_reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_lead_deliveries_cta_event_id_fkey";
            columns: ["cta_event_id"];
            isOneToOne: false;
            referencedRelation: "cta_clicks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_lead_deliveries_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_lead_deliveries_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      languages: {
        Row: {
          code: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          id?: string;
          name: string;
        };
        Update: {
          code?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      lead_challenges: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          expected_answer: number;
          expires_at: string;
          id: string;
          ip_hash: string;
          prompt: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          expected_answer: number;
          expires_at: string;
          id?: string;
          ip_hash: string;
          prompt: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          expected_answer?: number;
          expires_at?: string;
          id?: string;
          ip_hash?: string;
          prompt?: string;
        };
        Relationships: [];
      };
      lead_events: {
        Row: {
          challenge_passed: boolean;
          challenge_presented: string | null;
          created_at: string;
          cta_event_id: string | null;
          delivery_channel: string | null;
          delivery_status: string;
          id: string;
          message: string;
          population_id: string | null;
          problem_id: string | null;
          provider_message_id: string | null;
          session_id: string;
          therapist_id: string;
          therapist_note: string | null;
          therapist_status: string;
          therapist_updated_at: string | null;
          visitor_name: string;
          visitor_phone: string;
        };
        Insert: {
          challenge_passed?: boolean;
          challenge_presented?: string | null;
          created_at?: string;
          cta_event_id?: string | null;
          delivery_channel?: string | null;
          delivery_status?: string;
          id?: string;
          message: string;
          population_id?: string | null;
          problem_id?: string | null;
          provider_message_id?: string | null;
          session_id: string;
          therapist_id: string;
          therapist_note?: string | null;
          therapist_status?: string;
          therapist_updated_at?: string | null;
          visitor_name: string;
          visitor_phone: string;
        };
        Update: {
          challenge_passed?: boolean;
          challenge_presented?: string | null;
          created_at?: string;
          cta_event_id?: string | null;
          delivery_channel?: string | null;
          delivery_status?: string;
          id?: string;
          message?: string;
          population_id?: string | null;
          problem_id?: string | null;
          provider_message_id?: string | null;
          session_id?: string;
          therapist_id?: string;
          therapist_note?: string | null;
          therapist_status?: string;
          therapist_updated_at?: string | null;
          visitor_name?: string;
          visitor_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_events_cta_event_id_fkey";
            columns: ["cta_event_id"];
            isOneToOne: false;
            referencedRelation: "cta_clicks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_events_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_submission_attempts: {
        Row: {
          created_at: string;
          id: string;
          ip_hash: string;
          outcome: string;
          session_hash: string;
          therapist_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ip_hash: string;
          outcome: string;
          session_hash: string;
          therapist_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          ip_hash?: string;
          outcome?: string;
          session_hash?: string;
          therapist_id?: string | null;
        };
        Relationships: [];
      };
      monthly_budget_notifications: {
        Row: {
          account_id: string;
          attempts: number;
          created_at: string;
          id: string;
          last_error: string | null;
          month_start: string;
          monthly_limit_agorot: number;
          sent_at: string | null;
          spent_agorot: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          attempts?: number;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          month_start: string;
          monthly_limit_agorot: number;
          sent_at?: string | null;
          spent_agorot: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          attempts?: number;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          month_start?: string;
          monthly_limit_agorot?: number;
          sent_at?: string | null;
          spent_agorot?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_budget_notifications_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_budget_reservations: {
        Row: {
          account_id: string;
          amount_agorot: number;
          committed_at: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          month_start: string;
          released_at: string | null;
          source_key: string;
          source_type: string;
          status: string;
          therapist_id: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_agorot: number;
          committed_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          month_start: string;
          released_at?: string | null;
          source_key: string;
          source_type: string;
          status: string;
          therapist_id: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_agorot?: number;
          committed_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          month_start?: string;
          released_at?: string | null;
          source_key?: string;
          source_type?: string;
          status?: string;
          therapist_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_budget_reservations_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_budget_reservations_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_events: {
        Row: {
          attempts: number;
          claim_request_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          last_error: string | null;
          payload: Json;
          recipient_account_id: string | null;
          sent_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          claim_request_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          last_error?: string | null;
          payload?: Json;
          recipient_account_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          claim_request_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          last_error?: string | null;
          payload?: Json;
          recipient_account_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_events_claim_request_id_fkey";
            columns: ["claim_request_id"];
            isOneToOne: false;
            referencedRelation: "therapist_claim_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_events_recipient_account_id_fkey";
            columns: ["recipient_account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      population_groups: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      problem_aliases: {
        Row: {
          alias: string;
          created_at: string | null;
          id: number;
          problem_id: number;
        };
        Insert: {
          alias: string;
          created_at?: string | null;
          id?: number;
          problem_id: number;
        };
        Update: {
          alias?: string;
          created_at?: string | null;
          id?: number;
          problem_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "problem_aliases_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "problems";
            referencedColumns: ["id"];
          },
        ];
      };
      problem_intents: {
        Row: {
          id: string;
          intent_text: string;
          problem_slug: string | null;
        };
        Insert: {
          id?: string;
          intent_text: string;
          problem_slug?: string | null;
        };
        Update: {
          id?: string;
          intent_text?: string;
          problem_slug?: string | null;
        };
        Relationships: [];
      };
      problems: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          is_active: boolean;
          name_en: string;
          name_he: string;
          parent_id: number | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: number;
          is_active?: boolean;
          name_en: string;
          name_he: string;
          parent_id?: number | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: number;
          is_active?: boolean;
          name_en?: string;
          name_he?: string;
          parent_id?: number | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "problems_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "problems";
            referencedColumns: ["id"];
          },
        ];
      };
      professions: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name_en: string | null;
          name_he: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_en?: string | null;
          name_he: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_en?: string | null;
          name_he?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      therapist_accounts: {
        Row: {
          account_status: Database["public"]["Enums"]["therapist_account_status"];
          auth_user_id: string;
          created_at: string;
          credential_verification_skipped_at: string | null;
          contact_policy_last_violation_at: string | null;
          contact_policy_last_violation_types: string[];
          contact_policy_violation_count: number;
          id: string;
          notify_account_updates: boolean;
          notify_new_leads: boolean;
          onboarding_completed: boolean;
          payment_method_kind: string;
          payment_method_status: string;
          updated_at: string;
        };
        Insert: {
          account_status?: Database["public"]["Enums"]["therapist_account_status"];
          auth_user_id: string;
          created_at?: string;
          credential_verification_skipped_at?: string | null;
          contact_policy_last_violation_at?: string | null;
          contact_policy_last_violation_types?: string[];
          contact_policy_violation_count?: number;
          id?: string;
          notify_account_updates?: boolean;
          notify_new_leads?: boolean;
          onboarding_completed?: boolean;
          payment_method_kind?: string;
          payment_method_status?: string;
          updated_at?: string;
        };
        Update: {
          account_status?: Database["public"]["Enums"]["therapist_account_status"];
          auth_user_id?: string;
          created_at?: string;
          credential_verification_skipped_at?: string | null;
          contact_policy_last_violation_at?: string | null;
          contact_policy_last_violation_types?: string[];
          contact_policy_violation_count?: number;
          id?: string;
          notify_account_updates?: boolean;
          notify_new_leads?: boolean;
          onboarding_completed?: boolean;
          payment_method_kind?: string;
          payment_method_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      therapist_contact_policy_events: {
        Row: {
          created_at: string;
          field_names: string[];
          id: string;
          therapist_account_id: string;
          therapist_id: string | null;
          violation_types: string[];
        };
        Insert: {
          created_at?: string;
          field_names: string[];
          id?: string;
          therapist_account_id: string;
          therapist_id?: string | null;
          violation_types: string[];
        };
        Update: {
          created_at?: string;
          field_names?: string[];
          id?: string;
          therapist_account_id?: string;
          therapist_id?: string | null;
          violation_types?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "therapist_contact_policy_events_therapist_account_id_fkey";
            columns: ["therapist_account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_contact_policy_events_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_claim_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by_account_id: string | null;
          created_at: string;
          created_by: string | null;
          delivery_attempts: number;
          delivery_status: string;
          email: string;
          expires_at: string;
          id: string;
          invite_source: string;
          last_delivery_attempt_at: string | null;
          last_delivery_error: string | null;
          provider_message_id: string | null;
          revoked_at: string | null;
          sent_at: string | null;
          source_lead_id: string | null;
          status: string;
          therapist_id: string;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by_account_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_attempts?: number;
          delivery_status?: string;
          email: string;
          expires_at: string;
          id?: string;
          invite_source?: string;
          last_delivery_attempt_at?: string | null;
          last_delivery_error?: string | null;
          provider_message_id?: string | null;
          revoked_at?: string | null;
          sent_at?: string | null;
          source_lead_id?: string | null;
          status?: string;
          therapist_id: string;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by_account_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_attempts?: number;
          delivery_status?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invite_source?: string;
          last_delivery_attempt_at?: string | null;
          last_delivery_error?: string | null;
          provider_message_id?: string | null;
          revoked_at?: string | null;
          sent_at?: string | null;
          source_lead_id?: string | null;
          status?: string;
          therapist_id?: string;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_claim_invites_accepted_by_account_id_fkey";
            columns: ["accepted_by_account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_claim_invites_source_lead_id_fkey";
            columns: ["source_lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_claim_invites_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_claim_requests: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          request_type: Database["public"]["Enums"]["claim_request_type"];
          requester_account_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["claim_request_status"];
          therapist_id: string;
          updated_at: string;
          verification_data: Json;
          verification_method: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          request_type?: Database["public"]["Enums"]["claim_request_type"];
          requester_account_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["claim_request_status"];
          therapist_id: string;
          updated_at?: string;
          verification_data?: Json;
          verification_method?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          request_type?: Database["public"]["Enums"]["claim_request_type"];
          requester_account_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["claim_request_status"];
          therapist_id?: string;
          updated_at?: string;
          verification_data?: Json;
          verification_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_claim_requests_requester_account_id_fkey";
            columns: ["requester_account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_claim_requests_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_credentials: {
        Row: {
          created_at: string;
          credential_type: string;
          document_url: string | null;
          expires_at: string | null;
          id: string;
          institution: string | null;
          issue_date: string | null;
          issuing_authority: string | null;
          license_number: string | null;
          profession_id: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          submitted_at: string | null;
          therapist_id: string;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["credential_verification_status"];
          verified_at: string | null;
          verified_by: string | null;
        };
        Insert: {
          created_at?: string;
          credential_type: string;
          document_url?: string | null;
          expires_at?: string | null;
          id?: string;
          institution?: string | null;
          issue_date?: string | null;
          issuing_authority?: string | null;
          license_number?: string | null;
          profession_id?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          submitted_at?: string | null;
          therapist_id: string;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["credential_verification_status"];
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          created_at?: string;
          credential_type?: string;
          document_url?: string | null;
          expires_at?: string | null;
          id?: string;
          institution?: string | null;
          issue_date?: string | null;
          issuing_authority?: string | null;
          license_number?: string | null;
          profession_id?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          submitted_at?: string | null;
          therapist_id?: string;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["credential_verification_status"];
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_credentials_profession_id_fkey";
            columns: ["profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_credentials_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_languages: {
        Row: {
          id: string;
          language_id: string;
          therapist_id: string;
        };
        Insert: {
          id?: string;
          language_id: string;
          therapist_id: string;
        };
        Update: {
          id?: string;
          language_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_languages_language_id_fkey";
            columns: ["language_id"];
            isOneToOne: false;
            referencedRelation: "languages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_languages_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_locations: {
        Row: {
          accessibility_features: string[];
          accessibility_note: string | null;
          accessibility_status: string;
          address: string | null;
          city: string | null;
          country: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_primary: boolean;
          label: string | null;
          latitude: number | null;
          location_type: Database["public"]["Enums"]["location_type"];
          longitude: number | null;
          notes: string | null;
          postal_code: string | null;
          region: string | null;
          therapist_id: string;
          updated_at: string;
        };
        Insert: {
          accessibility_features?: string[];
          accessibility_note?: string | null;
          accessibility_status?: string;
          address?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_primary?: boolean;
          label?: string | null;
          latitude?: number | null;
          location_type?: Database["public"]["Enums"]["location_type"];
          longitude?: number | null;
          notes?: string | null;
          postal_code?: string | null;
          region?: string | null;
          therapist_id: string;
          updated_at?: string;
        };
        Update: {
          accessibility_features?: string[];
          accessibility_note?: string | null;
          accessibility_status?: string;
          address?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_primary?: boolean;
          label?: string | null;
          latitude?: number | null;
          location_type?: Database["public"]["Enums"]["location_type"];
          longitude?: number | null;
          notes?: string | null;
          postal_code?: string | null;
          region?: string | null;
          therapist_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_locations_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_modalities: {
        Row: {
          created_at: string;
          modality_id: string;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          modality_id: string;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          modality_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_modalities_modality_id_fkey";
            columns: ["modality_id"];
            isOneToOne: false;
            referencedRelation: "treatment_modalities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_modalities_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_monthly_budget_usage: {
        Row: {
          account_id: string;
          created_at: string;
          month_start: string;
          spent_agorot: number;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          month_start: string;
          spent_agorot?: number;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          month_start?: string;
          spent_agorot?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_monthly_budget_usage_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_monthly_budgets: {
        Row: {
          account_id: string;
          created_at: string;
          monthly_limit_agorot: number | null;
          notify_on_exhaustion: boolean;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          monthly_limit_agorot?: number | null;
          notify_on_exhaustion?: boolean;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          monthly_limit_agorot?: number | null;
          notify_on_exhaustion?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_monthly_budgets_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_populations: {
        Row: {
          id: string;
          population_id: string;
          therapist_id: string;
        };
        Insert: {
          id?: string;
          population_id: string;
          therapist_id: string;
        };
        Update: {
          id?: string;
          population_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_populations_population_id_fkey";
            columns: ["population_id"];
            isOneToOne: false;
            referencedRelation: "population_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_populations_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_problems: {
        Row: {
          id: string;
          population_id: string | null;
          problem_id: string;
          therapist_id: string;
        };
        Insert: {
          id?: string;
          population_id?: string | null;
          problem_id: string;
          therapist_id: string;
        };
        Update: {
          id?: string;
          population_id?: string | null;
          problem_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_problems_population_id_fkey";
            columns: ["population_id"];
            isOneToOne: false;
            referencedRelation: "population_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_problems_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_professional_memberships: {
        Row: {
          created_at: string;
          id: string;
          member_since: number | null;
          membership_start_date: string | null;
          organization_name: string;
          sort_order: number;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          member_since?: number | null;
          membership_start_date?: string | null;
          organization_name: string;
          sort_order?: number;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          member_since?: number | null;
          membership_start_date?: string | null;
          organization_name?: string;
          sort_order?: number;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_professional_memberships_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_professions: {
        Row: {
          created_at: string;
          is_primary: boolean;
          profession_id: string;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          is_primary?: boolean;
          profession_id: string;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          is_primary?: boolean;
          profession_id?: string;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_professions_profession_id_fkey";
            columns: ["profession_id"];
            isOneToOne: false;
            referencedRelation: "professions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_professions_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_profile_requests: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          request_ip_hash: string | null;
          request_type: string;
          requester_email: string;
          requester_name: string;
          requester_phone: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          therapist_id: string;
          updated_at: string;
          verification_method: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          request_ip_hash?: string | null;
          request_type: string;
          requester_email: string;
          requester_name: string;
          requester_phone?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          therapist_id: string;
          updated_at?: string;
          verification_method?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          request_ip_hash?: string | null;
          request_type?: string;
          requester_email?: string;
          requester_name?: string;
          requester_phone?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          therapist_id?: string;
          updated_at?: string;
          verification_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_profile_requests_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_registration_settings: {
        Row: {
          created_at: string;
          registration_enabled: boolean;
          singleton: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          registration_enabled?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          registration_enabled?: boolean;
          singleton?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      therapist_service_arrangements: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          organization_name: string;
          sort_order: number;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_name: string;
          sort_order?: number;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_name?: string;
          sort_order?: number;
          therapist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_service_arrangements_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      therapist_therapy_formats: {
        Row: {
          created_at: string;
          therapist_id: string;
          therapy_format_id: string;
        };
        Insert: {
          created_at?: string;
          therapist_id: string;
          therapy_format_id: string;
        };
        Update: {
          created_at?: string;
          therapist_id?: string;
          therapy_format_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "therapist_therapy_formats_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "therapist_therapy_formats_therapy_format_id_fkey";
            columns: ["therapy_format_id"];
            isOneToOne: false;
            referencedRelation: "therapy_formats";
            referencedColumns: ["id"];
          },
        ];
      };
      therapists: {
        Row: {
          background: string | null;
          billing_hold: boolean;
          bio_raw: string | null;
          budget_hold_reason: string | null;
          budget_hold_until: string | null;
          city: string | null;
          contact_destination: string | null;
          contact_methods: string[];
          country: string;
          created_at: string;
          do_not_republish: boolean;
          education_training: string | null;
          email: string | null;
          first_contact_reserved_at: string | null;
          first_contact_sent_at: string | null;
          free_intro_duration_minutes: number | null;
          free_intro_types: string[];
          full_description: string | null;
          full_name: string;
          gender: Database["public"]["Enums"]["therapist_gender"] | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          is_active_before_billing_hold: boolean | null;
          latitude: number | null;
          lgbtq_affirming: boolean;
          license_number: string | null;
          longitude: number | null;
          manual_verified: boolean;
          offers_free_intro: boolean;
          owner_account_id: string | null;
          owner_reviewed_at: string | null;
          ownership_verification_method: string | null;
          ownership_verified_at: string | null;
          participation_consent_at: string | null;
          participation_consent_source: string | null;
          phone: string | null;
          preferred_contact_channel: Database["public"]["Enums"]["contact_channel"];
          preferred_contact_method: string | null;
          professional_experience: string | null;
          professional_title: string | null;
          profile_claimed: boolean;
          profile_origin: string;
          profile_status: Database["public"]["Enums"]["therapist_profile_status"];
          region: string | null;
          semantic_profile: Json;
          short_intro: string | null;
          slug: string;
          verified: boolean;
          visibility: Database["public"]["Enums"]["therapist_visibility"];
          years_experience: number | null;
        };
        Insert: {
          background?: string | null;
          billing_hold?: boolean;
          bio_raw?: string | null;
          budget_hold_reason?: string | null;
          budget_hold_until?: string | null;
          city?: string | null;
          contact_destination?: string | null;
          contact_methods?: string[];
          country?: string;
          created_at?: string;
          do_not_republish?: boolean;
          education_training?: string | null;
          email?: string | null;
          first_contact_reserved_at?: string | null;
          first_contact_sent_at?: string | null;
          free_intro_duration_minutes?: number | null;
          free_intro_types?: string[];
          full_description?: string | null;
          full_name: string;
          gender?: Database["public"]["Enums"]["therapist_gender"] | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_active_before_billing_hold?: boolean | null;
          latitude?: number | null;
          lgbtq_affirming?: boolean;
          license_number?: string | null;
          longitude?: number | null;
          manual_verified?: boolean;
          offers_free_intro?: boolean;
          owner_account_id?: string | null;
          owner_reviewed_at?: string | null;
          ownership_verification_method?: string | null;
          ownership_verified_at?: string | null;
          participation_consent_at?: string | null;
          participation_consent_source?: string | null;
          phone?: string | null;
          preferred_contact_channel?: Database["public"]["Enums"]["contact_channel"];
          preferred_contact_method?: string | null;
          professional_experience?: string | null;
          professional_title?: string | null;
          profile_claimed?: boolean;
          profile_origin?: string;
          profile_status?: Database["public"]["Enums"]["therapist_profile_status"];
          region?: string | null;
          semantic_profile?: Json;
          short_intro?: string | null;
          slug: string;
          verified?: boolean;
          visibility?: Database["public"]["Enums"]["therapist_visibility"];
          years_experience?: number | null;
        };
        Update: {
          background?: string | null;
          billing_hold?: boolean;
          bio_raw?: string | null;
          budget_hold_reason?: string | null;
          budget_hold_until?: string | null;
          city?: string | null;
          contact_destination?: string | null;
          contact_methods?: string[];
          country?: string;
          created_at?: string;
          do_not_republish?: boolean;
          education_training?: string | null;
          email?: string | null;
          first_contact_reserved_at?: string | null;
          first_contact_sent_at?: string | null;
          free_intro_duration_minutes?: number | null;
          free_intro_types?: string[];
          full_description?: string | null;
          full_name?: string;
          gender?: Database["public"]["Enums"]["therapist_gender"] | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_active_before_billing_hold?: boolean | null;
          latitude?: number | null;
          lgbtq_affirming?: boolean;
          license_number?: string | null;
          longitude?: number | null;
          manual_verified?: boolean;
          offers_free_intro?: boolean;
          owner_account_id?: string | null;
          owner_reviewed_at?: string | null;
          ownership_verification_method?: string | null;
          ownership_verified_at?: string | null;
          participation_consent_at?: string | null;
          participation_consent_source?: string | null;
          phone?: string | null;
          preferred_contact_channel?: Database["public"]["Enums"]["contact_channel"];
          preferred_contact_method?: string | null;
          professional_experience?: string | null;
          professional_title?: string | null;
          profile_claimed?: boolean;
          profile_origin?: string;
          profile_status?: Database["public"]["Enums"]["therapist_profile_status"];
          region?: string | null;
          semantic_profile?: Json;
          short_intro?: string | null;
          slug?: string;
          verified?: boolean;
          visibility?: Database["public"]["Enums"]["therapist_visibility"];
          years_experience?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "therapists_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "therapist_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      therapy_formats: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name_he: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_he: string;
          slug: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_he?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      treatment_modalities: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name_en: string | null;
          name_he: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string | null;
          name_he: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string | null;
          name_he?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      voice_call_sessions: {
        Row: {
          billable_eligible: boolean;
          billable_event_at: string | null;
          budget_reservation_id: string | null;
          caller_amd_result: string | null;
          caller_answered_at: string | null;
          caller_hash: string;
          caller_leg_status: string;
          child_call_sid: string | null;
          completed_at: string | null;
          connected_at: string | null;
          connected_duration_seconds: number | null;
          created_at: string;
          cta_event_id: string | null;
          id: string;
          ip_hash: string;
          last_caller_sequence: number | null;
          last_therapist_sequence: number | null;
          lead_id: string | null;
          outcome: string | null;
          parent_call_sid: string | null;
          provider_error_code: string | null;
          requested_at: string;
          session_id: string;
          therapist_answered_at: string | null;
          therapist_id: string;
          therapist_leg_status: string | null;
          updated_at: string;
        };
        Insert: {
          billable_eligible?: boolean;
          billable_event_at?: string | null;
          budget_reservation_id?: string | null;
          caller_amd_result?: string | null;
          caller_answered_at?: string | null;
          caller_hash: string;
          caller_leg_status?: string;
          child_call_sid?: string | null;
          completed_at?: string | null;
          connected_at?: string | null;
          connected_duration_seconds?: number | null;
          created_at?: string;
          cta_event_id?: string | null;
          id?: string;
          ip_hash: string;
          last_caller_sequence?: number | null;
          last_therapist_sequence?: number | null;
          lead_id?: string | null;
          outcome?: string | null;
          parent_call_sid?: string | null;
          provider_error_code?: string | null;
          requested_at?: string;
          session_id: string;
          therapist_answered_at?: string | null;
          therapist_id: string;
          therapist_leg_status?: string | null;
          updated_at?: string;
        };
        Update: {
          billable_eligible?: boolean;
          billable_event_at?: string | null;
          budget_reservation_id?: string | null;
          caller_amd_result?: string | null;
          caller_answered_at?: string | null;
          caller_hash?: string;
          caller_leg_status?: string;
          child_call_sid?: string | null;
          completed_at?: string | null;
          connected_at?: string | null;
          connected_duration_seconds?: number | null;
          created_at?: string;
          cta_event_id?: string | null;
          id?: string;
          ip_hash?: string;
          last_caller_sequence?: number | null;
          last_therapist_sequence?: number | null;
          lead_id?: string | null;
          outcome?: string | null;
          parent_call_sid?: string | null;
          provider_error_code?: string | null;
          requested_at?: string;
          session_id?: string;
          therapist_answered_at?: string | null;
          therapist_id?: string;
          therapist_leg_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_call_sessions_budget_reservation_id_fkey";
            columns: ["budget_reservation_id"];
            isOneToOne: false;
            referencedRelation: "monthly_budget_reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_call_sessions_cta_event_id_fkey";
            columns: ["cta_event_id"];
            isOneToOne: false;
            referencedRelation: "cta_clicks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_call_sessions_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_call_sessions_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_lead_deliveries: {
        Row: {
          billed_at: string | null;
          budget_reservation_id: string | null;
          channel: string;
          created_at: string;
          cta_event_id: string | null;
          delivered_at: string | null;
          error_code: string | null;
          failed_at: string | null;
          id: string;
          lead_id: string;
          message_sid: string | null;
          provider: string;
          reservation_released_at: string | null;
          sent_at: string | null;
          status: string;
          therapist_id: string;
          updated_at: string;
        };
        Insert: {
          billed_at?: string | null;
          budget_reservation_id?: string | null;
          channel?: string;
          created_at?: string;
          cta_event_id?: string | null;
          delivered_at?: string | null;
          error_code?: string | null;
          failed_at?: string | null;
          id?: string;
          lead_id: string;
          message_sid?: string | null;
          provider?: string;
          reservation_released_at?: string | null;
          sent_at?: string | null;
          status?: string;
          therapist_id: string;
          updated_at?: string;
        };
        Update: {
          billed_at?: string | null;
          budget_reservation_id?: string | null;
          channel?: string;
          created_at?: string;
          cta_event_id?: string | null;
          delivered_at?: string | null;
          error_code?: string | null;
          failed_at?: string | null;
          id?: string;
          lead_id?: string;
          message_sid?: string | null;
          provider?: string;
          reservation_released_at?: string | null;
          sent_at?: string | null;
          status?: string;
          therapist_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_lead_deliveries_budget_reservation_id_fkey";
            columns: ["budget_reservation_id"];
            isOneToOne: false;
            referencedRelation: "monthly_budget_reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_lead_deliveries_cta_event_id_fkey";
            columns: ["cta_event_id"];
            isOneToOne: false;
            referencedRelation: "cta_clicks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_lead_deliveries_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_lead_deliveries_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "therapists";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_therapist_profile_removal: {
        Args: {
          _request_id: string;
          _reviewer: string;
          _verification_method: string;
        };
        Returns: string;
      };
      attach_email_lead_message: {
        Args: { _delivery_id: string; _message_id: string };
        Returns: undefined;
      };
      attach_voice_call_provider: {
        Args: { _attempt_id: string; _parent_call_sid: string };
        Returns: undefined;
      };
      attach_whatsapp_lead_message: {
        Args: { _delivery_id: string; _message_sid: string };
        Returns: undefined;
      };
      begin_admin_public_profile_deletion: {
        Args: { _actor: string; _therapist_id: string };
        Returns: string;
      };
      begin_therapist_profile_deletion: {
        Args: { _actor: string };
        Returns: Json;
      };
      billing_month_start: { Args: { _at?: string }; Returns: string };
      billing_next_month_at: { Args: { _at?: string }; Returns: string };
      claim_account_notification: {
        Args: {
          _account_id: string;
          _entity_key: string;
          _notification_kind: string;
        };
        Returns: boolean;
      };
      claim_monthly_budget_notification: {
        Args: { _therapist_id: string };
        Returns: Json;
      };
      claim_therapist_by_invite: {
        Args: { _auth_user_id: string; _token_hash: string };
        Returns: string;
      };
      commit_monthly_budget_reservation: {
        Args: { _reservation_id: string };
        Returns: Json;
      };
      create_therapist_claim_invite: {
        Args: {
          _created_by: string;
          _email: string;
          _expires_at: string;
          _invite_source?: string;
          _replace_existing?: boolean;
          _source_lead_id?: string;
          _therapist_id: string;
          _token_hash: string;
        };
        Returns: {
          accepted_at: string | null;
          accepted_by_account_id: string | null;
          created_at: string;
          created_by: string | null;
          delivery_attempts: number;
          delivery_status: string;
          email: string;
          expires_at: string;
          id: string;
          invite_source: string;
          last_delivery_attempt_at: string | null;
          last_delivery_error: string | null;
          provider_message_id: string | null;
          revoked_at: string | null;
          sent_at: string | null;
          source_lead_id: string | null;
          status: string;
          therapist_id: string;
          token_hash: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "therapist_claim_invites";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fail_email_lead_delivery: {
        Args: { _delivery_id: string; _error_code: string };
        Returns: undefined;
      };
      fail_voice_call_attempt: {
        Args: { _attempt_id: string; _error_code: string };
        Returns: undefined;
      };
      fail_whatsapp_lead_delivery: {
        Args: { _delivery_id: string; _error_code: string };
        Returns: undefined;
      };
      finalize_admin_public_profile_deletion: {
        Args: { _actor: string; _therapist_id: string };
        Returns: string;
      };
      finalize_therapist_profile_deletion: {
        Args: { _actor: string };
        Returns: Json;
      };
      finish_account_notification: {
        Args: {
          _account_id: string;
          _entity_key: string;
          _error: string;
          _notification_kind: string;
          _provider_message_id: string;
          _success: boolean;
        };
        Returns: undefined;
      };
      finish_monthly_budget_notification: {
        Args: { _error?: string; _notification_id: string; _success: boolean };
        Returns: undefined;
      };
      get_my_account_dashboard: { Args: never; Returns: Json };
      get_my_account_lead_detail: { Args: { _lead_id: string }; Returns: Json };
      get_my_account_leads: { Args: { _limit?: number }; Returns: Json };
      get_my_billing_transactions: { Args: { _limit?: number }; Returns: Json };
      get_my_monthly_budget: { Args: never; Returns: Json };
      get_my_notification_preferences: {
        Args: never;
        Returns: {
          notify_account_updates: boolean;
          notify_new_leads: boolean;
        }[];
      };
      get_my_support_requests: { Args: never; Returns: Json };
      is_contact_email_suppressed: {
        Args: { _email: string };
        Returns: boolean;
      };
      is_therapist_registration_enabled: { Args: never; Returns: boolean };
      issue_lead_challenge: {
        Args: {
          _expected: number;
          _ip_hash: string;
          _issue_limit?: number;
          _prompt: string;
          _ttl_seconds?: number;
          _window_seconds?: number;
        };
        Returns: {
          allowed: boolean;
          challenge_id: string;
          expires_at: string;
          prompt: string;
          reason: string;
        }[];
      };
      mark_therapist_as_admin_public_profile: {
        Args: { _therapist_id: string };
        Returns: undefined;
      };
      mark_therapist_claim_invite_failed: {
        Args: { _error: string; _invite_id: string };
        Returns: undefined;
      };
      mark_therapist_claim_invite_sent: {
        Args: { _invite_id: string; _provider_message_id: string };
        Returns: undefined;
      };
      monthly_budget_snapshot: { Args: { _account_id: string }; Returns: Json };
      publish_my_completed_profile: { Args: never; Returns: Json };
      purge_expired_lead_challenges: { Args: never; Returns: number };
      reconcile_monthly_budget_hold: {
        Args: { _account_id: string; _queue_notification?: boolean };
        Returns: boolean;
      };
      record_contact_email_suppressions: {
        Args: { _emails: string[]; _source: string };
        Returns: number;
      };
      record_profile_contact_policy_violation: {
        Args: {
          _actor: string;
          _field_names: string[];
          _therapist_id: string | null;
          _violation_types: string[];
        };
        Returns: Json;
      };
      record_cta_click: {
        Args: {
          _cta_id?: string;
          _ip_hash?: string;
          _session_id: string;
          _source_problem_id?: string;
          _therapist_id: string;
          _user_agent?: string;
        };
        Returns: {
          already_exists: boolean;
          billable: boolean;
          click_id: string;
        }[];
      };
      record_email_lead_status: {
        Args: {
          _delivery_id?: string;
          _error_code?: string;
          _message_id: string;
          _status: string;
        };
        Returns: {
          billed: boolean;
          handled: boolean;
          lead_id: string;
          therapist_id: string;
        }[];
      };
      record_public_analytics_event: {
        Args: {
          _event_name: string;
          _identity_hash: string;
          _page_source: string;
          _population_id: string;
          _problem_id: string;
          _rank_position: number;
          _session_hash: string;
          _therapist_id: string;
        };
        Returns: boolean;
      };
      record_voice_call_leg_event: {
        Args: {
          _child_call_sid: string;
          _duration: number;
          _leg: string;
          _parent_call_sid: string;
          _sequence: number;
          _status: string;
        };
        Returns: {
          attempt_id: string;
          billable_created: boolean;
          handled: boolean;
        }[];
      };
      record_whatsapp_lead_status: {
        Args: {
          _delivery_id?: string;
          _error_code?: string;
          _message_sid: string;
          _status: string;
        };
        Returns: {
          billed: boolean;
          handled: boolean;
          lead_id: string;
          therapist_id: string;
        }[];
      };
      register_monthly_budget_event: {
        Args: {
          _source_key: string;
          _source_type: string;
          _therapist_id: string;
        };
        Returns: Json;
      };
      release_monthly_budget_reservation: {
        Args: { _reservation_id: string };
        Returns: boolean;
      };
      reserve_monthly_budget_for_source: {
        Args: {
          _source_key: string;
          _source_type: string;
          _therapist_id: string;
          _ttl_minutes?: number;
        };
        Returns: Json;
      };
      reserve_monthly_budget_for_voice: {
        Args: {
          _source_key: string;
          _therapist_id: string;
          _ttl_minutes?: number;
        };
        Returns: Json;
      };
      save_therapist_profile: {
        Args: { _actor: string; _payload: Json };
        Returns: Json;
      };
      save_therapist_profile_with_contacts: {
        Args: { _actor: string; _payload: Json };
        Returns: Json;
      };
      set_my_credential_verification_skip: {
        Args: { _skip: boolean };
        Returns: string;
      };
      set_my_monthly_budget: {
        Args: { _monthly_limit_agorot: number; _notify_on_exhaustion: boolean };
        Returns: Json;
      };
      set_my_test_payment_method: { Args: { _enabled: boolean }; Returns: Json };
      start_voice_call_attempt: {
        Args: {
          _answer: number;
          _caller_hash: string;
          _challenge_id: string;
          _ip_hash: string;
          _session_hash: string;
          _session_id: string;
          _therapist_id: string;
        };
        Returns: {
          allowed: boolean;
          attempt_id: string;
          reason: string;
          therapist_name: string;
          therapist_phone: string;
        }[];
      };
      submit_lead: {
        Args: {
          _answer: number;
          _challenge_id: string;
          _cta_id: string;
          _ip_hash: string;
          _message: string;
          _population_id: string;
          _session_hash: string;
          _session_id: string;
          _source_problem_id: string;
          _therapist_id: string;
          _user_agent: string;
          _visitor_name: string;
          _visitor_phone: string;
        };
        Returns: {
          allowed: boolean;
          billable: boolean;
          cta_event_id: string;
          delivery_channel: string;
          delivery_id: string;
          destination: string;
          lead_id: string;
          reason: string;
          therapist_name: string;
        }[];
      };
      submit_my_support_request: {
        Args: { _category: string; _message: string; _subject: string };
        Returns: string;
      };
      submit_whatsapp_lead: {
        Args: {
          _answer: number;
          _challenge_id: string;
          _cta_id: string;
          _ip_hash: string;
          _message: string;
          _population_id: string;
          _session_hash: string;
          _session_id: string;
          _source_problem_id: string;
          _therapist_id: string;
          _user_agent: string;
          _visitor_name: string;
          _visitor_phone: string;
        };
        Returns: {
          allowed: boolean;
          delivery_id: string;
          destination: string;
          lead_id: string;
          reason: string;
          therapist_name: string;
        }[];
      };
      update_my_account_lead: {
        Args: {
          _lead_id: string;
          _private_note: string;
          _workflow_status: string;
        };
        Returns: Json;
      };
      update_my_notification_preferences: {
        Args: { _notify_account_updates: boolean; _notify_new_leads: boolean };
        Returns: {
          notify_account_updates: boolean;
          notify_new_leads: boolean;
        }[];
      };
      voice_call_caller_answered: {
        Args: { _amd_result: string; _parent_call_sid: string };
        Returns: {
          allowed: boolean;
          attempt_id: string;
          reason: string;
          therapist_phone: string;
        }[];
      };
    };
    Enums: {
      claim_request_status: "pending" | "approved" | "rejected" | "cancelled" | "needs_information";
      claim_request_type: "claim_profile" | "remove_profile";
      contact_channel: "whatsapp" | "sms" | "email";
      credential_verification_status: "unverified" | "pending_review" | "verified" | "rejected" | "expired";
      location_type: "clinic" | "home_visit" | "online" | "hospital" | "other";
      therapist_account_status: "pending" | "active" | "claimed" | "suspended";
      therapist_gender: "male" | "female" | "unspecified";
      therapist_profile_status: "draft" | "completed" | "published";
      therapist_visibility: "published" | "hidden_by_owner" | "archived" | "visible" | "hidden";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      claim_request_status: ["pending", "approved", "rejected", "cancelled", "needs_information"],
      claim_request_type: ["claim_profile", "remove_profile"],
      contact_channel: ["whatsapp", "sms", "email"],
      credential_verification_status: ["unverified", "pending_review", "verified", "rejected", "expired"],
      location_type: ["clinic", "home_visit", "online", "hospital", "other"],
      therapist_account_status: ["pending", "active", "claimed", "suspended"],
      therapist_gender: ["male", "female", "unspecified"],
      therapist_profile_status: ["draft", "completed", "published"],
      therapist_visibility: ["published", "hidden_by_owner", "archived", "visible", "hidden"],
    },
  },
} as const;
