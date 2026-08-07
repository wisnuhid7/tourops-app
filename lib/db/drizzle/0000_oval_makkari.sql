CREATE TYPE "public"."pricing_adjustment_stage" AS ENUM('before_margin', 'after_margin', 'after_free_policy');--> statement-breakpoint
CREATE TYPE "public"."pricing_adjustment_type" AS ENUM('tax', 'service_fee', 'booking_fee', 'surcharge', 'discount');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'reassigned', 'unassigned');--> statement-breakpoint
CREATE TYPE "public"."assistance_type" AS ENUM('driver_chaperone', 'professional_guide');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('draft', 'submitted', 'confirmed', 'in_operation', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('leader_group', 'join_leader_group', 'join_public_group', 'private_family', 'custom_leader', 'custom_family');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."client_account_type" AS ENUM('individual', 'family_organizer', 'group_organizer', 'tour_leader', 'organization');--> statement-breakpoint
CREATE TYPE "public"."departure_status" AS ENUM('open', 'closed', 'sold_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('uploaded', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('passport', 'id_doc', 'visa', 'eticket', 'pnr', 'hotel_confirm', 'voucher', 'transport_confirm', 'guide_confirm', 'sight_ticket', 'quote', 'receipt', 'other');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('pending', 'in_progress', 'blocked', 'completed');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."margin_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."message_visibility" AS ENUM('customer_visible', 'internal_only');--> statement-breakpoint
CREATE TYPE "public"."occupancy_type" AS ENUM('double', 'single', 'third_person', 'child', 'matrimonial', 'infant');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'card', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_status" AS ENUM('pending', 'paid', 'partially_paid', 'late', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."pricing_quote_status" AS ENUM('draft', 'final', 'archived', 'pending_approval', 'approved', 'rejected', 'sent', 'viewed', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rate_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refund_state" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('none', 'pending', 'partial', 'full', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rounding_rule" AS ENUM('cent', 'unit_nearest', 'unit_up', 'five_up', 'ten_up');--> statement-breakpoint
CREATE TYPE "public"."service_request_status" AS ENUM('pending', 'sent', 'confirmed', 'rejected', 'changes_requested', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('airline', 'hotel', 'transport', 'guide', 'sights');--> statement-breakpoint
CREATE TYPE "public"."sight_category" AS ENUM('museum', 'landmark', 'park', 'religious', 'entertainment', 'nature', 'historical', 'other');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'done', 'skipped', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."transport_booking_status" AS ENUM('requested', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."transport_invoice_status" AS ENUM('submitted', 'approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."traveler_invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'travel_agent', 'customer', 'airline_supplier', 'country_manager', 'city_manager', 'hotel_manager', 'transport_manager', 'guide_manager', 'sights_manager', 'content_editor', 'flight_agent', 'tour_builder', 'supplier', 'tour_leader', 'accounting', 'operations_manager', 'support_agent');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('not_assigned', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" varchar NOT NULL,
	"booking_id" varchar,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" varchar NOT NULL,
	"click_id" text,
	"ip_address" text,
	"user_agent" text,
	"converted" boolean DEFAULT false,
	"booking_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"commission_rate" numeric DEFAULT '10',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "affiliates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ai_generated_itineraries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar,
	"title" text,
	"content" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text,
	"status" text DEFAULT 'pending',
	"result_itinerary_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"prompt" text,
	"response_tokens" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "airfare_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"airline" text,
	"rate_per_person" numeric NOT NULL,
	"child_rate" numeric,
	"infant_rate" numeric,
	"currency" text DEFAULT 'USD' NOT NULL,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "airline_agencies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_ids" text[],
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"website" text,
	"specializations" text[],
	"is_active" boolean DEFAULT true,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "airline_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text,
	"route_from" text,
	"route_to" text,
	"airline_name" text NOT NULL,
	"airline_code" text,
	"cabin_class" text,
	"currency" text DEFAULT 'USD',
	"valid_from" text,
	"valid_to" text,
	"price" numeric,
	"baggage_allowance" text,
	"notes" text,
	"status" "rate_status" DEFAULT 'draft',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "airports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city_id" varchar NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "airports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"action" text NOT NULL,
	"changed_by" varchar,
	"changed_by_name" text,
	"previous_value" text,
	"new_value" text,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"country_code" text,
	"service_type" "service_type" NOT NULL,
	"assigned_user_id" varchar,
	"assigned_by" varchar,
	"assignment_status" "assignment_status" DEFAULT 'assigned',
	"notes" text,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_change_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"requested_by" varchar NOT NULL,
	"request_type" text NOT NULL,
	"details" text NOT NULL,
	"pax_delta" integer,
	"status" "change_request_status" DEFAULT 'pending' NOT NULL,
	"resolution_notes" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_payment_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"installment_number" integer NOT NULL,
	"label" text NOT NULL,
	"percentage" numeric NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_amount" numeric DEFAULT '0' NOT NULL,
	"status" "payment_schedule_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"label" text NOT NULL,
	"room_type" text NOT NULL,
	"capacity" integer DEFAULT 2 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_service_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"service_type" "service_type" NOT NULL,
	"supplier_user_id" varchar NOT NULL,
	"service_date" timestamp,
	"location" text,
	"quantity" integer DEFAULT 1,
	"pax_count" integer,
	"agreed_rate" numeric,
	"currency" text DEFAULT 'USD',
	"status" "service_request_status" DEFAULT 'pending' NOT NULL,
	"notes_for_supplier" text,
	"supplier_response" text,
	"responded_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_workflows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"country_code" text,
	"service_type" "service_type" NOT NULL,
	"assigned_user_id" varchar,
	"workflow_status" "workflow_status" DEFAULT 'not_assigned',
	"current_step" text,
	"notes" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_code" text NOT NULL,
	"tour_id" varchar,
	"departure_id" varchar,
	"customer_id" varchar NOT NULL,
	"booking_type" "booking_type" NOT NULL,
	"group_name" text,
	"leader_user_id" varchar,
	"tour_leader_user_id" varchar,
	"join_code" text,
	"party_size_expected" integer DEFAULT 1,
	"status" "booking_status" DEFAULT 'submitted',
	"fulfillment_status" "fulfillment_status" DEFAULT 'pending',
	"total_price" integer,
	"currency" text DEFAULT 'USD',
	"room_type" text,
	"accommodation_cost" numeric,
	"notes" text,
	"internal_notes" text,
	"is_urgent" boolean DEFAULT false,
	"affiliate_id" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bookings_booking_code_unique" UNIQUE("booking_code"),
	CONSTRAINT "bookings_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "bus_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"seats" integer NOT NULL,
	"cost_per_day" numeric,
	"cost_per_mile" numeric,
	"description" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ascii_name" text,
	"alternate_names" text[],
	"country_id" varchar NOT NULL,
	"population" integer,
	"latitude" numeric,
	"longitude" numeric,
	"timezone" text,
	"geoname_id" text,
	"osm_id" text,
	"city_rank" integer DEFAULT 0,
	"is_capital" boolean DEFAULT false,
	"is_tourism_city" boolean DEFAULT false,
	"is_airport_city" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"source_name" text,
	"last_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"iso3" text,
	"name" text NOT NULL,
	"capital_city" text,
	"continent" text,
	"region" text,
	"subregion" text,
	"currency_code" text,
	"currency_name" text,
	"languages" text[],
	"phone_code" text,
	"flag_url" text,
	"latitude" numeric,
	"longitude" numeric,
	"population" integer,
	"source_name" text,
	"source_external_id" text,
	"last_synced_at" timestamp,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "custom_tour_day_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_tour_day_id" varchar NOT NULL,
	"type" text NOT NULL,
	"reference_id" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "custom_tour_days" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_tour_id" varchar NOT NULL,
	"day_number" integer NOT NULL,
	"title" text
);
--> statement-breakpoint
CREATE TABLE "custom_tours" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft',
	"budget" numeric,
	"pax" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_quality_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"score" integer,
	"issues" jsonb,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"api_key" text,
	"is_active" boolean DEFAULT true,
	"last_used_at" timestamp,
	CONSTRAINT "data_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"traveler_id" varchar,
	"workflow_step_id" varchar,
	"doc_type" "doc_type" NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text,
	"uploaded_by" varchar,
	"doc_status" "doc_status" DEFAULT 'uploaded',
	"reviewed_by" varchar,
	"review_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" numeric NOT NULL,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"entered_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flight_offer_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar,
	"airline" text,
	"flight_number" text,
	"departure_airport" text,
	"arrival_airport" text,
	"departure_time" timestamp,
	"arrival_time" timestamp,
	"price" numeric,
	"currency" text,
	"raw_offer_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "flight_price_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_airport" text NOT NULL,
	"destination_airport" text NOT NULL,
	"departure_date" text NOT NULL,
	"return_date" text,
	"airline" text,
	"price_total" numeric NOT NULL,
	"currency" text DEFAULT 'USD',
	"supplier_name" text,
	"searched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "group_size_bands" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"min_pax" integer NOT NULL,
	"max_pax" integer NOT NULL,
	"assistance_type" "assistance_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text,
	"city_base" text,
	"guide_name" text NOT NULL,
	"guide_code" text,
	"language" text,
	"email" text,
	"phone" text,
	"photo_url" text,
	"age" integer,
	"rate_unit" text,
	"currency" text DEFAULT 'USD',
	"valid_from" text,
	"valid_to" text,
	"price" numeric,
	"license_level" text,
	"notes" text,
	"status" "rate_status" DEFAULT 'draft',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"translations" jsonb
);
--> statement-breakpoint
CREATE TABLE "hotel_amenities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" varchar NOT NULL,
	"amenity" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" varchar NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"dominant_color" text
);
--> statement-breakpoint
CREATE TABLE "hotel_price_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" varchar NOT NULL,
	"check_in_date" text NOT NULL,
	"check_out_date" text NOT NULL,
	"adults" integer DEFAULT 2,
	"rooms" integer DEFAULT 1,
	"price_total" numeric NOT NULL,
	"currency" text DEFAULT 'USD',
	"supplier_name" text,
	"searched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hotel_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text,
	"city" text,
	"hotel_name" text NOT NULL,
	"hotel_code" text,
	"room_type" text,
	"meal_plan" text,
	"currency" text DEFAULT 'USD',
	"valid_from" text,
	"valid_to" text,
	"price_per_room_per_night" numeric,
	"tax_included" boolean DEFAULT false,
	"min_nights" integer,
	"blackout_dates" text,
	"notes" text,
	"status" "rate_status" DEFAULT 'draft',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hotel_room_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"capacity" integer,
	"base_price" numeric
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city_id" varchar NOT NULL,
	"address" text,
	"google_maps_url" text,
	"description" text,
	"slug" text,
	"status" varchar DEFAULT 'draft',
	"created_by" varchar,
	"star_rating" integer,
	"guest_rating" numeric,
	"review_count" integer DEFAULT 0,
	"amenities" text[],
	"room_types" jsonb,
	"room_rate_matrimonial" numeric,
	"room_rate_double" numeric,
	"room_rate_triple" numeric,
	"checkin_time" text,
	"checkout_time" text,
	"hotel_policy" text,
	"cancellation_policy" text,
	"base_price" numeric,
	"estimated_price_min" numeric,
	"estimated_price_max" numeric,
	"currency" text DEFAULT 'USD',
	"image_url" text,
	"contact_phone" text,
	"contact_email" text,
	"website" text,
	"source_hotel_id" text,
	"affiliate_url" text,
	"last_price_checked_at" timestamp,
	"is_active" boolean DEFAULT true,
	"translations" jsonb,
	CONSTRAINT "hotels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "import_job_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"records_processed" integer DEFAULT 0,
	"errors" jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"status" text NOT NULL,
	"total_records" integer DEFAULT 0,
	"processed_records" integer DEFAULT 0,
	"errors" text,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"reported_by" varchar NOT NULL,
	"severity" "incident_severity" DEFAULT 'low' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"resolution_notes" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"status" "invoice_status" DEFAULT 'draft',
	"due_date" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "markup_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" varchar,
	"service_type" text,
	"markup_percentage" numeric NOT NULL,
	"min_profit" numeric DEFAULT '0',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "master_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"workflow_id" varchar,
	"sender_user_id" varchar NOT NULL,
	"sender_name" text,
	"message_visibility" "message_visibility" DEFAULT 'customer_visible',
	"message_text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payment_id" varchar,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"customer_id" varchar,
	"invoice_id" varchar,
	"provider" text DEFAULT 'manual',
	"payment_intent_id" text,
	"transaction_id" text,
	"amount" integer NOT NULL,
	"subtotal" integer,
	"taxes" integer DEFAULT 0,
	"fees" integer DEFAULT 0,
	"discount" integer DEFAULT 0,
	"refunded_amount" integer DEFAULT 0,
	"currency" text DEFAULT 'USD',
	"payment_method" "payment_method" DEFAULT 'bank_transfer',
	"payment_status" "payment_status" DEFAULT 'pending',
	"refund_status" "refund_status" DEFAULT 'none',
	"receipt_url" text,
	"metadata" jsonb,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_adjustment_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "pricing_adjustment_type" NOT NULL,
	"amount_type" "margin_type" DEFAULT 'percentage' NOT NULL,
	"amount" numeric NOT NULL,
	"application_order" integer DEFAULT 0 NOT NULL,
	"applies_to_stage" "pricing_adjustment_stage" DEFAULT 'after_free_policy' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_quote_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"hotel_choice" integer NOT NULL,
	"hotel_id" varchar,
	"hotel_name" text,
	"occupancy" "occupancy_type" NOT NULL,
	"hotel_nightly_rate" numeric DEFAULT '0' NOT NULL,
	"hotel_cost_total" numeric DEFAULT '0' NOT NULL,
	"base_cost" numeric DEFAULT '0' NOT NULL,
	"margin_amount" numeric DEFAULT '0' NOT NULL,
	"free_adjustment_amount" numeric DEFAULT '0' NOT NULL,
	"adjustment_items" jsonb,
	"selling_price" numeric DEFAULT '0' NOT NULL,
	"selling_price_exact" numeric
);
--> statement-breakpoint
CREATE TABLE "pricing_quote_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"line_item_id" varchar NOT NULL,
	"field_name" text DEFAULT 'selling_price' NOT NULL,
	"original_value" numeric NOT NULL,
	"override_value" numeric NOT NULL,
	"reason" text NOT NULL,
	"created_by" varchar,
	"approved_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" varchar NOT NULL,
	"departure_id" varchar,
	"pricing_rule_id" varchar,
	"group_size_band_id" varchar,
	"pax_count" integer NOT NULL,
	"nights" integer DEFAULT 0 NOT NULL,
	"assistance_type" "assistance_type" NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "pricing_quote_status" DEFAULT 'draft' NOT NULL,
	"transportation_share" numeric DEFAULT '0' NOT NULL,
	"guide_driver_share" numeric DEFAULT '0' NOT NULL,
	"sightseeing_share" numeric DEFAULT '0' NOT NULL,
	"airfare_per_person" numeric DEFAULT '0' NOT NULL,
	"base_cost_per_person" numeric DEFAULT '0' NOT NULL,
	"total_group_cost" numeric DEFAULT '0' NOT NULL,
	"free_adjustment_factor" numeric DEFAULT '1' NOT NULL,
	"margin_type" "margin_type" DEFAULT 'percentage' NOT NULL,
	"margin_value" numeric DEFAULT '0' NOT NULL,
	"notes" text,
	"calculation_meta" jsonb,
	"customer_id" varchar,
	"share_token" varchar DEFAULT gen_random_uuid() NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tour_id" varchar,
	"margin_type" "margin_type" DEFAULT 'percentage' NOT NULL,
	"margin_value" numeric DEFAULT '20' NOT NULL,
	"free_passenger_paying" integer DEFAULT 3 NOT NULL,
	"free_passenger_free" integer DEFAULT 1 NOT NULL,
	"rounding_rule" "rounding_rule" DEFAULT 'cent' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_seasons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"destination_id" varchar,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"provider_refund_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"reason" text NOT NULL,
	"notes" text,
	"status" "refund_state" DEFAULT 'pending',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "scraper_errors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"url" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scraper_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"target" text NOT NULL,
	"status" text,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seed_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"report" jsonb,
	"error" text,
	"started_by" varchar,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sight_hours" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sight_id" varchar NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" text,
	"close_time" text,
	"is_closed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "sight_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sight_id" varchar NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"license_raw" text,
	"author" text,
	"width" integer,
	"height" integer,
	"dominant_color" text
);
--> statement-breakpoint
CREATE TABLE "sight_ticket_prices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sight_id" varchar NOT NULL,
	"ticket_type" text NOT NULL,
	"price" numeric NOT NULL,
	"currency" text DEFAULT 'USD',
	"description" text
);
--> statement-breakpoint
CREATE TABLE "sights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"city_id" varchar NOT NULL,
	"status" varchar DEFAULT 'draft',
	"description" text,
	"description_short" text,
	"long_description" text,
	"sight_category" "sight_category" DEFAULT 'other',
	"subcategories" text[],
	"latitude" numeric,
	"longitude" numeric,
	"official_website" text,
	"phone" text,
	"email" text,
	"opening_hours_raw" text,
	"opening_hours_structured" jsonb,
	"ticket_required" boolean DEFAULT false,
	"individual_ticket_cost" numeric,
	"ticket_cost_child" numeric,
	"group_ticket_cost" numeric,
	"ticket_currency" text DEFAULT 'USD',
	"is_free" boolean DEFAULT false,
	"estimated_duration" text,
	"best_time_to_visit" text,
	"image_url" text,
	"address" text,
	"accessibility_notes" text,
	"dress_code" text,
	"safety_notes" text,
	"booking_required" boolean DEFAULT false,
	"source_name" text,
	"source_external_id" text,
	"source_url" text,
	"data_quality_score" integer DEFAULT 0,
	"last_synced_at" timestamp,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "sights_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sights_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text,
	"city" text,
	"attraction_name" text NOT NULL,
	"attraction_code" text,
	"ticket_type" text,
	"currency" text DEFAULT 'USD',
	"valid_from" text,
	"valid_to" text,
	"price_per_person" numeric,
	"requires_timeslot" boolean DEFAULT false,
	"notes" text,
	"status" "rate_status" DEFAULT 'draft',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tour_day_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_day_id" varchar NOT NULL,
	"item_type" text NOT NULL,
	"start_time" text,
	"end_time" text,
	"title" text NOT NULL,
	"description" text,
	"cost" numeric DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sight_id" varchar,
	"hotel_id" varchar,
	"guide_id" varchar,
	"flight_snapshot_id" varchar,
	"hotel_snapshot_id" varchar,
	"is_optional" boolean DEFAULT false NOT NULL,
	"booking_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"translations" jsonb
);
--> statement-breakpoint
CREATE TABLE "tour_days" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" varchar NOT NULL,
	"day_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"country_code" text,
	"city" text,
	"activities" text,
	"image_url" text,
	"translations" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tour_departures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" varchar NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"capacity_total" integer DEFAULT 20 NOT NULL,
	"capacity_booked" integer DEFAULT 0,
	"departure_airport_id" varchar,
	"arrival_airport_id" varchar,
	"status" "departure_status" DEFAULT 'open',
	"public_join_enabled" boolean DEFAULT true,
	"booking_cutoff_date" text,
	"price_per_person" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "tour_quote_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"description" text,
	"price" numeric
);
--> statement-breakpoint
CREATE TABLE "tour_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_tour_id" varchar NOT NULL,
	"supplier_id" varchar,
	"total_price" numeric,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"highlights" text,
	"inclusions" text,
	"exclusions" text,
	"image_url" text,
	"gallery_urls" text[],
	"duration" integer DEFAULT 1 NOT NULL,
	"base_price" numeric DEFAULT '0' NOT NULL,
	"markup_amount" numeric DEFAULT '0' NOT NULL,
	"total_price" numeric DEFAULT '0' NOT NULL,
	"is_price_confirmed" boolean DEFAULT false NOT NULL,
	"child_price" numeric,
	"single_supplement" numeric,
	"countries" text[],
	"tags" text[],
	"category" text,
	"internal_notes" text,
	"translations" jsonb,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tours_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "transport_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar,
	"tour_id" varchar,
	"company_id" varchar NOT NULL,
	"route_id" varchar,
	"bus_type_id" varchar,
	"service_date" text,
	"service_end_date" text,
	"status" "transport_booking_status" DEFAULT 'requested',
	"cost_quoted" numeric,
	"confirmed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country_id" varchar,
	"vehicle_types" text[],
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"bank_name" text,
	"bank_account_number" text,
	"bank_swift" text,
	"bank_iban" text,
	"tax_id" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "transport_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"transport_booking_id" varchar,
	"invoice_number" text NOT NULL,
	"service_details" text,
	"amount" numeric NOT NULL,
	"status" "transport_invoice_status" DEFAULT 'submitted',
	"submitted_at" timestamp DEFAULT now(),
	"approved_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "transport_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"invoice_id" varchar,
	"tour_id" varchar,
	"amount" numeric NOT NULL,
	"payment_date" text,
	"payment_method" text,
	"reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text,
	"city_base" text,
	"vendor_name" text NOT NULL,
	"vendor_code" text,
	"vehicle_type" text,
	"seat_capacity" integer,
	"rate_mode" text,
	"currency" text DEFAULT 'USD',
	"valid_from" text,
	"valid_to" text,
	"base_price" numeric,
	"included_hours" integer,
	"included_km" integer,
	"overtime_per_hour" numeric,
	"extra_per_km" numeric,
	"route_from_city" text,
	"route_to_city" text,
	"notes" text,
	"status" "rate_status" DEFAULT 'draft',
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_route_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar NOT NULL,
	"bus_type_id" varchar NOT NULL,
	"cost_per_trip" numeric NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"from_city" text,
	"to_city" text,
	"distance_miles" numeric,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "traveler_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"traveler_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "traveler_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "traveler_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "travelers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"dob" text,
	"nationality" text,
	"passport_number" text,
	"passport_expiry" text,
	"gender" text,
	"special_needs" text,
	"email" text,
	"phone" text,
	"dietary_notes" text,
	"mobility_notes" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"rooming_preference" text,
	"terms_accepted_at" timestamp,
	"user_id" varchar,
	"room_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"account_type" "client_account_type",
	"phone" text,
	"company_name" text,
	"country_code" text,
	"city_id" varchar,
	"transport_company_id" varchar,
	"is_tour_leader" boolean DEFAULT false,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"step_code" text NOT NULL,
	"step_name" text NOT NULL,
	"step_status" "step_status" DEFAULT 'pending',
	"updated_by" varchar,
	"notes" text,
	"due_date" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar NOT NULL,
	"type" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"username" varchar,
	"password_hash" varchar,
	"email_verified" boolean DEFAULT false,
	"totp_secret" varchar,
	"totp_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "airfare_rates_route_idx" ON "airfare_rates" USING btree ("origin","destination");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "booking_assignments_booking_id_idx" ON "booking_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_assignments_assigned_user_id_idx" ON "booking_assignments" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "booking_change_requests_booking_idx" ON "booking_change_requests" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_payment_schedules_booking_idx" ON "booking_payment_schedules" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_schedules_unique_installment" ON "booking_payment_schedules" USING btree ("booking_id","installment_number");--> statement-breakpoint
