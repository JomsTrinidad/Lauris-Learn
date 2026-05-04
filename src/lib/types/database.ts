export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          trial_start_date: string | null;
          trial_end_date: string | null;
          trial_status: "active" | "expired" | "converted";
          logo_url: string | null;
          primary_color: string | null;
          accent_color: string | null;
          report_footer_text: string | null;
          text_size_scale: "default" | "large" | "extra_large";
          spacing_scale: "compact" | "default" | "relaxed";
          enrollment_balance_policy: "warn" | "block" | "allow";
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; name: string; trial_start_date?: string | null; trial_end_date?: string | null; trial_status?: "active" | "expired" | "converted"; logo_url?: string | null; primary_color?: string | null; accent_color?: string | null; report_footer_text?: string | null; text_size_scale?: "default" | "large" | "extra_large"; spacing_scale?: "compact" | "default" | "relaxed"; enrollment_balance_policy?: "warn" | "block" | "allow"; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; trial_start_date?: string | null; trial_end_date?: string | null; trial_status?: "active" | "expired" | "converted"; logo_url?: string | null; primary_color?: string | null; accent_color?: string | null; report_footer_text?: string | null; text_size_scale?: "default" | "large" | "extra_large"; spacing_scale?: "compact" | "default" | "relaxed"; enrollment_balance_policy?: "warn" | "block" | "allow"; updated_at?: string };
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          address: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; address?: string | null; phone?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; address?: string | null; phone?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "branches_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      school_years: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status: "draft" | "active" | "archived" | "planned" | "closed";
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; start_date: string; end_date: string; status?: "draft" | "active" | "archived" | "planned" | "closed"; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; start_date?: string; end_date?: string; status?: "draft" | "active" | "archived" | "planned" | "closed"; updated_at?: string };
        Relationships: [{ foreignKeyName: "school_years_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      profiles: {
        Row: {
          id: string;
          school_id: string | null;
          email: string;
          full_name: string;
          role: "super_admin" | "school_admin" | "teacher" | "parent";
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string; school_id?: string | null; email: string; full_name: string; role?: "super_admin" | "school_admin" | "teacher" | "parent"; avatar_url?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string | null; email?: string; full_name?: string; role?: "super_admin" | "school_admin" | "teacher" | "parent"; avatar_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          school_year_id: string;
          name: string;
          level_id: string | null;
          start_time: string;
          end_time: string;
          capacity: number;
          is_active: boolean;
          next_class_id: string | null;
          next_level: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; school_year_id: string; name: string; level_id?: string | null; start_time: string; end_time: string; capacity?: number; is_active?: boolean; academic_period_id?: string | null; next_class_id?: string | null; next_level?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; school_year_id?: string; name?: string; level_id?: string | null; start_time?: string; end_time?: string; capacity?: number; is_active?: boolean; academic_period_id?: string | null; next_class_id?: string | null; next_level?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "classes_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "classes_school_year_id_fkey"; columns: ["school_year_id"]; isOneToOne: false; referencedRelation: "school_years"; referencedColumns: ["id"] },
          { foreignKeyName: "classes_level_id_fkey"; columns: ["level_id"]; isOneToOne: false; referencedRelation: "class_levels"; referencedColumns: ["id"] }
        ];
      };
      class_levels: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          kind: "core" | "sped" | "bridge" | "summer" | "mixed_age" | "enrichment" | "other";
          display_order: number;
          archived_at: string | null;
          created_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; kind?: "core" | "sped" | "bridge" | "summer" | "mixed_age" | "enrichment" | "other"; display_order?: number; archived_at?: string | null; created_at?: string };
        Update: { id?: string; school_id?: string; name?: string; kind?: "core" | "sped" | "bridge" | "summer" | "mixed_age" | "enrichment" | "other"; display_order?: number; archived_at?: string | null };
        Relationships: [
          { foreignKeyName: "class_levels_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }
        ];
      };
      class_teachers: {
        Row: {
          id: string;
          class_id: string;
          teacher_id: string;
          created_at: string;
        };
        Insert: { id?: string; class_id: string; teacher_id: string; created_at?: string };
        Update: { id?: string; class_id?: string; teacher_id?: string };
        Relationships: [
          { foreignKeyName: "class_teachers_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_teachers_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "teacher_profiles"; referencedColumns: ["id"] }
        ];
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string | null;
          gender: string | null;
          photo_url: string | null;
          notes: string | null;
          is_active: boolean;
          child_profile_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; first_name: string; last_name: string; date_of_birth?: string | null; gender?: string | null; photo_url?: string | null; notes?: string | null; is_active?: boolean; child_profile_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; first_name?: string; last_name?: string; date_of_birth?: string | null; gender?: string | null; photo_url?: string | null; notes?: string | null; is_active?: boolean; child_profile_id?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "students_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "students_child_profile_id_fkey"; columns: ["child_profile_id"]; isOneToOne: false; referencedRelation: "child_profiles"; referencedColumns: ["id"] }
        ];
      };
      child_profiles: {
        Row: {
          id: string;
          display_name: string;
          legal_name: string | null;
          first_name: string | null;
          middle_name: string | null;
          last_name: string | null;
          preferred_name: string | null;
          date_of_birth: string | null;
          sex_at_birth: string | null;
          gender_identity: string | null;
          primary_language: string | null;
          country_code: string | null;
          origin_organization_id: string | null;
          created_in_app: string;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; display_name: string; legal_name?: string | null; first_name?: string | null; middle_name?: string | null; last_name?: string | null; preferred_name?: string | null; date_of_birth?: string | null; sex_at_birth?: string | null; gender_identity?: string | null; primary_language?: string | null; country_code?: string | null; origin_organization_id?: string | null; created_in_app?: string; created_by_user_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; display_name?: string; legal_name?: string | null; first_name?: string | null; middle_name?: string | null; last_name?: string | null; preferred_name?: string | null; date_of_birth?: string | null; sex_at_birth?: string | null; gender_identity?: string | null; primary_language?: string | null; country_code?: string | null; origin_organization_id?: string | null; created_in_app?: string; created_by_user_id?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "child_profiles_created_by_user_id_fkey"; columns: ["created_by_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profiles_origin_organization_id_fkey"; columns: ["origin_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      child_identifiers: {
        Row: {
          id: string;
          child_profile_id: string;
          identifier_type: string;
          identifier_value: string;
          label: string | null;
          country_code: string | null;
          issued_by: string | null;
          valid_from: string | null;
          valid_to: string | null;
          created_at: string;
        };
        Insert: { id?: string; child_profile_id: string; identifier_type: string; identifier_value: string; label?: string | null; country_code?: string | null; issued_by?: string | null; valid_from?: string | null; valid_to?: string | null; created_at?: string };
        Update: { id?: string; child_profile_id?: string; identifier_type?: string; identifier_value?: string; label?: string | null; country_code?: string | null; issued_by?: string | null; valid_from?: string | null; valid_to?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "child_identifiers_child_profile_id_fkey"; columns: ["child_profile_id"]; isOneToOne: false; referencedRelation: "child_profiles"; referencedColumns: ["id"] }
        ];
      };
      organizations: {
        Row: {
          id: string;
          kind: string;
          name: string;
          country_code: string | null;
          school_id: string | null;
          created_in_app: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; kind: string; name: string; country_code?: string | null; school_id?: string | null; created_in_app?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; kind?: string; name?: string; country_code?: string | null; school_id?: string | null; created_in_app?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "organizations_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }
        ];
      };
      child_profile_memberships: {
        Row: {
          id: string;
          child_profile_id: string;
          organization_id: string;
          relationship_kind: string;
          status: string;
          started_at: string | null;
          ended_at: string | null;
          created_in_app: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; child_profile_id: string; organization_id: string; relationship_kind: string; status?: string; started_at?: string | null; ended_at?: string | null; created_in_app?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; child_profile_id?: string; organization_id?: string; relationship_kind?: string; status?: string; started_at?: string | null; ended_at?: string | null; created_in_app?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "child_profile_memberships_child_profile_id_fkey"; columns: ["child_profile_id"]; isOneToOne: false; referencedRelation: "child_profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profile_memberships_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string;
          role: string;
          status: string;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; organization_id: string; profile_id: string; role: string; status?: string; started_at?: string | null; ended_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; organization_id?: string; profile_id?: string; role?: string; status?: string; started_at?: string | null; ended_at?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "organization_memberships_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "organization_memberships_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      child_profile_access_grants: {
        Row: {
          id: string;
          child_profile_id: string;
          scope: string;
          source_organization_id: string;
          target_organization_id: string;
          granted_by_profile_id: string;
          granted_by_kind: string;
          purpose: string | null;
          status: string;
          valid_from: string;
          valid_until: string;
          revoked_at: string | null;
          revoked_by_profile_id: string | null;
          revoke_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; child_profile_id: string; scope?: string; source_organization_id: string; target_organization_id: string; granted_by_profile_id: string; granted_by_kind: string; purpose?: string | null; status?: string; valid_from?: string; valid_until?: string; revoked_at?: string | null; revoked_by_profile_id?: string | null; revoke_reason?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; status?: string; valid_until?: string; revoked_at?: string | null; revoked_by_profile_id?: string | null; revoke_reason?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "child_profile_access_grants_child_profile_id_fkey"; columns: ["child_profile_id"]; isOneToOne: false; referencedRelation: "child_profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profile_access_grants_source_organization_id_fkey"; columns: ["source_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profile_access_grants_target_organization_id_fkey"; columns: ["target_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profile_access_grants_granted_by_profile_id_fkey"; columns: ["granted_by_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "child_profile_access_grants_revoked_by_profile_id_fkey"; columns: ["revoked_by_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      document_organization_access_grants: {
        Row: {
          id: string;
          document_id: string;
          scope: string;
          source_school_id: string;
          target_organization_id: string;
          granted_by_profile_id: string;
          granted_by_kind: string;
          purpose: string | null;
          permissions: Json;
          status: string;
          valid_from: string;
          valid_until: string;
          revoked_at: string | null;
          revoked_by_profile_id: string | null;
          revoke_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; document_id: string; scope?: string; source_school_id: string; target_organization_id: string; granted_by_profile_id: string; granted_by_kind: string; purpose?: string | null; permissions?: Json; status?: string; valid_from?: string; valid_until?: string; revoked_at?: string | null; revoked_by_profile_id?: string | null; revoke_reason?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; status?: string; valid_until?: string; revoked_at?: string | null; revoked_by_profile_id?: string | null; revoke_reason?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "document_organization_access_grants_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "child_documents"; referencedColumns: ["id"] },
          { foreignKeyName: "document_organization_access_grants_source_school_id_fkey"; columns: ["source_school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_organization_access_grants_target_organization_id_fkey"; columns: ["target_organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "document_organization_access_grants_granted_by_profile_id_fkey"; columns: ["granted_by_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "document_organization_access_grants_revoked_by_profile_id_fkey"; columns: ["revoked_by_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      guardians: {
        Row: {
          id: string;
          student_id: string;
          full_name: string;
          relationship: string;
          phone: string | null;
          email: string | null;
          is_primary: boolean;
          is_emergency_contact: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; full_name: string; relationship: string; phone?: string | null; email?: string | null; is_primary?: boolean; is_emergency_contact?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; full_name?: string; relationship?: string; phone?: string | null; email?: string | null; is_primary?: boolean; is_emergency_contact?: boolean; updated_at?: string };
        Relationships: [{ foreignKeyName: "guardians_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }];
      };
      enrollments: {
        Row: {
          id: string;
          student_id: string;
          class_id: string;
          school_year_id: string;
          academic_period_id: string | null;
          status: "inquiry" | "waitlisted" | "enrolled" | "withdrawn" | "completed";
          enrolled_at: string | null;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; class_id: string; school_year_id: string; academic_period_id?: string | null; status?: "inquiry" | "waitlisted" | "enrolled" | "withdrawn" | "completed"; enrolled_at?: string | null; start_date?: string | null; end_date?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; class_id?: string; school_year_id?: string; academic_period_id?: string | null; status?: "inquiry" | "waitlisted" | "enrolled" | "withdrawn" | "completed"; enrolled_at?: string | null; start_date?: string | null; end_date?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "enrollments_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollments_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollments_school_year_id_fkey"; columns: ["school_year_id"]; isOneToOne: false; referencedRelation: "school_years"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollments_academic_period_id_fkey"; columns: ["academic_period_id"]; isOneToOne: false; referencedRelation: "academic_periods"; referencedColumns: ["id"] }
        ];
      };
      attendance_records: {
        Row: {
          id: string;
          class_id: string;
          student_id: string;
          date: string;
          status: "present" | "late" | "absent" | "excused";
          note: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; class_id: string; student_id: string; date: string; status: "present" | "late" | "absent" | "excused"; note?: string | null; recorded_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; class_id?: string; student_id?: string; date?: string; status?: "present" | "late" | "absent" | "excused"; note?: string | null; recorded_by?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "attendance_records_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "attendance_records_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }
        ];
      };
      parent_updates: {
        Row: {
          id: string;
          school_id: string;
          class_id: string | null;
          author_id: string;
          content: string;
          photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; class_id?: string | null; author_id: string; content: string; photo_url?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; class_id?: string | null; author_id?: string; content?: string; photo_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      billing_records: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          school_year_id: string | null;
          class_id: string | null;
          billing_month: string | null;
          description: string | null;
          amount_due: number;
          status: "unpaid" | "partial" | "paid" | "overdue";
          due_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; school_year_id?: string | null; class_id?: string | null; billing_month?: string | null; description?: string | null; amount_due: number; status?: "unpaid" | "partial" | "paid" | "overdue"; due_date?: string | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; school_year_id?: string | null; class_id?: string | null; billing_month?: string | null; description?: string | null; amount_due?: number; status?: "unpaid" | "partial" | "paid" | "overdue"; due_date?: string | null; notes?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "billing_records_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "billing_records_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }
        ];
      };
      payments: {
        Row: {
          id: string;
          billing_record_id: string;
          amount: number;
          payment_method: "cash" | "bank_transfer" | "gcash" | "maya" | "card" | "other";
          reference_number: string | null;
          payment_date: string;
          notes: string | null;
          recorded_by: string | null;
          status: "pending" | "confirmed" | "failed" | "refunded";
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; billing_record_id: string; amount: number; payment_method?: "cash" | "bank_transfer" | "gcash" | "maya" | "card" | "other"; reference_number?: string | null; payment_date: string; notes?: string | null; recorded_by?: string | null; status?: "pending" | "confirmed" | "failed" | "refunded"; created_at?: string; updated_at?: string };
        Update: { id?: string; billing_record_id?: string; amount?: number; payment_method?: "cash" | "bank_transfer" | "gcash" | "maya" | "card" | "other"; reference_number?: string | null; payment_date?: string; notes?: string | null; recorded_by?: string | null; status?: "pending" | "confirmed" | "failed" | "refunded"; updated_at?: string };
        Relationships: [{ foreignKeyName: "payments_billing_record_id_fkey"; columns: ["billing_record_id"]; isOneToOne: false; referencedRelation: "billing_records"; referencedColumns: ["id"] }];
      };
      holidays: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          date: string;
          applies_to_all: boolean;
          is_no_class: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; date: string; applies_to_all?: boolean; is_no_class?: boolean; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; date?: string; applies_to_all?: boolean; is_no_class?: boolean; notes?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "holidays_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      events: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          description: string | null;
          event_date: string;
          start_time: string | null;
          end_time: string | null;
          applies_to: "all" | "class" | "selected";
          class_id: string | null;
          fee: number | null;
          requires_rsvp: boolean;
          all_day: boolean;
          max_companions: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; title: string; description?: string | null; event_date: string; start_time?: string | null; end_time?: string | null; applies_to?: "all" | "class" | "selected"; class_id?: string | null; fee?: number | null; requires_rsvp?: boolean; all_day?: boolean; max_companions?: number | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; title?: string; description?: string | null; event_date?: string; start_time?: string | null; end_time?: string | null; applies_to?: "all" | "class" | "selected"; class_id?: string | null; fee?: number | null; requires_rsvp?: boolean; all_day?: boolean; max_companions?: number | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "events_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      event_rsvps: {
        Row: {
          id: string;
          event_id: string;
          student_id: string | null;
          parent_id: string | null;
          status: "going" | "not_going" | "maybe";
          companions: number;
          companion_names: string[] | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; event_id: string; student_id?: string | null; parent_id?: string | null; status: "going" | "not_going" | "maybe"; companions?: number; companion_names?: string[] | null; notes?: string | null; created_at?: string };
        Update: { id?: string; event_id?: string; student_id?: string | null; parent_id?: string | null; status?: "going" | "not_going" | "maybe"; companions?: number; companion_names?: string[] | null; notes?: string | null };
        Relationships: [{ foreignKeyName: "event_rsvps_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] }];
      };
      enrollment_inquiries: {
        Row: {
          id: string;
          school_id: string;
          child_name: string;
          parent_name: string;
          contact: string | null;
          email: string | null;
          desired_class: string | null;
          desired_class_id: string | null;
          school_year_id: string | null;
          inquiry_source: string | null;
          status: "inquiry" | "assessment_scheduled" | "waitlisted" | "offered_slot" | "enrolled" | "not_proceeding";
          notes: string | null;
          next_follow_up: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; child_name: string; parent_name: string; contact?: string | null; email?: string | null; desired_class?: string | null; desired_class_id?: string | null; school_year_id?: string | null; inquiry_source?: string | null; status?: "inquiry" | "assessment_scheduled" | "waitlisted" | "offered_slot" | "enrolled" | "not_proceeding"; notes?: string | null; next_follow_up?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; child_name?: string; parent_name?: string; contact?: string | null; email?: string | null; desired_class?: string | null; desired_class_id?: string | null; school_year_id?: string | null; inquiry_source?: string | null; status?: "inquiry" | "assessment_scheduled" | "waitlisted" | "offered_slot" | "enrolled" | "not_proceeding"; notes?: string | null; next_follow_up?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "enrollment_inquiries_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      online_class_sessions: {
        Row: {
          id: string;
          class_id: string;
          title: string;
          date: string;
          start_time: string;
          end_time: string;
          meeting_link: string | null;
          notes: string | null;
          status: "scheduled" | "live" | "completed" | "cancelled";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; class_id: string; title: string; date: string; start_time: string; end_time: string; meeting_link?: string | null; notes?: string | null; status?: "scheduled" | "live" | "completed" | "cancelled"; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; class_id?: string; title?: string; date?: string; start_time?: string; end_time?: string; meeting_link?: string | null; notes?: string | null; status?: "scheduled" | "live" | "completed" | "cancelled"; updated_at?: string };
        Relationships: [{ foreignKeyName: "online_class_sessions_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] }];
      };
      progress_categories: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          description: string | null;
          applies_to_level: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; description?: string | null; applies_to_level?: string | null; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; description?: string | null; applies_to_level?: string | null; sort_order?: number; updated_at?: string };
        Relationships: [{ foreignKeyName: "progress_categories_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      progress_observations: {
        Row: {
          id: string;
          student_id: string;
          category_id: string;
          rating: "emerging" | "developing" | "consistent" | "advanced";
          note: string | null;
          observed_by: string | null;
          observer_id: string | null;
          observed_at: string;
          visibility: "internal_only" | "parent_visible";
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; category_id: string; rating: "emerging" | "developing" | "consistent" | "advanced"; note?: string | null; observed_by?: string | null; observer_id?: string | null; observed_at: string; visibility?: "internal_only" | "parent_visible"; created_at?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; category_id?: string; rating?: "emerging" | "developing" | "consistent" | "advanced"; note?: string | null; observed_by?: string | null; observer_id?: string | null; observed_at?: string; visibility?: "internal_only" | "parent_visible"; updated_at?: string };
        Relationships: [
          { foreignKeyName: "progress_observations_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "progress_observations_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "progress_categories"; referencedColumns: ["id"] }
        ];
      };
      academic_periods: {
        Row: {
          id: string;
          school_id: string;
          school_year_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; school_year_id: string; name: string; start_date: string; end_date: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; school_year_id?: string; name?: string; start_date?: string; end_date?: string; is_active?: boolean; updated_at?: string };
        Relationships: [
          { foreignKeyName: "academic_periods_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "academic_periods_school_year_id_fkey"; columns: ["school_year_id"]; isOneToOne: false; referencedRelation: "school_years"; referencedColumns: ["id"] }
        ];
      };
      fee_types: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; description?: string | null; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; description?: string | null; is_active?: boolean; updated_at?: string };
        Relationships: [{ foreignKeyName: "fee_types_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      tuition_configs: {
        Row: {
          id: string;
          school_id: string;
          academic_period_id: string;
          level: string;
          total_amount: number;
          months: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; academic_period_id: string; level: string; total_amount: number; months?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; academic_period_id?: string; level?: string; total_amount?: number; months?: number; updated_at?: string };
        Relationships: [
          { foreignKeyName: "tuition_configs_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "tuition_configs_academic_period_id_fkey"; columns: ["academic_period_id"]; isOneToOne: false; referencedRelation: "academic_periods"; referencedColumns: ["id"] }
        ];
      };
      discounts: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          type: "fixed" | "percentage" | "credit";
          scope: "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom";
          value: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; type: "fixed" | "percentage" | "credit"; scope?: "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom"; value: number; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; type?: "fixed" | "percentage" | "credit"; scope?: "summer_to_sy" | "full_payment" | "early_enrollment" | "sibling" | "custom"; value?: number; is_active?: boolean; updated_at?: string };
        Relationships: [{ foreignKeyName: "discounts_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
      };
      student_credits: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          amount: number;
          reason: string | null;
          applied_to: string | null;
          created_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; amount: number; reason?: string | null; applied_to?: string | null; created_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; amount?: number; reason?: string | null; applied_to?: string | null };
        Relationships: [
          { foreignKeyName: "student_credits_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "student_credits_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] }
        ];
      };
      billing_discounts: {
        Row: {
          id: string;
          billing_record_id: string;
          discount_id: string | null;
          name: string;
          type: "fixed" | "percentage" | "credit";
          value: number;
          created_at: string;
        };
        Insert: { id?: string; billing_record_id: string; discount_id?: string | null; name: string; type: "fixed" | "percentage" | "credit"; value: number; created_at?: string };
        Update: { id?: string; billing_record_id?: string; discount_id?: string | null; name?: string; type?: "fixed" | "percentage" | "credit"; value?: number };
        Relationships: [{ foreignKeyName: "billing_discounts_billing_record_id_fkey"; columns: ["billing_record_id"]; isOneToOne: false; referencedRelation: "billing_records"; referencedColumns: ["id"] }];
      };
      proud_moments: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          created_by: string | null;
          category: string;
          note: string | null;
          photo_path: string | null;
          created_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; created_by?: string | null; category: string; note?: string | null; photo_path?: string | null; created_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; created_by?: string | null; category?: string; note?: string | null; photo_path?: string | null };
        Relationships: [
          { foreignKeyName: "proud_moments_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "proud_moments_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "proud_moments_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      proud_moment_reactions: {
        Row: {
          id: string;
          proud_moment_id: string;
          parent_id: string;
          reaction_type: "proud" | "great_job" | "keep_going";
          created_at: string;
        };
        Insert: { id?: string; proud_moment_id: string; parent_id: string; reaction_type: "proud" | "great_job" | "keep_going"; created_at?: string };
        Update: { id?: string; proud_moment_id?: string; parent_id?: string; reaction_type?: "proud" | "great_job" | "keep_going" };
        Relationships: [
          { foreignKeyName: "proud_moment_reactions_proud_moment_id_fkey"; columns: ["proud_moment_id"]; isOneToOne: false; referencedRelation: "proud_moments"; referencedColumns: ["id"] },
          { foreignKeyName: "proud_moment_reactions_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      external_contacts: {
        Row: {
          id: string;
          school_id: string;
          full_name: string;
          email: string;
          organization_name: string | null;
          role_title: string | null;
          phone: string | null;
          notes: string | null;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; full_name: string; email: string; organization_name?: string | null; role_title?: string | null; phone?: string | null; notes?: string | null; deactivated_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; full_name?: string; email?: string; organization_name?: string | null; role_title?: string | null; phone?: string | null; notes?: string | null; deactivated_at?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "external_contacts_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }
        ];
      };
      child_documents: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          document_type: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting";
          title: string;
          description: string | null;
          status: "draft" | "active" | "shared" | "archived" | "revoked";
          effective_date: string | null;
          review_date: string | null;
          source_kind: "school" | "external_contact" | "parent";
          source_external_contact_id: string | null;
          source_label: string | null;
          current_version_id: string | null;
          created_by: string | null;
          archived_at: string | null;
          archive_reason: string | null;
          revoked_at: string | null;
          revoke_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; document_type: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting"; title: string; description?: string | null; status?: "draft" | "active" | "shared" | "archived" | "revoked"; effective_date?: string | null; review_date?: string | null; source_kind?: "school" | "external_contact" | "parent"; source_external_contact_id?: string | null; source_label?: string | null; current_version_id?: string | null; created_by?: string | null; archived_at?: string | null; archive_reason?: string | null; revoked_at?: string | null; revoke_reason?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; document_type?: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting"; title?: string; description?: string | null; status?: "draft" | "active" | "shared" | "archived" | "revoked"; effective_date?: string | null; review_date?: string | null; source_kind?: "school" | "external_contact" | "parent"; source_external_contact_id?: string | null; source_label?: string | null; current_version_id?: string | null; created_by?: string | null; archived_at?: string | null; archive_reason?: string | null; revoked_at?: string | null; revoke_reason?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "child_documents_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "child_documents_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "child_documents_source_external_contact_id_fkey"; columns: ["source_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] },
          { foreignKeyName: "child_documents_current_version_fk"; columns: ["current_version_id"]; isOneToOne: false; referencedRelation: "child_document_versions"; referencedColumns: ["id"] },
          { foreignKeyName: "child_documents_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      child_document_versions: {
        Row: {
          id: string;
          document_id: string;
          school_id: string;
          version_number: number;
          uploaded_file_id: string | null;
          storage_path: string;
          file_name: string | null;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by_user_id: string | null;
          uploaded_by_external_contact_id: string | null;
          uploaded_by_kind: "school_admin" | "teacher" | "parent" | "external_contact";
          upload_note: string | null;
          is_hidden: boolean;
          hidden_reason: string | null;
          hidden_at: string | null;
          created_at: string;
        };
        Insert: { id?: string; document_id: string; school_id: string; version_number: number; uploaded_file_id?: string | null; storage_path: string; file_name?: string | null; file_size?: number | null; mime_type?: string | null; uploaded_by_user_id?: string | null; uploaded_by_external_contact_id?: string | null; uploaded_by_kind: "school_admin" | "teacher" | "parent" | "external_contact"; upload_note?: string | null; is_hidden?: boolean; hidden_reason?: string | null; hidden_at?: string | null; created_at?: string };
        Update: { id?: string; document_id?: string; school_id?: string; version_number?: number; uploaded_file_id?: string | null; storage_path?: string; file_name?: string | null; file_size?: number | null; mime_type?: string | null; uploaded_by_user_id?: string | null; uploaded_by_external_contact_id?: string | null; uploaded_by_kind?: "school_admin" | "teacher" | "parent" | "external_contact"; upload_note?: string | null; is_hidden?: boolean; hidden_reason?: string | null; hidden_at?: string | null };
        Relationships: [
          { foreignKeyName: "child_document_versions_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "child_documents"; referencedColumns: ["id"] },
          { foreignKeyName: "child_document_versions_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "child_document_versions_uploaded_file_id_fkey"; columns: ["uploaded_file_id"]; isOneToOne: false; referencedRelation: "uploaded_files"; referencedColumns: ["id"] },
          { foreignKeyName: "child_document_versions_uploaded_by_user_id_fkey"; columns: ["uploaded_by_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "child_document_versions_uploaded_by_external_contact_id_fkey"; columns: ["uploaded_by_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] }
        ];
      };
      document_consents: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          granted_by_guardian_id: string | null;
          purpose: string;
          scope: Json;
          recipients: Json;
          allow_download: boolean;
          allow_reshare: boolean;
          status: "pending" | "granted" | "revoked" | "expired";
          starts_at: string | null;
          expires_at: string;
          granted_at: string | null;
          revoked_at: string | null;
          revoked_by_guardian_id: string | null;
          revoke_reason: string | null;
          requested_by_user_id: string | null;
          request_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; granted_by_guardian_id?: string | null; purpose: string; scope: Json; recipients: Json; allow_download?: boolean; allow_reshare?: boolean; status?: "pending" | "granted" | "revoked" | "expired"; starts_at?: string | null; expires_at: string; granted_at?: string | null; revoked_at?: string | null; revoked_by_guardian_id?: string | null; revoke_reason?: string | null; requested_by_user_id?: string | null; request_message?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; granted_by_guardian_id?: string | null; purpose?: string; scope?: Json; recipients?: Json; allow_download?: boolean; allow_reshare?: boolean; status?: "pending" | "granted" | "revoked" | "expired"; starts_at?: string | null; expires_at?: string; granted_at?: string | null; revoked_at?: string | null; revoked_by_guardian_id?: string | null; revoke_reason?: string | null; requested_by_user_id?: string | null; request_message?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "document_consents_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_consents_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "document_consents_granted_by_guardian_id_fkey"; columns: ["granted_by_guardian_id"]; isOneToOne: false; referencedRelation: "guardians"; referencedColumns: ["id"] },
          { foreignKeyName: "document_consents_revoked_by_guardian_id_fkey"; columns: ["revoked_by_guardian_id"]; isOneToOne: false; referencedRelation: "guardians"; referencedColumns: ["id"] },
          { foreignKeyName: "document_consents_requested_by_user_id_fkey"; columns: ["requested_by_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      document_access_grants: {
        Row: {
          id: string;
          document_id: string;
          school_id: string;
          consent_id: string | null;
          grantee_kind: "school" | "school_user" | "external_contact";
          grantee_school_id: string | null;
          grantee_user_id: string | null;
          grantee_external_contact_id: string | null;
          permissions: Json;
          expires_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
          revoke_reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; document_id: string; school_id: string; consent_id?: string | null; grantee_kind: "school" | "school_user" | "external_contact"; grantee_school_id?: string | null; grantee_user_id?: string | null; grantee_external_contact_id?: string | null; permissions?: Json; expires_at: string; revoked_at?: string | null; revoked_by?: string | null; revoke_reason?: string | null; created_by?: string | null; created_at?: string };
        Update: { id?: string; document_id?: string; school_id?: string; consent_id?: string | null; grantee_kind?: "school" | "school_user" | "external_contact"; grantee_school_id?: string | null; grantee_user_id?: string | null; grantee_external_contact_id?: string | null; permissions?: Json; expires_at?: string; revoked_at?: string | null; revoked_by?: string | null; revoke_reason?: string | null; created_by?: string | null };
        Relationships: [
          { foreignKeyName: "document_access_grants_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "child_documents"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_consent_id_fkey"; columns: ["consent_id"]; isOneToOne: false; referencedRelation: "document_consents"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_grantee_school_id_fkey"; columns: ["grantee_school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_grantee_user_id_fkey"; columns: ["grantee_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_grantee_external_contact_id_fkey"; columns: ["grantee_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_revoked_by_fkey"; columns: ["revoked_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_grants_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      document_requests: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          requested_document_type: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting";
          requester_user_id: string | null;
          requester_external_contact_id: string | null;
          requested_from_kind: "parent" | "school" | "external_contact";
          requested_from_school_id: string | null;
          requested_from_external_contact_id: string | null;
          requested_from_guardian_id: string | null;
          reason: string;
          due_date: string | null;
          status: "requested" | "submitted" | "reviewed" | "cancelled";
          fulfilled_with_document_id: string | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; requested_document_type: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting"; requester_user_id?: string | null; requester_external_contact_id?: string | null; requested_from_kind: "parent" | "school" | "external_contact"; requested_from_school_id?: string | null; requested_from_external_contact_id?: string | null; requested_from_guardian_id?: string | null; reason: string; due_date?: string | null; status?: "requested" | "submitted" | "reviewed" | "cancelled"; fulfilled_with_document_id?: string | null; cancelled_at?: string | null; cancelled_reason?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; requested_document_type?: "iep" | "therapy_evaluation" | "therapy_progress" | "school_accommodation" | "medical_certificate" | "dev_pediatrician_report" | "parent_provided" | "other_supporting"; requester_user_id?: string | null; requester_external_contact_id?: string | null; requested_from_kind?: "parent" | "school" | "external_contact"; requested_from_school_id?: string | null; requested_from_external_contact_id?: string | null; requested_from_guardian_id?: string | null; reason?: string; due_date?: string | null; status?: "requested" | "submitted" | "reviewed" | "cancelled"; fulfilled_with_document_id?: string | null; cancelled_at?: string | null; cancelled_reason?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "document_requests_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_requester_user_id_fkey"; columns: ["requester_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_requester_external_contact_id_fkey"; columns: ["requester_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_requested_from_school_id_fkey"; columns: ["requested_from_school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_requested_from_external_contact_id_fkey"; columns: ["requested_from_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_requested_from_guardian_id_fkey"; columns: ["requested_from_guardian_id"]; isOneToOne: false; referencedRelation: "guardians"; referencedColumns: ["id"] },
          { foreignKeyName: "document_requests_fulfilled_with_document_id_fkey"; columns: ["fulfilled_with_document_id"]; isOneToOne: false; referencedRelation: "child_documents"; referencedColumns: ["id"] }
        ];
      };
      document_access_events: {
        Row: {
          id: string;
          document_id: string;
          document_version_id: string | null;
          student_id: string;
          school_id: string;
          actor_user_id: string | null;
          actor_external_contact_id: string | null;
          actor_email: string | null;
          actor_kind: "school_admin" | "teacher" | "parent" | "external_contact" | "super_admin" | "unauthenticated";
          action: "view" | "download" | "signed_url_issued" | "preview_opened" | "access_denied";
          denied_reason: string | null;
          ip: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: { id?: string; document_id: string; document_version_id?: string | null; student_id: string; school_id: string; actor_user_id?: string | null; actor_external_contact_id?: string | null; actor_email?: string | null; actor_kind: "school_admin" | "teacher" | "parent" | "external_contact" | "super_admin" | "unauthenticated"; action: "view" | "download" | "signed_url_issued" | "preview_opened" | "access_denied"; denied_reason?: string | null; ip?: string | null; user_agent?: string | null; created_at?: string };
        Update: { id?: string; document_id?: string; document_version_id?: string | null; student_id?: string; school_id?: string; actor_user_id?: string | null; actor_external_contact_id?: string | null; actor_email?: string | null; actor_kind?: "school_admin" | "teacher" | "parent" | "external_contact" | "super_admin" | "unauthenticated"; action?: "view" | "download" | "signed_url_issued" | "preview_opened" | "access_denied"; denied_reason?: string | null; ip?: string | null; user_agent?: string | null };
        Relationships: [
          { foreignKeyName: "document_access_events_actor_external_contact_id_fkey"; columns: ["actor_external_contact_id"]; isOneToOne: false; referencedRelation: "external_contacts"; referencedColumns: ["id"] },
          { foreignKeyName: "document_access_events_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }
        ];
      };
      student_plans: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          school_year_id: string | null;
          plan_type: "iep" | "support" | "behavior" | "other";
          title: string;
          status: "draft" | "submitted" | "in_review" | "approved" | "archived";
          diagnosis: string | null;
          strengths: string | null;
          areas_of_need: string | null;
          background_notes: string | null;
          parent_notes: string | null;
          parent_concerns: string | null;
          home_support_notes: string | null;
          review_date: string | null;
          reviewed_by_teacher_id: string | null;
          reviewed_by_admin_id: string | null;
          parent_acknowledged_at: string | null;
          parent_acknowledged_by_guardian_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          archived_at: string | null;
          archive_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; student_id: string; school_year_id?: string | null; plan_type?: "iep" | "support" | "behavior" | "other"; title: string; status?: "draft" | "submitted" | "in_review" | "approved" | "archived"; diagnosis?: string | null; strengths?: string | null; areas_of_need?: string | null; background_notes?: string | null; parent_notes?: string | null; parent_concerns?: string | null; home_support_notes?: string | null; review_date?: string | null; reviewed_by_teacher_id?: string | null; reviewed_by_admin_id?: string | null; parent_acknowledged_at?: string | null; parent_acknowledged_by_guardian_id?: string | null; approved_at?: string | null; approved_by?: string | null; archived_at?: string | null; archive_reason?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; student_id?: string; school_year_id?: string | null; plan_type?: "iep" | "support" | "behavior" | "other"; title?: string; status?: "draft" | "submitted" | "in_review" | "approved" | "archived"; diagnosis?: string | null; strengths?: string | null; areas_of_need?: string | null; background_notes?: string | null; parent_notes?: string | null; parent_concerns?: string | null; home_support_notes?: string | null; review_date?: string | null; reviewed_by_teacher_id?: string | null; reviewed_by_admin_id?: string | null; parent_acknowledged_at?: string | null; parent_acknowledged_by_guardian_id?: string | null; approved_at?: string | null; approved_by?: string | null; archived_at?: string | null; archive_reason?: string | null; created_by?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "student_plans_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_school_year_id_fkey"; columns: ["school_year_id"]; isOneToOne: false; referencedRelation: "school_years"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_reviewed_by_teacher_id_fkey"; columns: ["reviewed_by_teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_reviewed_by_admin_id_fkey"; columns: ["reviewed_by_admin_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_parent_acknowledged_by_guardian_id_fkey"; columns: ["parent_acknowledged_by_guardian_id"]; isOneToOne: false; referencedRelation: "guardians"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_approved_by_fkey"; columns: ["approved_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plans_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      student_plan_goals: {
        Row: {
          id: string;
          plan_id: string;
          domain: string | null;
          description: string;
          target_date: string | null;
          measurement_method: string | null;
          baseline: string | null;
          success_criteria: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: { id?: string; plan_id: string; domain?: string | null; description: string; target_date?: string | null; measurement_method?: string | null; baseline?: string | null; success_criteria?: string | null; sort_order?: number; created_at?: string };
        Update: { id?: string; plan_id?: string; domain?: string | null; description?: string; target_date?: string | null; measurement_method?: string | null; baseline?: string | null; success_criteria?: string | null; sort_order?: number };
        Relationships: [
          { foreignKeyName: "student_plan_goals_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "student_plans"; referencedColumns: ["id"] }
        ];
      };
      student_plan_interventions: {
        Row: {
          id: string;
          plan_id: string;
          strategy: string;
          frequency: string | null;
          responsible_person: string | null;
          environment: string | null;
          notes: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: { id?: string; plan_id: string; strategy: string; frequency?: string | null; responsible_person?: string | null; environment?: string | null; notes?: string | null; sort_order?: number; created_at?: string };
        Update: { id?: string; plan_id?: string; strategy?: string; frequency?: string | null; responsible_person?: string | null; environment?: string | null; notes?: string | null; sort_order?: number };
        Relationships: [
          { foreignKeyName: "student_plan_interventions_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "student_plans"; referencedColumns: ["id"] }
        ];
      };
      student_plan_progress_entries: {
        Row: {
          id: string;
          plan_id: string;
          linked_goal_id: string | null;
          entry_date: string;
          progress_note: string;
          observed_by: string | null;
          next_step: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; plan_id: string; linked_goal_id?: string | null; entry_date?: string; progress_note: string; observed_by?: string | null; next_step?: string | null; created_by?: string | null; created_at?: string };
        Update: { id?: string; plan_id?: string; linked_goal_id?: string | null; entry_date?: string; progress_note?: string; observed_by?: string | null; next_step?: string | null; created_by?: string | null };
        Relationships: [
          { foreignKeyName: "student_plan_progress_entries_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "student_plans"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plan_progress_entries_linked_goal_id_fkey"; columns: ["linked_goal_id"]; isOneToOne: false; referencedRelation: "student_plan_goals"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plan_progress_entries_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
      student_plan_attachments: {
        Row: {
          id: string;
          plan_id: string;
          document_id: string;
          attached_by: string | null;
          attached_at: string;
        };
        Insert: { id?: string; plan_id: string; document_id: string; attached_by?: string | null; attached_at?: string };
        Update: { id?: string; plan_id?: string; document_id?: string; attached_by?: string | null; attached_at?: string };
        Relationships: [
          { foreignKeyName: "student_plan_attachments_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "student_plans"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plan_attachments_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "child_documents"; referencedColumns: ["id"] },
          { foreignKeyName: "student_plan_attachments_attached_by_fkey"; columns: ["attached_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      log_document_access: {
        Args: {
          p_doc_id: string;
          p_action: "view" | "download" | "signed_url_issued" | "preview_opened";
          p_ip: string;
          p_user_agent: string;
        };
        Returns: Json;
      };
      log_document_access_for_organizations: {
        Args: {
          p_doc_id: string;
          p_action: "view" | "download" | "signed_url_issued" | "preview_opened";
          p_ip?: string | null;
          p_user_agent?: string | null;
        };
        Returns: Json;
      };
      list_school_staff_for_sharing: {
        Args: { p_school_id: string };
        Returns: {
          id: string;
          full_name: string;
          email: string;
          role: "super_admin" | "school_admin" | "teacher" | "parent";
        }[];
      };
      list_documents_for_organization: {
        Args: { p_org_id: string };
        Returns: {
          document_id: string;
          title: string;
          document_type:
            | "iep"
            | "therapy_evaluation"
            | "therapy_progress"
            | "school_accommodation"
            | "medical_certificate"
            | "dev_pediatrician_report"
            | "parent_provided"
            | "other_supporting";
          doc_status: "draft" | "active" | "shared" | "archived" | "revoked";
          current_version_id: string;
          version_number: number;
          mime_type: string;
          file_name: string;
          file_size_bytes: number | null;
          child_profile_id: string | null;
          permissions: Json;
          grant_valid_until: string;
          grant_created_at: string;
        }[];
      };
      list_clinic_organizations_for_sharing: {
        Args: { p_query?: string | null; p_limit?: number };
        Returns: {
          id: string;
          name: string;
          kind: string;
          country_code: string | null;
          created_at: string;
        }[];
      };
      create_clinic_organization_for_sharing: {
        Args: {
          p_kind: string;
          p_name: string;
          p_country_code?: string | null;
        };
        Returns: string;
      };
      lookup_clinic_organizations: {
        Args: { p_ids: string[] };
        Returns: {
          id: string;
          name: string;
          kind: string;
        }[];
      };
      log_clinic_document_access: {
        Args: {
          p_doc_id: string;
          p_action: string;
          p_ip?: string | null;
          p_user_agent?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    PostgrestVersion: "12";
  };
};
