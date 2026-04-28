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
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; name: string; trial_start_date?: string | null; trial_end_date?: string | null; trial_status?: "active" | "expired" | "converted"; logo_url?: string | null; primary_color?: string | null; accent_color?: string | null; report_footer_text?: string | null; text_size_scale?: "default" | "large" | "extra_large"; spacing_scale?: "compact" | "default" | "relaxed"; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; trial_start_date?: string | null; trial_end_date?: string | null; trial_status?: "active" | "expired" | "converted"; logo_url?: string | null; primary_color?: string | null; accent_color?: string | null; report_footer_text?: string | null; text_size_scale?: "default" | "large" | "extra_large"; spacing_scale?: "compact" | "default" | "relaxed"; updated_at?: string };
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
          status: "draft" | "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; name: string; start_date: string; end_date: string; status?: "draft" | "active" | "archived"; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; name?: string; start_date?: string; end_date?: string; status?: "draft" | "active" | "archived"; updated_at?: string };
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
          level: string | null;
          start_time: string;
          end_time: string;
          capacity: number;
          is_active: boolean;
          next_class_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; school_year_id: string; name: string; level?: string | null; start_time: string; end_time: string; capacity?: number; is_active?: boolean; academic_period_id?: string | null; next_class_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; school_year_id?: string; name?: string; level?: string | null; start_time?: string; end_time?: string; capacity?: number; is_active?: boolean; academic_period_id?: string | null; next_class_id?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "classes_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "classes_school_year_id_fkey"; columns: ["school_year_id"]; isOneToOne: false; referencedRelation: "school_years"; referencedColumns: ["id"] }
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
          { foreignKeyName: "class_teachers_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
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
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; school_id: string; first_name: string; last_name: string; date_of_birth?: string | null; gender?: string | null; photo_url?: string | null; notes?: string | null; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; school_id?: string; first_name?: string; last_name?: string; date_of_birth?: string | null; gender?: string | null; photo_url?: string | null; notes?: string | null; is_active?: boolean; updated_at?: string };
        Relationships: [{ foreignKeyName: "students_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"] }];
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    PostgrestVersion: "12";
  };
};