CREATE INDEX "booking_rooms_booking_idx" ON "booking_rooms" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_rooms_unique_label" ON "booking_rooms" USING btree ("booking_id","label");--> statement-breakpoint
CREATE INDEX "booking_service_requests_booking_idx" ON "booking_service_requests" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_service_requests_supplier_idx" ON "booking_service_requests" USING btree ("supplier_user_id");--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_idx" ON "booking_status_history" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_workflows_booking_id_idx" ON "booking_workflows" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_workflows_assigned_user_id_idx" ON "booking_workflows" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "booking_workflows_status_idx" ON "booking_workflows" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX "bookings_customer_id_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_tour_id_idx" ON "bookings" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "bookings_departure_id_idx" ON "bookings" USING btree ("departure_id");--> statement-breakpoint
CREATE INDEX "bookings_code_idx" ON "bookings" USING btree ("booking_code");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exchange_rates_pair_idx" ON "exchange_rates" USING btree ("source_currency","target_currency");--> statement-breakpoint
CREATE UNIQUE INDEX "group_size_bands_label_idx" ON "group_size_bands" USING btree ("label");--> statement-breakpoint
CREATE INDEX "incident_reports_booking_idx" ON "incident_reports" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_intent_idx" ON "payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "pricing_adjustment_rules_order_idx" ON "pricing_adjustment_rules" USING btree ("application_order");--> statement-breakpoint
CREATE INDEX "pricing_quote_line_items_quote_id_idx" ON "pricing_quote_line_items" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_quote_line_items_choice_occ_idx" ON "pricing_quote_line_items" USING btree ("quote_id","hotel_choice","occupancy");--> statement-breakpoint
CREATE INDEX "pricing_quote_overrides_quote_id_idx" ON "pricing_quote_overrides" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "pricing_quotes_tour_id_idx" ON "pricing_quotes" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "pricing_quotes_departure_id_idx" ON "pricing_quotes" USING btree ("departure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_quotes_share_token_idx" ON "pricing_quotes" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "pricing_rules_tour_id_idx" ON "pricing_rules" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "pricing_seasons_date_range_idx" ON "pricing_seasons" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "pricing_seasons_priority_idx" ON "pricing_seasons" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "tour_day_items_day_id_idx" ON "tour_day_items" USING btree ("tour_day_id");--> statement-breakpoint
CREATE INDEX "tour_days_tour_id_idx" ON "tour_days" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "tour_departures_tour_id_idx" ON "tour_departures" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "tour_departures_status_idx" ON "tour_departures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tours_category_idx" ON "tours" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tours_published_idx" ON "tours" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "traveler_invitations_traveler_idx" ON "traveler_invitations" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "traveler_invitations_booking_idx" ON "traveler_invitations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "travelers_booking_id_idx" ON "travelers" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "travelers_user_id_idx" ON "travelers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_user_id_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_status_idx" ON "workflow_steps" USING btree ("step_status");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");