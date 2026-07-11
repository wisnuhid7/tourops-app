--
-- PostgreSQL database dump
--

\restrict qJevmHAGrGUcYON5xi2tgEVdsofbRyc2REIcmSlTReSjvOZ4TlIJrxW86Y0mfGg

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: assignment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assignment_status AS ENUM (
    'assigned',
    'reassigned',
    'unassigned'
);


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'draft',
    'submitted',
    'confirmed',
    'cancelled',
    'completed'
);


--
-- Name: booking_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_type AS ENUM (
    'leader_group',
    'join_leader_group',
    'join_public_group',
    'private_family',
    'custom_leader',
    'custom_family'
);


--
-- Name: departure_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.departure_status AS ENUM (
    'open',
    'closed',
    'sold_out',
    'cancelled'
);


--
-- Name: doc_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.doc_status AS ENUM (
    'uploaded',
    'approved',
    'rejected'
);


--
-- Name: doc_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.doc_type AS ENUM (
    'passport',
    'id_doc',
    'visa',
    'eticket',
    'pnr',
    'hotel_confirm',
    'voucher',
    'transport_confirm',
    'guide_confirm',
    'sight_ticket',
    'quote',
    'receipt',
    'other'
);


--
-- Name: fulfillment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fulfillment_status AS ENUM (
    'pending',
    'in_progress',
    'blocked',
    'completed'
);


--
-- Name: message_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_visibility AS ENUM (
    'customer_visible',
    'internal_only'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'bank_transfer',
    'card',
    'cash',
    'other'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded'
);


--
-- Name: rate_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rate_status AS ENUM (
    'draft',
    'active',
    'archived'
);


--
-- Name: service_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_type AS ENUM (
    'airline',
    'hotel',
    'transport',
    'guide',
    'sights'
);


--
-- Name: sight_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sight_category AS ENUM (
    'museum',
    'landmark',
    'park',
    'religious',
    'entertainment',
    'nature',
    'historical',
    'other'
);


--
-- Name: step_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.step_status AS ENUM (
    'pending',
    'done',
    'skipped',
    'blocked'
);


--
-- Name: transport_booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_booking_status AS ENUM (
    'requested',
    'confirmed',
    'cancelled',
    'completed'
);


--
-- Name: transport_invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transport_invoice_status AS ENUM (
    'submitted',
    'approved',
    'paid',
    'rejected'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'customer',
    'airline_supplier',
    'country_manager',
    'hotel_manager',
    'transport_manager',
    'guide_manager',
    'sights_manager'
);


--
-- Name: workflow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_status AS ENUM (
    'not_assigned',
    'assigned',
    'in_progress',
    'blocked',
    'completed',
    'cancelled'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: airline_agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airline_agencies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    country_ids text[],
    contact_name text,
    contact_phone text,
    contact_email text,
    specializations text[],
    is_active boolean DEFAULT true
);


--
-- Name: airports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.airports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    city_id character varying NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: booking_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_assignments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    country_code text,
    service_type public.service_type NOT NULL,
    assigned_user_id character varying,
    assigned_by character varying,
    assignment_status public.assignment_status DEFAULT 'assigned'::public.assignment_status,
    assigned_at timestamp without time zone DEFAULT now()
);


--
-- Name: booking_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_workflows (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    country_code text,
    service_type public.service_type NOT NULL,
    assigned_user_id character varying,
    workflow_status public.workflow_status DEFAULT 'not_assigned'::public.workflow_status,
    current_step text,
    notes text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_code text NOT NULL,
    tour_id character varying,
    departure_id character varying,
    customer_id character varying NOT NULL,
    booking_type public.booking_type NOT NULL,
    group_name text,
    leader_user_id character varying,
    join_code text,
    party_size_expected integer DEFAULT 1,
    status public.booking_status DEFAULT 'submitted'::public.booking_status,
    fulfillment_status public.fulfillment_status DEFAULT 'pending'::public.fulfillment_status,
    total_price integer,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    internal_notes text,
    is_urgent boolean DEFAULT false
);


--
-- Name: bus_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bus_types (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_id character varying NOT NULL,
    name text NOT NULL,
    seats integer NOT NULL,
    cost_per_day numeric,
    cost_per_mile numeric,
    description text,
    is_active boolean DEFAULT true
);


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    country_id character varying NOT NULL,
    is_airport_city boolean DEFAULT false,
    is_active boolean DEFAULT true
);


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    region text,
    currency text,
    timezone text,
    is_active boolean DEFAULT true
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    traveler_id character varying,
    workflow_step_id character varying,
    doc_type public.doc_type NOT NULL,
    file_name text NOT NULL,
    file_url text,
    uploaded_by character varying,
    doc_status public.doc_status DEFAULT 'uploaded'::public.doc_status,
    reviewed_by character varying,
    created_at timestamp without time zone DEFAULT now(),
    review_notes text
);


--
-- Name: guide_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guide_rates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code text,
    city_base text,
    guide_name text NOT NULL,
    guide_code text,
    language text,
    rate_unit text,
    currency text DEFAULT 'USD'::text,
    valid_from text,
    valid_to text,
    price numeric,
    license_level text,
    notes text,
    status public.rate_status DEFAULT 'draft'::public.rate_status,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: hotel_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_rates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code text,
    city text,
    hotel_name text NOT NULL,
    hotel_code text,
    room_type text,
    meal_plan text,
    currency text DEFAULT 'USD'::text,
    valid_from text,
    valid_to text,
    price_per_room_per_night numeric,
    tax_included boolean DEFAULT false,
    min_nights integer,
    blackout_dates text,
    notes text,
    status public.rate_status DEFAULT 'draft'::public.rate_status,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    workflow_id character varying,
    sender_user_id character varying NOT NULL,
    sender_name text,
    message_visibility public.message_visibility DEFAULT 'customer_visible'::public.message_visibility,
    message_text text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'USD'::text,
    payment_method public.payment_method DEFAULT 'bank_transfer'::public.payment_method,
    payment_status public.payment_status DEFAULT 'pending'::public.payment_status,
    receipt_url text,
    created_at timestamp without time zone DEFAULT now(),
    notes text,
    created_by character varying
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


--
-- Name: sights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sights (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city_id character varying NOT NULL,
    description text,
    sight_category public.sight_category DEFAULT 'other'::public.sight_category,
    ticket_required boolean DEFAULT false,
    estimated_duration text,
    is_active boolean DEFAULT true,
    individual_ticket_cost numeric,
    group_ticket_cost numeric,
    long_description text
);


--
-- Name: sights_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sights_rates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code text,
    city text,
    attraction_name text NOT NULL,
    attraction_code text,
    ticket_type text,
    currency text DEFAULT 'USD'::text,
    valid_from text,
    valid_to text,
    price_per_person numeric,
    requires_timeslot boolean DEFAULT false,
    notes text,
    status public.rate_status DEFAULT 'draft'::public.rate_status,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tour_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_days (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    tour_id character varying NOT NULL,
    day_number integer NOT NULL,
    title text NOT NULL,
    description text,
    country_code text,
    city text,
    activities text
);


--
-- Name: tour_departures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tour_departures (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    tour_id character varying NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    capacity_total integer DEFAULT 20 NOT NULL,
    capacity_booked integer DEFAULT 0,
    status public.departure_status DEFAULT 'open'::public.departure_status,
    public_join_enabled boolean DEFAULT true,
    price_per_person integer,
    booking_cutoff_date text,
    notes text
);


--
-- Name: tours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tours (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    highlights text,
    image_url text,
    duration integer DEFAULT 1 NOT NULL,
    base_price integer DEFAULT 0,
    currency text DEFAULT 'USD'::text,
    countries text[],
    is_published boolean DEFAULT false,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now(),
    tags text[],
    pdf_itinerary_url text,
    internal_notes text
);


--
-- Name: transport_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_bookings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying,
    tour_id character varying,
    company_id character varying NOT NULL,
    route_id character varying,
    bus_type_id character varying,
    service_date text,
    service_end_date text,
    status public.transport_booking_status DEFAULT 'requested'::public.transport_booking_status,
    cost_quoted numeric,
    confirmed_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: transport_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_companies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    country_id character varying,
    vehicle_types text[],
    contact_name text,
    contact_phone text,
    contact_email text,
    is_active boolean DEFAULT true,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    postal_code text,
    bank_name text,
    bank_account_number text,
    bank_swift text,
    bank_iban text,
    tax_id text,
    notes text
);


--
-- Name: transport_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_invoices (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_id character varying NOT NULL,
    transport_booking_id character varying,
    invoice_number text NOT NULL,
    service_details text,
    amount numeric NOT NULL,
    status public.transport_invoice_status DEFAULT 'submitted'::public.transport_invoice_status,
    submitted_at timestamp without time zone DEFAULT now(),
    approved_at timestamp without time zone,
    notes text
);


--
-- Name: transport_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_id character varying NOT NULL,
    invoice_id character varying,
    tour_id character varying,
    amount numeric NOT NULL,
    payment_date text,
    payment_method text,
    reference text,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: transport_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_rates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code text,
    city_base text,
    vendor_name text NOT NULL,
    vendor_code text,
    vehicle_type text,
    seat_capacity integer,
    rate_mode text,
    currency text DEFAULT 'USD'::text,
    valid_from text,
    valid_to text,
    base_price numeric,
    included_hours integer,
    included_km integer,
    overtime_per_hour numeric,
    extra_per_km numeric,
    route_from_city text,
    route_to_city text,
    notes text,
    status public.rate_status DEFAULT 'draft'::public.rate_status,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: transport_route_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_route_pricing (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    route_id character varying NOT NULL,
    bus_type_id character varying NOT NULL,
    cost_per_trip numeric NOT NULL,
    notes text
);


--
-- Name: transport_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_routes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    company_id character varying NOT NULL,
    name text NOT NULL,
    description text,
    from_city text,
    to_city text,
    distance_miles numeric,
    is_active boolean DEFAULT true
);


--
-- Name: travelers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travelers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    booking_id character varying NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    dob text,
    nationality text,
    passport_number text,
    passport_expiry text,
    gender text,
    special_needs text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    phone text,
    company_name text,
    country_code text,
    is_tour_leader boolean DEFAULT false,
    is_active boolean DEFAULT true,
    transport_company_id character varying
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    username character varying,
    password_hash character varying
);


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_steps (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    workflow_id character varying NOT NULL,
    step_order integer NOT NULL,
    step_code text NOT NULL,
    step_name text NOT NULL,
    step_status public.step_status DEFAULT 'pending'::public.step_status,
    updated_by character varying,
    notes text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Data for Name: airline_agencies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.airline_agencies (id, name, country_ids, contact_name, contact_phone, contact_email, specializations, is_active) FROM stdin;
\.


--
-- Data for Name: airports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.airports (id, code, name, city_id, is_active) FROM stdin;
ee470c4c-2b91-4f54-afdf-7cf6b44574ab	HSC	Shaoguan Danxia Airport	b3cb0c26-04df-417a-b6fc-cd6dbfb15380	t
f4154eab-5aab-4db8-bd13-740ed46cfe24	YEG	Edmonton International Airport	dcdf48d3-fbd9-422b-b290-d1beca90dc66	t
e2709232-bf00-45dd-b413-335e958e6620	YHM	John C. Munro Hamilton International Airport	78f3ac44-53dc-4dc2-b920-b6da9f9c4aa2	t
4114c7c3-23b8-449e-b540-af5434e86c49	YHU	Montréal / Saint-Hubert Metropolitan Airport	743922c9-8e89-4787-970f-9b1a8994dcb1	t
bece776b-7590-43f8-b182-7bb28b0dd591	YMX	Montreal Mirabel International Airport	743922c9-8e89-4787-970f-9b1a8994dcb1	t
f4671cbc-b58e-48ac-bbfa-0eb714ce0ac4	YOW	Ottawa Macdonald-Cartier International Airport	e1191f94-b063-48f3-b7bf-147057563c36	t
eaad501a-1f29-4278-b684-8c9cfc3bfbd3	YQY	Sydney / J.A. Douglas McCurdy Airport	334a1259-7bd7-40a3-b48e-a5fe3fae1e88	t
6ead6188-a847-4ea7-bd13-18522ca5f1de	YRO	Ottawa / Rockcliffe Airport	e1191f94-b063-48f3-b7bf-147057563c36	t
bdacac35-e7b5-4278-8eeb-dbbddb433c41	YTZ	Billy Bishop Toronto City Airport	c9e92774-158f-4dc4-a978-0440d6f4ac44	t
8c235b35-a55d-4e9f-a8b8-6eb62dc6fbe7	YUL	Montreal / Pierre Elliott Trudeau International Airport	743922c9-8e89-4787-970f-9b1a8994dcb1	t
6069e4dc-1b0f-456c-99d9-85acbf07befc	YVR	Vancouver International Airport	22333a11-3d2e-4b62-ac9b-6877253a3c5c	t
e71db42a-48a0-4f5d-bbc1-aa6f79cd9da3	YWG	Winnipeg / James Armstrong Richardson International Airport	6d426f48-5da5-42a4-ab7b-d889be27e0c9	t
714fe739-7e3d-43bb-9d06-e14c2213b289	YXU	London International Airport	82caac75-41c6-48ba-b4e5-b62d9517c00c	t
07990df6-3252-4bde-a6dd-011a2618de17	YYC	Calgary International Airport	1be3e992-9151-4604-aa8c-ff515e2faf13	t
187c6a5f-4e5c-4ecb-b17d-84ffc5c57492	YYZ	Toronto Pearson International Airport	c9e92774-158f-4dc4-a978-0440d6f4ac44	t
3ca6c050-5b37-4e8d-95a2-b2c06766a179	ALG	Houari Boumediene Airport	905d187c-8137-4e68-b56a-58b50ca008de	t
e05a0e98-2480-415c-b0a9-7d80c28ef25d	AAE	Annaba Rabah Bitat Airport	1bcf0129-f9e1-4e39-92b4-a9262157ccec	t
7f1cc6e3-39ca-4aef-b10a-6683521c2a9e	CZL	Mohamed Boudiaf International Airport	7d93a5e8-fb54-4795-a453-a166ffa6d685	t
bd0ad9b6-4764-43bd-9bae-1c54a70d6fa9	CFK	Chlef Aboubakr Belkaid International Airport	4dbf2436-7edb-4a43-a426-e7e74726f3c1	t
dca78046-4c6b-470b-973b-7bdce68aedcf	COO	Cotonou Cadjehoun International Airport	b494b594-5c94-4c2a-8c00-67d9ed1f5314	t
670ed65e-301f-4274-b1e7-55ce46265f3d	OUA	Ouagadougou Thomas Sankara International Airport	2bc7084e-2fda-40a5-ab2d-aa47d00216d6	t
09efeaf9-37b7-4a74-b645-c19910df1f1e	ACC	Kotoka International Airport	bacfb9be-77f9-42ec-9102-dcfaaf328cc2	t
44211ecf-90a3-4dce-ad4d-9569aea1fadf	KMS	Prempeh I International Airport	f1550b6d-de5d-4c34-a084-55023538e5ff	t
ffacf1d9-ced8-4486-9712-91633758c7de	ABJ	Félix-Houphouët-Boigny International Airport	21cce3c3-de1d-40d3-944a-09275428d9e6	t
361e6a1c-90e0-4328-ba46-05109db413f6	BYK	Bouaké Airport	3c4d7982-2a5f-4344-9d84-d6288c1ec09a	t
b51e1cdc-0eac-4af8-ae2c-f5f0329ca11c	DKA	Umaru Musa Yar'adua Airport	82796b2b-5deb-4984-98a8-7da360eb52dd	t
22a2aa5d-fd64-4ce4-96e0-64d56a9b37fb	ABV	Nnamdi Azikiwe International Airport	80e973dd-0217-4b0d-96ef-9406b52ea264	t
dd1cfd2e-eb54-45fd-b62e-718838fef648	QUO	Akwa Ibom International Airport	aceff6c7-2db7-4201-8a32-5716c07f0c18	t
e205dbb5-b892-4341-af83-390f4a4e6b24	AKR	Akure Airport	dc6055ce-3f8d-4c67-aabd-92ec2467a845	t
f7b9463d-5e6f-4f7a-8ded-63689de4b163	CBQ	Margaret Ekpo International Airport	75e52568-7f80-4aa9-b9cb-7abe823dd3ca	t
9033856f-4d2b-488e-8933-dccc8f3547ee	IBA	Ibadan Airport	54747948-329b-472b-bbbe-76b53995173a	t
41ad2b80-c449-4991-a309-e81b52731a72	JOS	Yakubu Gowon Airport	7a3f33e2-b9b5-49c5-83a1-de0d4ea04f3e	t
8320e63f-b02f-4eda-80ed-5e4147e3cb9c	KAD	Kaduna International Airport	f542a9bf-1998-4503-9549-cd5fadb3e047	t
a45712b4-a7dd-4a22-8916-e78df4e59170	KAN	Mallam Aminu Kano International Airport	a2df1805-a772-460d-aeb9-fbb6032e41a7	t
b8baa6a8-851c-4edd-b80e-663dc9aa871b	MIU	Maiduguri International Airport	5ad0106f-c7ee-463f-87ee-b618632c4cb2	t
8ea5908c-20a7-46ad-965e-d369a10014dd	LOS	Murtala Muhammed International Airport	0c40096d-d273-494c-903e-98e04a1bbe8b	t
b05ff83b-ccfa-4dcf-9929-04c2e7d5e487	PHC	Port Harcourt International Airport	dc9d58a2-c220-434d-89a6-c28381d7671f	t
8fc5769d-009b-42e6-9241-d3e7a63f9a2c	SKO	Sadiq Abubakar III International Airport	7cd0a878-382b-460d-9cbe-b395acaf9628	t
8bab6030-17ea-42a4-9810-91cd2298897f	NIM	Diori Hamani International Airport	8767c6b6-c97b-4b9a-ab9f-206ac63fd0c2	t
f00e0939-79e5-4d9b-af76-e65de36f875c	TUN	Tunis Carthage International Airport	19863169-ca25-4be9-86e7-87c21d34e2b1	t
5cce0300-5e1f-47eb-afbf-8d0c334d0447	SFA	Sfax Thyna International Airport	e1d806aa-f0f9-4e4c-9cac-36a65e91426b	t
7dc5a889-0083-49ee-907d-55d192fec3bc	LFW	Lomé–Tokoin International Airport	4931fca1-28be-43c8-bdba-fb76b85ab5bf	t
24680f21-95da-451d-b722-f799bf182fe7	ANR	Antwerp International Airport (Deurne)	6c52ee6b-54f5-456b-bdb9-15cf181306b7	t
89c7576b-7767-4f49-8dbd-48a664e415e9	BER	Berlin Brandenburg Airport	3b7c51bf-f6b8-45a1-a42b-7180622b6458	t
c3b7ac84-5600-4928-88c8-4c09557e68d5	DRS	Dresden Airport	582c2125-ed7a-44ff-b1ff-191b789f6eaf	t
a8b2782d-b68d-49b6-9c06-09e25ad2a798	HAM	Hamburg Helmut Schmidt Airport	7d6e2a8b-5cec-49f5-930c-885c41dec022	t
c35639a0-449f-467f-a8b3-2739d6a7a693	DUS	Düsseldorf Airport	fee3c3e0-bdcd-4277-b014-4fee5c20f137	t
20a83ae4-2e70-4145-8c0b-ff3e7b42c817	MUC	Munich Airport	d0a81b7e-5752-4545-b4fa-8a10bf3dc448	t
d43f0a92-101a-448e-a36c-3bc5766a29c4	SCN	Saarbrücken Airport	671b24d1-2e98-454a-80f7-6bff1738897e	t
a7719dda-b86e-4939-ab94-37bd67b6bb19	STR	Stuttgart Airport	47b6df9d-6a27-4eaf-9118-d166fb221842	t
fb2ad220-ecdc-46f6-b282-a38c0625ac3c	HAJ	Hannover Airport	066e1868-3e21-4c4a-b3b7-4989a2705093	t
6269afa5-6624-4c1d-86b4-2946ac920592	BRE	Bremen Airport	4bdc73ef-fd58-4efe-b735-d131d505aaae	t
60bb8b9c-90ad-4430-ba1e-bf064a7b4782	MHG	Mannheim-City Airport	3712cf7d-f0a8-4b21-8eb8-cec08666c7e6	t
5abcf1ca-1ba9-4c45-b9d5-658394792bee	DTM	Dortmund Airport	b1bb7e12-28a9-4fd8-a535-65f6cde14c7f	t
69a28c6d-ee55-44f1-a220-d811cac53760	TLL	Lennart Meri Tallinn Airport	e8f117ee-88ab-4c4d-afb1-ab6435913b66	t
ad46864d-ee76-4644-a8bd-2ecf7cd6c986	BFS	Belfast International Airport	9058d028-db51-4532-b5d9-10ad17fc8faf	t
a0cf7efe-3b78-4b51-8469-621d49bbebde	BHD	George Best Belfast City Airport	9058d028-db51-4532-b5d9-10ad17fc8faf	t
9ac2cc28-6d8f-41c6-bd39-a53a5f5c2c31	CWL	Cardiff International Airport	2c333fdc-9887-42c3-b1c5-1d75fd199f68	t
f508e557-d40e-451c-a2e7-aa998049e970	BRS	Bristol Airport	b0c54842-12ec-4aae-a0a0-993cb7f414f8	t
4ba5ed15-ce45-4cf5-8f68-08291c0f1e90	LPL	Liverpool John Lennon Airport	7f47e69c-cd3b-4af1-ab80-8ad6022fa868	t
2a35f891-1fb0-4bbc-8c65-30b3f42f6785	BOH	Bournemouth Airport	47f445c6-2370-4429-a469-23633bb5df2f	t
2963b280-1620-4be5-a1f7-81052e8af9f5	LGW	London Gatwick Airport	82caac75-41c6-48ba-b4e5-b62d9517c00c	t
ac1ef1c9-f10c-4efb-9c55-e1510e72b484	LCY	London City Airport	82caac75-41c6-48ba-b4e5-b62d9517c00c	t
84d50e24-a513-4b14-a289-7c90d01f2806	LHR	London Heathrow Airport	82caac75-41c6-48ba-b4e5-b62d9517c00c	t
428a1e42-150a-4079-8d04-10d6e683c170	EMA	East Midlands Airport	a72111dd-113c-49af-8f26-cef59dc8bb0e	t
66ec9560-d052-4b43-85a8-71bb24b5ea86	GLA	Glasgow Airport	0a709f8f-4a59-4690-a41e-9ec1c2c884b2	t
bfe4d4f8-7154-4670-9e62-9753fac2a207	EDI	Edinburgh Airport	0157a106-4bd6-4aad-ae82-424bfce445a4	t
4af3ad2d-ea31-4443-8ebe-bd008f0a4b0b	AMS	Amsterdam Airport Schiphol	67455ff6-2d3a-4b84-926f-1218d53385f3	t
3db51c81-e266-4c00-be93-f798781fce86	EIN	Eindhoven Airport	bb7e4c78-cc5d-472c-8daf-63a195e0402f	t
801c15e3-4ade-4edc-97c1-4c86cf939b43	RTM	Rotterdam The Hague Airport	7ed62f4c-a6b8-42fd-86ef-9ee01cadd353	t
f444d3b4-02b5-4bab-8b8a-0db5f062988b	DUB	Dublin Airport	c8f3ce3b-817c-4263-806d-ee000afc76d3	t
d4ab8065-462c-4e52-aa57-137a990c99d3	CPH	Copenhagen Kastrup Airport	038299a4-84cf-437a-91de-73356674a891	t
6fc074e6-15e0-4d93-9f6a-ef29403e4e32	LUX	Luxembourg-Findel International Airport	f1ac7422-3fbf-4002-8087-c745ffdd3e25	t
42dce653-07f4-4ad6-8d5f-548eecef8c61	GDN	Gdańsk Lech Wałęsa Airport	b6b64306-f64d-4fb1-b528-0d255dd64a8b	t
25da2788-2b29-4595-b271-6059efcf0e2d	KTW	Katowice Wojciech Korfanty International Airport	ec728a74-3dc1-4cbb-adb1-d60e5d63dc71	t
37d69c6b-8b9f-44d7-b2a0-204f4c9f2d49	LCJ	Łódź Władysław Reymont Airport	d8431862-c40e-425a-bb49-caa9918f40e5	t
793b9cc0-3402-44d8-a158-a93931d33c97	POZ	Poznań-Ławica Airport	87226550-d33f-4acf-b060-08454f072327	t
97914f69-3445-4832-b8d0-d7b0079ede95	WAW	Warsaw Chopin Airport	64dedaf7-7a38-48c8-a89a-95dc6a1e54df	t
ed1d2368-75c2-4324-9e6f-e3894db6498f	WRO	Copernicus Wrocław Airport	3cc068f3-c564-4ed5-967b-20c4e34647de	t
ecef1146-c699-4bc5-b400-bdb038073d84	GOT	Göteborg Landvetter Airport	09369170-c170-4cf7-b26d-e603a88e6182	t
ed835980-f98a-4630-862a-41d78f2f6c7e	ARN	Stockholm-Arlanda Airport	3874f6b5-029c-4b2d-ab0b-f3256bde46d8	t
25724d60-0a10-4116-b09e-dbfe60319379	BMA	Stockholm-Bromma Airport	3874f6b5-029c-4b2d-ab0b-f3256bde46d8	t
33a2b81f-21f4-490b-ba6c-ba4aefde2b30	RIX	Riga International Airport	8ab5c370-a3a8-44ff-8c44-441d100cd515	t
56b521c4-0fec-4bfe-a5b3-f16f0abe3df8	VNO	Vilnius International Airport	adb5b049-1f7d-465c-8fa9-fa570fc8c726	t
7e603f86-f947-495b-b7d6-83f167959647	BFN	Bram Fischer International Airport	54e8c40c-96ed-4372-889c-4bf5716aa312	t
985e05f2-56ad-40ce-9109-52a1fad09489	CPT	Cape Town International Airport	27b2befa-ada4-4527-b2e3-ece93abffca4	t
d726c17f-c31d-46b1-868e-b5e67b5d2289	HLA	Lanseria International Airport	1cc7f2b1-9c94-48cd-9793-a79ec4fa99f4	t
3ab55f50-fb03-45bd-8ade-8c599d102039	DUR	King Shaka International Airport	7d331d18-af10-4c13-a9d0-6a8c773db5fc	t
eab0eb29-19b6-4d0e-a1d3-4f67d59fb576	JNB	O.R. Tambo International Airport	1cc7f2b1-9c94-48cd-9793-a79ec4fa99f4	t
3f66ba79-ca6a-4e27-8cb6-85e83eec11b1	PZB	Pietermaritzburg Airport	f4970283-6c85-4c52-b5e6-fb2788733f3c	t
42a43bbe-e0ce-4ba5-a1d7-146f58213945	BZV	Maya-Maya International Airport	fa56b712-6a9c-41a4-b9f1-9e270c6672e0	t
8726c390-bbad-4db4-a77a-bbbb3e20deb7	BGF	Bangui M'Poko International Airport	479815c5-01e8-4c38-a94a-d9b1db0c4336	t
e3b6517c-485e-4080-9f1b-6de8d5b8ea08	DLA	Douala International Airport	7257ac39-f647-4655-b6e9-497f9ed482af	t
17674bfa-36c3-40a1-8a49-8cc64df77b53	GOU	Garoua International Airport	f0507ba5-7db2-4b97-9447-bb1914bdce8d	t
db9578b1-ed24-431d-8d41-bb1161c27258	LUN	Kenneth Kaunda International Airport	204509d2-5367-44ff-a061-b3c8dc207f61	t
21c022fe-ea3d-4497-b801-12c5ab119413	NLA	Simon Mwansa Kapwepwe International Airport	4f351eac-02d3-451f-8202-b9148fd6121b	t
9737ff94-d125-4bfb-b9a1-32e901b2906c	TNR	Ivato International Airport	3b9a7629-27f0-47dc-a96a-fde7a3d1e20d	t
97d160c4-e8de-4a40-914b-da82ea41ad1a	NOV	Albano Machado Airport	a5dc2972-0fbe-4e5b-8097-70aeea6dad62	t
009e89a1-9996-4fa0-affb-e0539df0d62a	LAD	Quatro de Fevereiro International Airport	b356293c-69fe-48e0-a795-45f55994d45d	t
3d406c11-ebd5-4b05-ba65-71d10f79c9fb	LBV	Libreville Leon M'ba International Airport	5135d034-5463-43d4-8cab-4a1918381676	t
1cf484a8-30ce-45e3-92a8-cbdb7807e438	BEW	Beira International Airport	d01ba040-72fb-4143-a20d-a7a1acf6744b	t
b4d324a5-17e4-458e-97b5-bdd7c81ffffc	MPM	Maputo Airport	2bf072e5-cfa2-41cd-969d-7c15cc079196	t
bd945af1-3e8f-4ff8-885b-0b0bba5f24f2	BUQ	Joshua Mqabuko Nkomo International Airport	33be8fb9-351d-4850-bd26-6b869fd33548	t
cd40fac3-1267-463d-adad-7b52dd8f2e1b	HRE	Robert Gabriel Mugabe International Airport	8c00ce91-4194-4589-9b10-2263a37d36e3	t
f8c2c20a-3457-4fb4-8575-ff00fa3bbdc2	BLZ	Chileka International Airport	b05bf7ae-34f8-4c04-a5b7-c858c82ecfb2	t
508893c6-8f3b-4ce3-95ee-f02a57f720b3	FIH	Ndjili International Airport	49c07993-682c-4ae6-9919-faf8b3bfd56b	t
6c780ba1-818d-4509-84bb-1010ecbce9e2	KKW	Kikwit Airport	d2f0913f-0fbb-4812-a8b6-20b60f1ed37c	t
a054be11-b9bb-47c5-a4d4-b9a9df3c2983	FKI	Bangoka International Airport	1138974d-7fc6-429b-884c-223c304f496d	t
3c970a6d-17c0-40f5-996c-d08074bc4b30	FBM	Lubumbashi International Airport	4252c2b8-2816-4b82-8c9c-43bc3ddd2d07	t
08234e4a-49b2-407d-ac92-b6236a9468df	KWZ	Kolwezi Airport	76935e21-2cf7-45d4-9354-16053062a780	t
124a92a5-0c2d-4045-90fe-f243a7781972	KGA	Kananga Airport	be64a586-fc90-4520-86dc-36c3275398b8	t
925c1a7f-0461-49ef-93d7-5abd9a416d44	BKO	Modibo Keita International Airport	2ef4103a-7bfa-4428-9c88-8bd1b605eddf	t
4bf46858-ff93-40b5-8ea4-1c71e0e79adc	OXB	Osvaldo Vieira International Airport	3823cd93-e3d7-42ae-9fcb-046906f36987	t
f0d7a5ee-5685-431b-b3e9-5e63cdc66e0c	MLW	Spriggs Payne Airport	8097787b-9ba8-4833-acf9-d5a75bc7843f	t
a7224737-d556-4257-9ea0-4bda9e034ad2	ROB	Roberts International Airport	8097787b-9ba8-4833-acf9-d5a75bc7843f	t
7fa5e297-8b2f-457d-a2a5-2dfd4bb83485	RBA	Rabat-Salé Airport	fa53085f-abd0-422b-9477-7b31b3a03ac5	t
96fd3dff-c512-4f42-bb4d-1a771aa61681	VIL	Dakhla Airport	84ff3731-325d-46e4-9d2b-89b9135768aa	t
eeb80395-ee09-4127-b554-c21ab0518626	ESU	Essaouira-Mogador Airport	3d9ef998-c165-4fa7-b54d-869561637fb4	t
03e76cf9-cfd8-4a47-a6bd-60f44aaa4fbc	CMN	Mohammed V International Airport	156c5da1-f56e-451e-97cb-aba1e8a2fc5a	t
66014a9b-c3a3-4b6d-b3d7-1bfc2d4301f8	RAK	Marrakesh Menara Airport	f37b45cc-1a73-48ce-b950-8320a9c6b34b	t
421bccd5-aaaf-4d17-a289-aa21f16b6d8f	OZZ	Ouarzazate International Airport	1c9dbc95-fd63-463f-b07a-61e9d947b159	t
d3b83c6f-5dcd-4754-9f4b-c134fb7757f9	TNG	Tangier Ibn Battuta Airport	652e2ea8-27da-46a1-b115-9691d540fdb9	t
400798d7-bed6-492d-9742-dccdbc467356	DSS	Blaise Diagne International Airport	16bf0b51-21a0-4a31-981e-f28b42062edc	t
851bf78b-3cd7-4fb5-ad9a-e01d7d692d5b	DKR	Léopold Sédar Senghor International Airport	16bf0b51-21a0-4a31-981e-f28b42062edc	t
497569fe-0354-418f-9050-fa92d446f311	NKC	Nouakchott–Oumtounsy International Airport	65a6e792-135e-425d-951c-b875789d4d82	t
3eb0022b-d2cf-4692-b667-7073ec0ca4da	CKY	Ahmed Sékou Touré International Airport	a690d313-1ebb-4675-a4f9-ba70b230814b	t
902c27e3-384e-4de8-bfea-1a0ec6bebf98	ADD	Addis Ababa Bole International Airport	7e74a172-6f0b-4d1a-a119-6b786d30e72f	t
e443ce15-7ec9-4106-ba81-ad48735c6cbb	MGQ	Aden Adde International Airport	0b3b5f87-423b-4b6a-9acb-de49f25a676a	t
7565ac1a-1771-41cf-97c6-9f2e5ab30371	ATZ	Asyut International Airport	9cbfccd4-639b-4170-9ed8-6918bef5371b	t
5fbeb270-5e0a-45d5-a7da-2e1c2ff4182d	HBE	Alexandria International Airport	bcc907b2-c48d-4850-9a64-f82b4a309f2c	t
e5d0ff5a-3074-4cc7-8a91-ccb2808634dd	CAI	Cairo International Airport	8b1b0c22-9071-4ffa-aea5-76a9587092a1	t
0a03f71b-ea60-4d56-81b3-e5be59043cf1	HRG	Hurghada International Airport	6734d8a5-b299-4aac-bdd7-c4d68b8e1466	t
64f5a63a-ef36-430b-aac3-36757a1af6ae	LXR	Luxor International Airport	2c520b07-cfc1-4e76-8cab-adb54af2943d	t
c027e79f-37ca-4583-b236-1d2e5a6db1f8	RMF	Marsa Alam International Airport	ae60934c-a95f-42fd-9ed0-1e4b5e923d64	t
2219ec8a-9400-47c9-8b4b-20d4efce51df	PSD	Port Said International Airport	6b935e8f-ab3b-44f8-8f32-88306047bd17	t
5ea2f8a9-848f-4460-9576-faca77c281cb	SSH	Sharm El Sheikh International Airport	a9327165-5520-44ba-9bca-caa54a7f99fe	t
4cf4d4f5-15f0-4fe3-8c7b-68d3b5423e13	ASW	Aswan International Airport	34573eef-55be-457c-acb5-aea194c0e3af	t
3a53b599-f0b6-4242-ae80-af3baf445f46	TCP	Taba International Airport	9d261db4-1196-4e6d-b25b-7482d56170de	t
6d16968a-cad8-4594-9de9-4a01de57fdb5	ASM	Asmara International Airport	430e6776-ebf4-4f67-af71-cb1f715cd719	t
b5e28c75-5f22-432a-ac5f-3cdca70cdcca	NBO	Jomo Kenyatta International Airport	53555236-f16e-495a-859a-892773c1b679	t
d0f94887-f4e2-4403-9daa-df8385947361	KIS	Kisumu International Airport	b9e342b0-2088-4823-9479-ef5b57781676	t
d7deb5df-2864-4635-a177-7b56be2ccc61	MBA	Moi International Airport	3f1d14ba-021c-4ac3-84c7-5bb8c03af95a	t
75512a5a-e8f1-4f11-9df3-5c47406d7a8d	WIL	Nairobi Wilson Airport	53555236-f16e-495a-859a-892773c1b679	t
99a47ca6-bd8f-4838-9ecf-ba923705c0a7	MJI	Mitiga International Airport	671703f4-9bfe-4ff7-8974-0b1f2c918b17	t
2b0fffea-5f04-4412-9878-48bd12217b69	KGL	Kigali International Airport	31210c12-23ea-47f2-bc61-c6e487a7459c	t
b3e49fcb-2a36-47d4-9fb3-bf7c24ab270f	KSL	Kassala Airport	c69ca370-afa5-4f47-956d-d9df383aa47d	t
94fb8b9d-f6e8-4482-9fb1-d95e0fc3040c	PZU	Port Sudan New International Airport	48de372d-89fa-4078-a3d5-42a302d6f785	t
abfe8274-0be5-4df2-8321-24e048ded7ed	KRT	Khartoum International Airport	089e3be4-56a8-42aa-9206-d5a42de29c30	t
54b293dc-24aa-4b74-a981-80687acedf23	DAR	Julius Nyerere International Airport	56960feb-ece8-40df-b5e3-665cec0b3a5b	t
ec830a1d-8119-4621-bee4-d7819ec481fd	MWZ	Mwanza International Airport	cc982e13-44f0-4a82-b989-f3eef03b9676	t
cfdfe69f-7c8e-43cb-9c66-04b160074f6a	ZNZ	Abeid Amani Karume International Airport	ce962bdf-f05f-4da9-af9d-262844820965	t
f7ddecd4-bc84-491e-9f47-94be563b3f7e	EBB	Entebbe International Airport	afbdce63-1c32-457b-8495-695fef3d8ac0	t
86e94b91-aaf1-4a81-9025-aef59fa23074	ABQ	Albuquerque International Sunport	ec10517a-b12a-49b6-9634-82cfa5a5b1bc	t
ad40b614-0661-4f85-b3e4-489fd87c8187	ABY	Southwest Georgia Regional Airport	b3cd9766-96e5-4793-95fb-e333e7464020	t
0fad98dd-b1a9-446a-b5d0-f70b64a15115	AEX	Alexandria International Airport	bcc907b2-c48d-4850-9a64-f82b4a309f2c	t
65825569-e4b7-4e04-bbaa-b4353630031c	AGS	Augusta Regional At Bush Field	b17e5c29-003e-454b-a8d9-881576e2c1be	t
e3603b57-e3de-495f-8a8c-e04e668b0036	ALB	Albany International Airport	b3cd9766-96e5-4793-95fb-e333e7464020	t
e475c3f2-435e-4f5e-9fa9-c2149df75003	ATL	Hartsfield Jackson Atlanta International Airport	1054f0ce-37a4-4a0e-97d6-4642e5a4f197	t
0fd42a53-cdbd-4780-a722-b627211334b9	AUG	Augusta State Airport	b17e5c29-003e-454b-a8d9-881576e2c1be	t
06a7a7fb-b00a-4804-a259-5609e49e50fe	AUS	Austin Bergstrom International Airport	c0288aa1-2313-462e-8623-8462a19214a0	t
4a84cef9-0de5-4835-a03c-4d34c7a06fa6	BDL	Bradley International Airport	910d8964-c18c-489e-a1dd-4ff4d169365d	t
bdc5e0f2-a142-4137-9537-d6c1c3102391	BFD	Bradford Regional Airport	4999a418-926e-49b8-8b18-ead9acdd07e0	t
6d50d658-b61a-4176-baae-eb36802a75f0	BFI	King County International Airport - Boeing Field	bfc9149a-c011-4702-905b-5d9a39f06c74	t
08799f2d-f636-488d-820d-dd9a7f7be602	BFL	Meadows Field	6034ec51-9b28-4fa5-853e-ed13728f8ae9	t
54b70f75-c5ae-4ee4-b21b-c65730b68e71	BHM	Birmingham-Shuttlesworth International Airport	2f3e2561-415d-44d7-a243-25931680ed9c	t
27413fdb-77c7-417f-87cf-d0877e485c91	BJC	Rocky Mountain Metropolitan Airport	94fd34cb-e624-4b7d-9a5b-6ccd54ad5b8d	t
0773003f-525b-4950-9ed5-9a5bedb8765b	BNA	Nashville International Airport	6e0d4ad8-8892-4a5d-9bbb-122bbe7e249e	t
b13fa59b-a858-4aac-9089-bb35f895c3f5	BOS	Boston Logan International Airport	a0b907d2-587a-425c-8a3e-d4285ea8d7e4	t
8ebc4ff7-5c0b-4983-8c44-3a6084426a1c	BTR	Baton Rouge Metropolitan Airport	33f10e1f-6f91-4e1f-8134-ca3de314a410	t
6ede5f32-700e-429d-8cd7-9f5c7a006fa1	BUF	Buffalo Niagara International Airport	a5b6145b-2a9f-4994-b377-28f9d6b295be	t
b5e5d46c-fc5d-4daa-b748-ec1a9cc97f37	BWI	Baltimore/Washington International Thurgood Marshall Airport	84abdad4-9d5f-48ec-ab8b-38cb46edf282	t
e3361b89-8736-4269-82ce-487f43fcafc4	CAE	Columbia Metropolitan Airport	53cfb4ec-c73c-4128-9d95-33c2c2944bfe	t
c76621b0-23bc-4e25-9d2b-d59914308eaa	CAK	Akron Canton Regional Airport	3aed238c-26e1-45e8-9116-0f418b4d6ee1	t
8bad1a6c-eced-4078-bf40-0701428291ee	CCR	Buchanan Field	ad53bcc1-6900-4767-833e-58d5046a0213	t
f4ebd2a9-ad15-4e04-a16b-9a8336c51a54	CHA	Chattanooga Metropolitan Airport (Lovell Field)	59e0a542-9175-4027-a8dc-da9c1a4a415d	t
d9438f7c-2041-4f20-b0d0-fe9ecab9b4c2	CHS	Charleston International Airport	27923283-18a3-457a-9673-69f55fa88356	t
83eac12c-c252-4793-936b-237546ed1399	CKB	North Central West Virginia Airport	55004d41-325f-49c0-b67c-795a578a04cd	t
de398f61-5492-4643-a324-0968500ae7d7	CLE	Cleveland Hopkins International Airport	c66d06af-7d65-49ff-81b2-054113a39242	t
90c8bab4-1a97-49e3-a445-828d0c009501	CLT	Charlotte Douglas International Airport	d5cf3d87-b746-4f4b-a07f-525c1fb1413a	t
f0b14322-1470-4118-800e-1b3625dbdfbf	CMH	John Glenn Columbus International Airport	bc8f170d-6c52-4d92-ae39-3148b2c3ef42	t
bacae486-2ef5-4ec2-918c-8520ea29ded0	COS	City of Colorado Springs Municipal Airport	7a173dff-a69f-4e9f-afea-e6c1188a6173	t
2c42aa94-a8e9-4d65-a6bf-0a6f53a1398c	COU	Columbia Regional Airport	53cfb4ec-c73c-4128-9d95-33c2c2944bfe	t
1dc8638e-3dec-487a-ba6a-21f66c0dda46	CRW	Yeager Airport	27923283-18a3-457a-9673-69f55fa88356	t
55c5620e-3526-408d-93c3-cfecc7f93afc	CSG	Columbus Airport	bc8f170d-6c52-4d92-ae39-3148b2c3ef42	t
d8d7935e-467e-4e84-9ed5-8d1d7aa4aaa1	DAL	Dallas Love Field	37780ae6-5d98-4186-8f97-5a9ce54c7900	t
8cc2b39f-8f11-4ed3-a469-7ca48428f541	DAY	James M. Cox Dayton International Airport	4fe23fc7-9ec8-4626-aa76-f99adbee283d	t
7e2a6797-0c5f-415f-b6c6-6dcff9956e7e	DCA	Ronald Reagan Washington National Airport	c71d2716-6bd5-46d6-add5-8389ac3bab96	t
dbdf24a5-2510-4ce8-8940-937a7e6303f1	DEN	Denver International Airport	94fd34cb-e624-4b7d-9a5b-6ccd54ad5b8d	t
79ed43cf-694d-43f5-ab6d-a08bcb2bb4cd	DRO	Durango La Plata County Airport	a388129c-e2a5-4e0f-8399-2d1fd7d7084d	t
3f5a4238-578d-4160-bf3c-043a83785e2c	DSM	Des Moines International Airport	3087bec5-126b-45dc-81d6-147f9ed5289d	t
8477992c-0be9-47a6-92f8-5e36341b2010	DTW	Detroit Metropolitan Wayne County Airport	352db6a8-bc30-43bc-b5bc-779c6781fc42	t
687dc91c-e822-4023-8826-a8fc0954cefc	ELP	El Paso International Airport	6c0a3878-1c47-4c96-a633-40636bfae150	t
bceb6448-748a-487f-94a1-511d6bcdbec6	FAT	Fresno Yosemite International Airport	376b2c73-b994-46ef-888c-1aed3bde80ce	t
f2a34f57-2c74-4888-b914-f649809072c8	FLO	Florence Regional Airport	c3103558-27b6-41f2-b8a8-8d13e6e5d2dc	t
4f0ad0af-0d78-46b3-b9b4-08d031e26fc6	FTW	Fort Worth Meacham International Airport	cff80e71-a8d5-4733-97ce-9a3af289af51	t
f3869ca9-ff8d-41b2-aae4-d50a287c9406	GEG	Spokane International Airport	af98bf4b-506d-4bb9-bbf7-0be5e3bc19d0	t
306a3c81-0711-4e2e-89be-b2a90071eb7e	GGW	Glasgow Valley County Airport Wokal Field	0a709f8f-4a59-4690-a41e-9ec1c2c884b2	t
c0c451b0-d2ea-44f5-a5b5-0131d51c50e5	GLH	Mid Delta Regional Airport	f7e9fcf9-4863-43e8-9ac1-68e14edb5b79	t
3b720a1b-bc7b-4314-856d-326fab61f13f	GRR	Gerald R. Ford International Airport	b47dbab5-85a0-4ec8-a3a9-3848fe0aca4a	t
6990720b-4330-422b-844a-e01ef2b498d2	HOU	William P. Hobby Airport	4a9e5a97-d7e3-4f5d-87b4-2555cd329fca	t
d4babb08-0648-4239-b878-8751e7927fed	HVN	Tweed New Haven Airport	5268fc44-f8f0-4dfc-9676-5f1977afa5e9	t
50921711-4e9a-45e4-a61e-5ac98a117a05	IAH	George Bush Intercontinental Airport	4a9e5a97-d7e3-4f5d-87b4-2555cd329fca	t
91eb684f-e64e-4e63-a6c9-556a8f83143c	ICT	Wichita Dwight D. Eisenhower National Airport	27963b5b-4b25-4091-9faa-deace5897ba8	t
da46cf93-417b-4a30-a02f-0fd6fbcb58be	IND	Indianapolis International Airport	6715f7fa-3434-4329-8954-d272e9330181	t
b7cb2777-2031-4bf0-8d17-49c50a469b70	AZA	Mesa Gateway Airport	4d0bdbe2-0fea-4232-ba78-4176a437f9a3	t
dba0c097-21a5-41ce-863c-63a59002cd87	JAX	Jacksonville International Airport	07e36211-33b4-4ee0-932d-83ff4d489040	t
6514b651-4c3f-4a0a-994f-c09b9bf6823b	JFK	John F. Kennedy International Airport	3ad6b57b-bec4-4545-8f09-a78b105d1683	t
a87ed2cd-0cbe-4571-9050-67eef2043aa0	USA	Concord-Padgett Regional Airport	ad53bcc1-6900-4767-833e-58d5046a0213	t
5a0c8df3-11c1-4f87-bb62-57d789726caa	LAS	Harry Reid International Airport	517f8226-28ee-4b1e-a902-41f8307d43c6	t
a31a48f2-7b24-4d94-8e7c-3feebe71d79b	LAX	Los Angeles International Airport	1f07af0a-3698-481e-95b1-e424c3a2ca98	t
432eb873-2973-4435-b69e-8d1313118762	LCK	Rickenbacker International Airport	bc8f170d-6c52-4d92-ae39-3148b2c3ef42	t
4cb80a83-4deb-46f2-916c-90511f827e40	LGA	LaGuardia Airport	3ad6b57b-bec4-4545-8f09-a78b105d1683	t
5b2d799e-6205-4aea-b240-2c203f080af7	LGB	Long Beach International Airport	e781cd1e-fbf0-4a31-bcd0-b13f871cdd9a	t
adb063b1-4a53-4422-9b7a-e8c319559bcf	LIT	Bill & Hillary Clinton National Airport/Adams Field	78ccfc5c-0f75-479d-a0e7-31b2f779ccf6	t
ebf733e1-d0d9-4740-b75b-ad02e10d4769	LNS	Lancaster Airport	34af96be-6a2b-41e8-8f07-6ab8613b27e8	t
f84038b6-1f8c-428b-ac80-fb4d4084f95e	LUK	Cincinnati Municipal Airport Lunken Field	cc28a165-2a48-44d2-ada1-631fc9ed365d	t
04b6ba89-8e83-4e30-afb1-21fb57d16b2c	MCI	Kansas City International Airport	7f7af49e-02a9-43d6-8f25-3fff4b97f140	t
d945e09a-42b3-4380-b36e-4db0dcfc5185	MCO	Orlando International Airport	91f338e1-603f-4548-9348-5c1f987c603b	t
402e8e5f-e23a-469d-9b9d-5c5a5774dae2	MDT	Harrisburg International Airport	dc5270a1-5691-4d2c-8fbf-b2a9356c0697	t
78fcfa3f-1366-41dc-b5a9-eb6513b50515	MDW	Chicago Midway International Airport	ba8a5cb1-f998-4f44-bd01-b506594c5db1	t
24865fca-26f9-42d7-94d8-22f51cb08915	MEM	Memphis International Airport	eb2fdf3c-f349-4418-91ae-953ed6ca0a0e	t
41e1edfc-e657-47b8-87dd-cf662fcab9cd	MFE	McAllen Miller International Airport	d7f86560-9da6-4a91-9437-361190432799	t
ad4cfe01-e462-45b8-b18c-ffc6a2cac296	MHK	Manhattan Regional Airport	adcc96a0-61e7-4a9e-99bb-ea8c2168091d	t
d3eea1ed-b6d9-4292-8d28-7abfaed9e06c	MHT	Manchester-Boston Regional Airport	b0aa750c-f969-4293-9a5f-56dcd5c71780	t
3cfc0f13-bc7b-4b80-8297-828e667499ee	MIA	Miami International Airport	1fd07f23-b089-4250-a84f-72d08f7cfdb5	t
494143b7-2ee2-4897-b2b0-63137ff976f1	MKE	General Mitchell International Airport	9937e790-b623-41c5-b778-2e8f7546f7e1	t
4b18c503-fe7a-429c-84cf-b62cd0bd1b17	MLB	Melbourne Orlando International Airport	18d540f5-8650-4b94-9d84-8d28b716ccf7	t
282c610a-2092-4821-80f0-b84eabad3642	MSN	Dane County Regional Truax Field	865804a5-a5fb-43ed-9abe-28e4746bbbb0	t
3144a86c-3b04-4e28-b197-279a597d49f8	MSP	Minneapolis–Saint Paul International Airport / Wold–Chamberlain Field	b7eaa9dd-95bf-409c-9989-75cbd482ff3d	t
2c99ab10-c918-4f8b-920e-4625d63a3eb5	MSY	Louis Armstrong New Orleans International Airport	e3547dad-1f2d-4293-8a16-b032e2cc2314	t
55d70b97-4430-44af-a9b3-e37549cfe023	OAK	San Francisco Bay Oakland International Airport	543faf31-b9bc-4a6d-a4b5-83f9dd7ed594	t
5678e3dd-b02c-438d-bb86-f8186246beff	OGD	Ogden Hinckley Airport	2bedbfba-d59a-4bbc-bc48-c38f1863985e	t
8ad3e237-9755-4d34-8e4a-76c5e5abdd79	OKC	OKC Will Rogers World Airport	6a87f5b4-3679-43d8-97e2-da4c1e45830d	t
e288d2bc-4c8d-418a-9f8f-b18bad994210	OMA	Eppley Airfield	60d44606-aa6d-4fc1-918d-d8df0f75a9fa	t
ee984228-26fe-42bf-b205-ff681e479f5d	OPF	Miami-Opa Locka Executive Airport	1fd07f23-b089-4250-a84f-72d08f7cfdb5	t
5c439e1c-41c0-471d-b555-8452daaf09b8	ORD	Chicago O'Hare International Airport	ba8a5cb1-f998-4f44-bd01-b506594c5db1	t
b6f1395b-c30d-4b41-99ad-5d50be6d6cfb	ORH	Worcester Regional Airport	35725975-c523-4f8a-963e-39f73cd908e1	t
768e768d-0b7c-483a-bcf3-4a41aab9fbd5	PDK	DeKalb Peachtree Airport	1054f0ce-37a4-4a0e-97d6-4642e5a4f197	t
a232a0da-e5f4-4e71-ad6e-60e0e1afc15e	PDX	Portland International Airport	572441d8-855f-4a88-8ac8-96343cbbb31f	t
94c4b7fc-d6bf-4820-85ec-440cc528b541	PGV	Pitt-Greenville Airport	f7e9fcf9-4863-43e8-9ac1-68e14edb5b79	t
3706813d-74fb-4949-92b2-9890003bdc57	PHL	Philadelphia International Airport	7a7f434e-ba37-4578-b271-1023b91921a7	t
ed443789-c5b5-431f-ad02-769986dd1f09	PHX	Phoenix Sky Harbor International Airport	ae72eaf0-8a3b-48d8-9612-f5149a78e0cb	t
f9c80827-d44f-4b29-b5b9-43c7e2272017	PIT	Pittsburgh International Airport	752afb22-62c5-45ee-affd-3f9eeb3ec73c	t
4fc3a83e-2112-453c-8f8b-39983f90b6cd	PSM	Portsmouth International Airport at Pease	6efb401c-5719-4440-bb83-4b02a5bbcdc3	t
77900b1b-31e6-478f-bf5d-57464f33442f	PVU	Provo Municipal Airport	b1980598-3387-4db3-920c-2d60822a5540	t
ae94be12-306b-4aeb-a36e-eddf814dcf8e	PWM	Portland International Jetport	572441d8-855f-4a88-8ac8-96343cbbb31f	t
5431ad05-132a-482d-a1a7-0fcc0302373e	RIC	Richmond International Airport	411ae23b-dd40-498f-a88b-ad9937e02e47	t
ba0a5349-4ef2-43c5-9d5f-04a4b4c29177	RNO	Reno Tahoe International Airport	db509058-806c-4a16-ab47-748c0282e5dc	t
c249eb98-d1e7-4b2f-9576-62135c950af5	ROC	Frederick Douglass Greater Rochester International Airport	ca65b0bf-ad18-49bd-b645-25359cdeb5bd	t
479fe021-760b-4a68-8d08-a606aa19a1c7	RST	Rochester International Airport	ca65b0bf-ad18-49bd-b645-25359cdeb5bd	t
ccf6f11d-6a2f-4113-a5d6-f6a349cfa6ef	SAF	Santa Fe Municipal Airport	6cc9fe42-d85d-43bf-af1b-4e6f148d7a50	t
93ab099a-e9c3-4541-ae2b-b495de87d64f	SAN	San Diego International Airport	d0d60257-e703-47f4-bc69-c8de160a046a	t
0c731c67-864f-4fb2-8d3a-3d02cc95de11	SAT	San Antonio International Airport	68a70fc0-e0d2-4a24-944c-63c33c709b4f	t
c5ea3977-54a3-4f40-a16c-ca0afcee6a8a	SCK	Stockton Metropolitan Airport	ccd9eed3-22ad-4948-828e-6e3c47cd7dfd	t
1b992beb-bf3f-45f5-8aec-e57484da6b25	SDF	Louisville Muhammad Ali International Airport	19bb1b8c-6d08-459f-a5e2-62980f8ef459	t
9afbdb9b-af3b-4f73-b41f-fa462a99a797	SEA	Seattle–Tacoma International Airport	bfc9149a-c011-4702-905b-5d9a39f06c74	t
938250d7-7c35-48f5-8bd8-e711b218fb9e	SFB	Orlando Sanford International Airport	91f338e1-603f-4548-9348-5c1f987c603b	t
aacafb77-7423-4ebd-b4b0-67c1d6f6840d	SFO	San Francisco International Airport	9942030c-b8d3-4d5c-8548-d49fa4e0cc91	t
e0807cf5-db36-4dce-9980-afe0e6f64653	SGF	Springfield Branson National Airport	fb1eef3d-17b7-4900-ae5a-a1d5b9468a23	t
ebe2e967-dab2-4e96-9f81-3a6fcef2c772	SJC	Norman Y. Mineta San Jose International Airport	fc81f3ce-8697-4dce-ad02-014d07a27d60	t
f593015a-f1c8-4f4c-a6bc-15bfd0509347	SLC	Salt Lake City International Airport	0171d726-1b8b-4912-8a2e-70d1f7af8f0e	t
e9f9869d-fd85-435c-bb4a-940d1e14585b	SLE	Salem-Willamette Valley Airport/McNary Field	8b84aac3-2e27-4276-bc43-b488c82a3581	t
d62f5963-e553-4e3d-bb37-e9a327ed351e	SMF	Sacramento International Airport	8a612b81-ecc2-471f-af3c-88b43ce1c223	t
9df6b091-c136-47a4-b064-539a0f6fb078	SPI	Abraham Lincoln Capital Airport	fb1eef3d-17b7-4900-ae5a-a1d5b9468a23	t
f6ae436c-7276-4fd4-933b-c56ba5ce363e	SYR	Syracuse Hancock International Airport	d10891f7-27e1-4012-8e6b-bf8be41110b2	t
df069888-1dfe-4b45-a343-e4466738d1f3	TOL	Eugene F. Kranz Toledo Express Airport	0e5a4478-ec63-47d9-b3a4-fec36945057e	t
6da157a6-6c2d-45ea-b0db-c8f293e2535a	TPA	Tampa International Airport	d6b27618-3b86-4cf7-b01b-84aaaa45cc22	t
9508a985-f2ef-4a88-befb-af6cf6352705	TUL	Tulsa International Airport	845af5d9-ee00-4487-9524-ddd899fd2861	t
56cc76e5-44d7-4299-ad82-b61a88743cb1	TUS	Tucson International Airport	fa467389-ddab-4f78-ada5-455338500c6f	t
ab0eaff0-5f77-43e7-b354-e8ca4a9b2714	SOF	Sofia Airport	11394023-1d99-4c85-ab4a-6adc3a18194d	t
85d10d59-1744-4103-9c3e-42774823a1f4	DBV	Dubrovnik Ruđer Bošković Airport	1d08ba78-8f99-4601-b06d-1b0ee6455fdf	t
25eec7e3-5f37-4237-982b-173e8a6bc516	SPU	Split Saint Jerome Airport	5f8b4632-917b-4763-a1e1-5dde5e6c6343	t
26952d55-d135-456e-a362-3983e575faf7	BIO	Bilbao Airport	36c51e52-f341-4a85-8cc9-d21dee6715ce	t
21b23bdb-6a3d-4784-8ab4-7d04669c3a58	BCN	Josep Tarradellas Barcelona-El Prat Airport	fb077225-7a09-4a1f-89b4-a50e666ffd18	t
431eb263-2ea9-424c-b7ed-8b8e6965434d	MAD	Adolfo Suárez Madrid–Barajas Airport	2d71b01d-8518-4158-980c-2fe93ea216ed	t
cc988cc0-6789-43eb-a082-7e413a5337bd	AGP	Málaga-Costa del Sol Airport	5f3ea0ea-88c5-4407-8250-91eefce4e239	t
41778526-f70e-49b8-b632-26b634ab090d	VLC	Valencia Airport	9fda2a5a-9e06-4350-8931-a111ba640a80	t
662d8589-a67d-4a6b-9902-9d6b78e9cf95	ZAZ	Zaragoza Airport	520c6702-ab37-4407-9e40-2dba6ff3599c	t
e6ba6a72-214b-403f-ad6e-8d1e3fe1eb13	SVQ	Seville Airport	739b2d72-3cbc-4102-be28-ebf370b79e61	t
dafdf927-106d-4ea7-912e-c0f38b8ca3f1	BOD	Bordeaux–Mérignac Airport	fb9c3759-a481-4135-97e2-1d3f9efdfd73	t
910db839-1854-41ad-b2e3-45718f7d47d3	GNB	Grenoble Alpes Isère Airport	a24f3ab1-21e0-4faa-a156-76f4c8d54fbb	t
22102252-e9c4-4d34-ae54-4e45706606c2	LBG	Paris-Le Bourget International Airport	c44b0f6a-e712-4de2-9d21-e4885a4093d2	t
675e5f92-4844-410e-ad01-f7f9f013867e	NTE	Nantes Atlantique Airport	c97ea522-8047-4830-867f-c8571170c364	t
0ba0dd67-89a4-430c-ac4f-e5e9cf3bc7a4	SXB	Strasbourg Airport	d6324fef-436d-4286-99ba-6888b193339d	t
e6d15c87-e747-4972-81c8-6c55c4c73714	JMK	Mykonos Island National Airport	0376825e-238c-4ee0-a8d8-28486fcf3e95	t
0518bc6b-cd71-4899-8698-5890de763d76	SKG	Thessaloniki Macedonia International Airport	e503467f-0996-4871-849a-5ebafb272745	t
15f33a2d-5492-4514-bf66-9e89595e34f7	BUD	Budapest Liszt Ferenc International Airport	fb4e4438-c97c-48b5-a9a0-fb85731da429	t
26ac71de-e1d3-46e8-bef0-0477233a7258	BRI	Bari Karol Wojtyła International Airport	9650084e-5117-4903-bc95-72efead42bf0	t
4e862d5a-7cc7-4d1d-8948-07677fe86477	CTA	Catania-Fontanarossa Airport	8ffe765b-5c92-4c54-9bf5-8aaf577170b8	t
61dd7cf7-c00b-44ba-9d04-3fec23b82dd5	PMO	Falcone–Borsellino Airport	255a2631-532f-48ce-b7c3-6c6f8cfb7198	t
928db8ce-b5fe-407c-9f4c-b3b215a5a3be	BLQ	Bologna Guglielmo Marconi Airport	3d555d7f-ad61-4706-a137-691a3b805801	t
daa1d8cf-2340-4921-9ca0-d6e10b3ed29e	CIA	Ciampino–G. B. Pastine International Airport	5d73405c-f6ac-4377-a7c5-438e0f555d2b	t
5a0b0b87-00c9-40ba-b1b4-edd5802fc4e9	FCO	Rome–Fiumicino Leonardo da Vinci International Airport	5d73405c-f6ac-4377-a7c5-438e0f555d2b	t
f2b53753-b967-49e4-8d0c-df8f5b4b227c	QSR	Salerno Costa d'Amalfi Airport	266cf456-ad8c-49e0-90cb-112cedcdef3b	t
11bbc90f-4679-4eb3-8b27-be536c20e1e2	PRG	Václav Havel Airport Prague	9bee070d-4409-431e-9b05-f0d1c1421888	t
79cec936-eb89-4dd0-b5e4-fb290aab3970	HFA	Uri Michaeli Haifa International Airport	aae1a4aa-49c3-43c4-8965-6e91dab8b2db	t
3c8fa35d-6923-4e32-b1ae-7aae0a839a08	MLA	Malta International Airport	f320d591-be52-413c-94f6-782338078ea6	t
1bab8283-38f9-4045-83d3-88c44cfc7178	INN	Innsbruck Airport	e06b59df-c56e-4737-b57e-30f0bf33a058	t
2e731b18-4f16-4f90-a14c-cf831f8633c3	SZG	Salzburg Airport	badc0621-0c64-4e70-974a-f40bb719addc	t
defd1ac2-daeb-4da4-9506-b42304eb2571	VIE	Vienna International Airport	cd5ed95e-640a-4674-b0bd-ecfcd075f1b9	t
42d7dc03-bbb7-4777-98e1-892a90b29947	OPO	Francisco de Sá Carneiro Airport	c28e53f8-f0b1-4b55-82dc-cd59771b5c4f	t
e8d78898-bc76-4ece-9282-b8234876c90b	LIS	Lisbon Humberto Delgado Airport	227d2e0f-2e58-459d-bc3a-397b688e3147	t
de3b8903-4f46-45e5-b1fc-bafdddb59a85	SJJ	Sarajevo International Airport	11e3a491-f8ed-4ddc-9fab-f08ab3483a09	t
fa49f515-59fe-454d-95f5-2e3f16b9e631	BBU	Bucharest Băneasa Aurel Vlaicu International Airport	fa6be375-a740-49f6-980c-128127c8ea6f	t
9e3efb74-a41b-4f7c-86cc-ffac965b6670	GVA	Geneva Cointrin International Airport	4a820a76-e7d9-4ba2-a845-eb8678c4a8c3	t
62415348-916b-4e03-8b64-1e9b9f7ab707	ZRH	Zürich Airport	c71af616-ae66-4a32-a821-9417d47e3fb8	t
7c1e1d83-2886-4116-9ea7-a97696dfce9a	ESB	Esenboğa International Airport	e0e6cdeb-58c3-4c62-9a2a-e8ed02887f1a	t
7b67dc38-5e2d-4c5d-bb0f-d574177fdd9e	AYT	Antalya International Airport	516e93db-00ae-4bc9-8337-0e1f656c0833	t
19d1aab4-0224-42bf-b3cc-0e271389adfa	GZT	Gaziantep Oğuzeli International Airport	2f46378d-6968-463a-887f-3d63a3b60afc	t
5eb59610-8e9b-43a4-8133-1ea2b8f132fe	KYA	Konya Airport	e50587d1-465c-4431-a9e8-0355d245f7dd	t
0c3fe839-8e83-4090-a752-a1527668e359	MLX	Malatya Erhaç Airport	780a822b-9fab-41ce-a3c6-39163bb46cdf	t
c3ddc61b-ddcb-485a-b85e-f03b71f81a5c	ASR	Kayseri Erkilet International Airport	900dce96-fbc2-4269-aa50-3deeb5c8fc07	t
8b403695-3f8c-4c32-8802-cf35bd5bf49c	AOE	Hasan Polatkan Airport	069cd4d7-3f48-40ba-9fe7-c20cf367942e	t
41b0eb7f-4c34-4995-af14-4d6b7c4a7df6	DIY	Diyarbakır Airport	db69bb09-33dd-4cb2-93ed-f1a0b1744544	t
10ba559d-3979-4443-8e75-06f943ddf92e	ERZ	Erzurum International Airport	6883ac29-9b7e-4d3f-b4b6-e33f463290ab	t
78b90c61-b31a-47e3-800e-f06c0510e533	TZX	Trabzon International Airport	d620158a-ad65-46bf-a4aa-88c8f65ad408	t
106be658-07ed-49de-aa70-c3249a434e87	VAN	Van Ferit Melen Airport	3f2b26e0-1819-4c33-83ee-6b70c9fd62e6	t
87c4c9bb-191b-4477-a350-8a308b307c00	MQM	Mardin Airport	08da31c0-871f-45e1-bcb1-6e22c9b08fd2	t
3a716bcc-1a47-4ce1-8fc5-0a6591db7fe2	GNY	Şanlıurfa GAP Airport	2b77aef9-4bd3-4551-b530-484124c972bb	t
cf62ee06-2dee-41f9-be0e-d6a6f4acdc53	COV	Çukurova International Airport	9ec63d71-d2d9-401f-b9cc-f79142651c30	t
db73c02b-c90d-4626-b4bc-015b86322a8b	BJV	Milas Bodrum International Airport	e02b8e8b-aec6-4c79-9736-25705d59bd0c	t
b56fa739-9dc8-4c32-941c-773cf639bce1	SZF	Samsun-Çarşamba Airport	f6daf03e-900a-4569-b6db-371450508f5b	t
22ab7c30-ed33-414a-98a6-37755c09df9c	IST	İstanbul Airport	cc460ad3-69bd-4bf5-ae34-e54e7f994d75	t
70fab0c1-591d-4c42-aad4-34583b283e22	RZV	Rize–Artvin Airport	8201cfe9-ee45-49cb-bdb1-5b101595cb94	t
1edb20cd-c3f0-419b-87b6-7ccfd4553cb7	BEG	Belgrade Nikola Tesla Airport	f4ce2e0b-00cc-4e25-b77c-200f20c42205	t
a71b4dde-f607-48cc-88c3-313a9d578f48	TGD	Podgorica Airport / Podgorica Golubovci Airbase	82065f66-96cc-4cdb-8a60-5f2db5bba12e	t
9ae88cd5-6071-4353-932b-f245329bd02c	BTS	M. R. Štefánik Airport	94dcab02-a1b5-4474-b05e-1c5d47eb2ab9	t
1fa66293-8b37-441e-adef-a289ee1df2c6	SDQ	Las Américas International Airport	c5c19ecb-19a4-4007-ae8a-dbafa00d95b0	t
5a1838d7-fd73-40aa-b500-43c0476180d5	STI	Cibao International Airport	b8e51427-c615-4b22-8336-1182de06a617	t
0bf3ad70-64af-494d-bf66-cbe886375928	SAP	Ramón Villeda Morales International Airport	ff020dde-e12f-4965-986c-8215ff507719	t
759bf916-26d6-4c0c-8936-e02b35ed1b0f	TGU	Toncontín Airport	ef420bb6-b676-4795-9d6d-8b537d9ed602	t
a26d7ccd-0a53-463c-9df4-1aa56aadf43a	KIN	Norman Manley International Airport	8411903f-c1a6-43a5-a7d9-3f2bece57070	t
e1f4e25b-5793-418e-a3f7-10b39f848464	ACA	General Juan N. Álvarez International Airport	9aa7a95f-9b52-4e8d-abe5-b5bebbcfa2c9	t
8b37c360-c8ff-4ee2-8772-479c30ccfcae	AGU	Aguascalientes International Airport	3fb63066-2239-4811-9a8e-5187df310103	t
18d103ca-f433-4630-b7ab-b3878100560d	CUL	Bachigualato Federal International Airport	10b9131c-f5d1-48bd-b8af-67f29f7a9ff8	t
d45de12e-063e-452d-be0d-b9484422d376	CJS	Abraham González International Airport	59c118f8-8265-458c-b6bd-3bd208fad387	t
a3f74732-b840-4278-b25a-6e494a4c2ee9	CUU	General Roberto Fierro Villalobos International Airport	c8816d23-cb02-4e3f-8010-33abbcef2ca5	t
c47e0dff-b864-4817-afbf-d356b15ec57d	DGO	General Guadalupe Victoria International Airport	a388129c-e2a5-4e0f-8399-2d1fd7d7084d	t
782bbe47-5f79-4517-8f89-456b895e13cc	GDL	Guadalajara International Airport	c5250ccc-1cb5-426d-a148-0cfac43ec94a	t
80ca9e20-1445-4e54-8deb-ae23f2dc3bb6	HMO	General Ignacio L. Pesqueira International Airport	40bd5ba0-1ad6-41ea-918f-2bcb77f868cd	t
4d54aba2-35b0-4080-acc5-8ce361076b95	SLW	Plan De Guadalupe International Airport	f508dbaf-99bd-4d9c-b447-48213d7c0bd8	t
90b6964b-88a2-4d91-a739-1fb868fe59c6	LAP	Manuel Márquez de León International Airport	cff37066-93e9-4d5a-8466-7e577e0f3142	t
a565813b-c99f-477c-ae7d-6dfff8c28792	MAM	General Servando Canales International Airport	11bf2350-af64-4ad6-b909-c87810b727ae	t
0276073f-7406-49df-a476-5e9b59669353	MID	Manuel Crescencio Rejón International Airport	15d95859-0d60-4501-b1f0-3611d04d77ae	t
60d29d35-02a3-49a0-8832-967726e2567e	MXL	General Rodolfo Sánchez Taboada International Airport	8644c2df-091a-4016-a699-59965da7b192	t
6839e190-5f6a-4d4a-a085-2369e13af1b0	MLM	General Francisco J. Mujica International Airport	cc808f5a-0fb6-45ef-8b57-06863db84fbc	t
18452521-ddb4-4d5a-9ec4-d7efc67d27c7	MTY	Monterrey International Airport	ac51d41b-5f6d-4387-bb29-6ec47ebf5f2d	t
70876ef4-994f-47b1-821e-faa6cc63bc89	OAX	Xoxocotlán International Airport	d326855e-9e83-41f1-943b-3ea981eb9786	t
141a154b-7c74-4e45-87ae-1b780c863989	PBC	Hermanos Serdán International Airport	54528fd8-4e29-49ca-a1ca-f7fc5249d708	t
b25cb027-016e-470a-815a-e11a68c8b509	QRO	Querétaro Intercontinental Airport	dd14ec08-c251-47d6-a716-f481654cac94	t
196fc0f9-9ad3-4b85-bf45-f470861fa2ee	REX	General Lucio Blanco International Airport	16a0c5f7-7e0f-4bee-b972-dea98516c20c	t
33034970-5fa0-4d2f-84f0-b667f7c233b2	NLU	General Felipe Ángeles International Airport	22c345c6-a45b-406c-80bd-b97c12b33641	t
31b15e52-af65-4946-aedd-15dc4db08b6d	SLP	Ponciano Arriaga International Airport	8e1cad1a-9e43-4076-8ba3-88bba3727c3f	t
8c171529-51aa-4721-960c-bc73af3530c0	TRC	Francisco Sarabia Tinoco International Airport	6cf9cceb-0ca7-4770-8b19-35a69bc2c2f8	t
d699f55e-0a84-49b6-a9ea-8b72722ee9de	TGZ	Angel Albino Corzo International Airport	966cb875-bece-4557-96bc-9d5e8c1ce3a5	t
f7b86083-5bb6-42f6-987d-611a619a858e	TIJ	General Abelardo L. Rodriguez International Airport	9cae2538-dac0-4e0a-b136-482a97d8a3f7	t
85173814-50c6-475f-8456-c0a4609123cc	TLC	Adolfo López Mateos International Airport	14dbd9e8-a466-489d-9ff8-d69b46d71d3c	t
7832f279-4d1f-43a4-84f0-15aabd4bf82d	CUN	Cancún International Airport	e42ecc4d-02a8-4cc1-b2d7-e2ddfdf5feac	t
8d8d5423-2324-4975-abc0-508b28b8a790	VSA	Carlos Rovirosa Pérez International Airport	85d784d5-8500-4785-bb10-85fe4b07a03a	t
2d62057e-4b56-45d1-84c6-bfd09989b7f9	VER	General Heriberto Jara International Airport	343ca887-1000-4943-8edd-1bf732728b78	t
3d36e1ec-4c86-45dc-ba71-c87646130393	MGA	Augusto C. Sandino (Managua) International Airport	df2b07c1-9086-4d90-867a-efd30c64c88f	t
d6bceb7c-0d58-4ea2-8766-5f6d08c4b4db	SYQ	Tobías Bolaños International Airport	fc81f3ce-8697-4dce-ad02-014d07a27d60	t
19996bc2-faae-4ebe-b93d-5a77a410819c	ILS	Ilopango International Airport	bcadc15d-b89e-453c-bbd6-4b919b98ac20	t
e882ad8f-280b-4345-aef9-f9087bfc80ec	PAP	Toussaint Louverture International Airport	b10d56d4-a515-4450-b6c4-8bbdcbfa7cfb	t
a744c7f8-bb85-4aac-a02c-9f89f79a599c	SCU	Antonio Maceo International Airport	b8e51427-c615-4b22-8336-1182de06a617	t
0c7bc18b-95ea-42d0-9d13-c30fd6af21a9	HAV	José Martí International Airport	6c4f5b68-01ce-4df9-820b-26f6d9e49bc4	t
6dc3d781-2ef6-43d7-847d-5df12c18c0a1	GCM	Owen Roberts International Airport	333c8fd1-8e1b-4c7e-ab4f-fb34a52f8043	t
313728e2-d9e2-4b6b-9de0-3aaafd88bbc1	ZSA	San Salvador International Airport	bcadc15d-b89e-453c-bbd6-4b919b98ac20	t
5be8764a-9a67-4e4a-b0e2-60d2a3b38403	PHG	Port Harcourt City Airport / Port Harcourt Air Force Base	dc9d58a2-c220-434d-89a6-c28381d7671f	t
26d70d80-ff0b-4538-ae91-7ffd06784f29	AKL	Auckland International Airport	9518c062-8a19-4610-b683-28b032f4639a	t
6a9e5806-7382-4dc0-870c-7ec7484935e8	HLZ	Hamilton International Airport	78f3ac44-53dc-4dc2-b920-b6da9f9c4aa2	t
67f97246-8ec6-412b-ab2a-dea7d7048d70	WLG	Wellington International Airport	b56366d7-9d35-44e7-8c90-f728bb4af9c0	t
ce8d23d6-7fb0-4226-909d-a7c9e48e2e34	KBL	Kabul International Airport	7e3544f9-3de9-46a5-b6d8-140cf0c39ba5	t
9fac9f7c-9e1c-465d-8421-81da060e4ed1	KDH	Ahmad Shah Baba International Airport	e715c041-ba1a-47b9-9afc-0ad37e800055	t
204b4791-db0f-450e-abc6-0188cdf3c0dd	BAH	Bahrain International Airport	6e567d78-c5e9-44f2-8787-a0d32657c2c0	t
1176a3b4-eacc-4cd9-b020-1de07fa52734	JED	King Abdulaziz International Airport	62387fc6-e308-458c-a07c-9ea524ff2653	t
3d38d1b8-eab7-4fa8-8f4e-e9f0c6c3431e	MED	Prince Mohammad Bin Abdulaziz Airport	dac25dd7-44e3-4d46-a876-29971d426d8d	t
ebe8bcb7-1cfe-4c90-bec1-ba334e200451	RUH	King Khalid International Airport	d66d0512-768e-4d47-9d4e-6edc8b130731	t
7aae5f94-422d-432e-b4a2-b843202ef354	TUU	Prince Sultan bin Abdulaziz International Airport	3cad9646-9364-4ed0-8080-7e32510eebfc	t
042fb969-6225-402a-b0d2-9877d0d14859	AWZ	Qasem Soleimani International Airport	e186a5e3-d4c8-4c63-bbe1-5074ab09f9a1	t
ccc9c2b3-7234-41c0-ba44-ca4e6c7058fe	KSH	Shahid Ashrafi Esfahani Airport	e8001fc8-91b3-4afc-8a26-be5cb0d216a6	t
875e9d88-b27f-4152-b7db-00ee7c2291d5	IFN	Isfahan Shahid Beheshti International Airport	b3b55b20-a870-467e-8713-a219c0941b67	t
6b3c7072-93a5-484d-8811-f37aed686d11	RAS	Sardar-e-Jangal Airport	cbf21b81-0396-445e-8c17-1d6fd9a5f4e2	t
f84d457e-837b-458b-bfd7-02232d48846f	HDM	Hamadan Airport	d62801d8-64d5-4f17-83bf-86190f750c4b	t
3657a853-e1f2-4a35-b3a2-c3a0b6c3b885	IKA	Imam Khomeini International Airport	b9bb8f8a-d405-44fc-808c-e3f4174ff23b	t
f55615da-dedf-4681-88bc-281548c11bfe	THR	Mehrabad International Airport	b9bb8f8a-d405-44fc-808c-e3f4174ff23b	t
236250ff-c085-45d8-a794-698eb7e9ae73	PYK	Payam International Airport	70f1e173-2742-4717-86de-c12a343b2b2b	t
6ce8b515-df16-456c-aea8-317895f449c8	KER	Ayatollah Hashemi Rafsanjani International Airport	49308a2a-a4a0-401f-8577-d1ca53bf2b76	t
d2d6dbd9-431b-4417-88ad-6bf47c0218de	MHD	Mashhad International Airport	61e1e72e-be50-4312-9a21-9856f0ab4017	t
903c731b-20ff-4c4a-a358-5d0580682e62	SYZ	Shiraz Shahid Dastghaib International Airport	39227d08-0202-467d-888d-a698977a3133	t
6efcf255-5215-460d-bf18-77c0fa9ef678	ADU	Ardabil Airport	0b48b978-1015-4906-9d3e-97b3bec52a00	t
347d001c-9ced-44d3-8ed2-5cea459da327	OMH	Urmia Airport	46f898b6-d883-4a90-a959-8cecffc4c25a	t
8ba35742-a7d6-45b8-994f-665118023603	TBZ	Tabriz International Airport	29c69ec5-7793-4476-bd7a-19cd7f8e828a	t
4a6b1eb9-f5cb-44f8-a198-b6394feea4a7	AZD	Shahid Sadooghi Airport	e3ac908c-2c38-49e3-8453-771d7a6ada79	t
0896eee4-17f1-4dc1-8bc8-45dfa6e2ce6a	ZAH	Zahedan International Airport	690504a6-31f8-4f54-a4ee-3bf427184a90	t
81135e37-1ab4-45f1-b17d-654d4a9471a5	AMM	Queen Alia International Airport	e16b83eb-6c26-4db1-bbfc-f6fa508a56fa	t
cb39e7cc-6540-4f57-b2d1-f34963ee1b8b	ADJ	Marka International (Amman Civil) Airport	e16b83eb-6c26-4db1-bbfc-f6fa508a56fa	t
e8139780-81f1-4aae-88b5-e5abde242cf7	AQJ	King Hussein International Airport	a0d90334-aedc-4260-a5fd-f38d8d003f39	t
c75678f6-68e2-4b89-8598-8288fbb776e0	BEY	Beirut Rafic Hariri International Airport	5e33ac2b-1d05-4cf9-97b1-2b4cf030707f	t
e5e0847a-0f1d-484a-8b2b-9ed2d85ab3d0	AUH	Zayed International Airport	3e84bc90-ff4a-4dd5-b154-56d7e1d99d1d	t
de45f0af-0a7d-42bc-9d76-4549047af66d	DXB	Dubai International Airport	3dcfa53e-c94b-477c-ae20-4bea73d03fa9	t
9126b7a3-2609-4206-87dd-0208f4fa515a	SHJ	Sharjah International Airport	ae24bc99-152e-4978-84cc-d35c3a7cab92	t
2c7892b6-76ea-4b53-a332-9cf2577ef7ec	BHV	Bahawalpur Airport	26fb3fe0-5096-42e6-a3df-f8a2055b75e5	t
cd4be655-4b32-4ab7-9b29-882a901ee20c	LYP	Faisalabad International Airport	909cad52-1e90-4681-9413-995a3c099ca2	t
e7f6a48f-d847-4e88-956c-b358cd905c3c	KHI	Jinnah International Airport	71ec3a8e-e6c6-4bec-a7f1-256a01ab25b6	t
bc1ac1af-53fd-4822-94bd-8cb0c8d2399a	LHE	Allama Iqbal International Airport	744245a8-2b58-434c-8075-37e56a672bcc	t
1e70a528-553e-44e8-85fa-ccbbb403729d	MUX	Multan International Airport	65cdd9bb-cafb-4310-b276-b840e9d8d435	t
af95d0fa-6977-43fa-ae05-d83bf26636a4	PEW	Bacha Khan International Airport	d1b8d1c2-6325-405d-81ca-4f7ca332e670	t
2c30383b-99d0-4588-a485-eccd5f513634	UET	Quetta International Airport	b5f73ec9-95b2-4070-88eb-be3f1bd6a097	t
5a7e3a50-9490-4809-8875-2f160d47c1ba	SKZ	Begum Nusrat Bhutto International Airport Sukkur	ca72f017-345f-41d9-8ec9-2d89dee8c12c	t
db50e1b1-c4aa-4007-b147-d85b2751b2c9	BGW	Baghdad International Airport / New Al Muthana Air Base	e195fbd9-20dc-4d96-9960-46ce5a0f452b	t
2a4247ff-54ef-407d-b0ea-274fe6429283	KIK	Kirkuk International Airport	097360e3-61a9-4a40-97c1-9f2a96f95235	t
0ebfd55a-05fb-462c-a8f4-6ad9acad87f1	BSR	Basra International Airport	4aaeeaa7-38a6-43b1-8d58-12e5d187397e	t
9cfa3f37-3749-42e0-bdb9-422574bf3f5a	ALP	Aleppo International Airport	20597cea-816f-4e92-a772-d3595db68b28	t
f3f24b16-04e9-49a9-907d-61fc879542b3	DAM	Damascus International Airport	1ddd046c-1634-4e57-9baa-88c0b0879093	t
c3834b44-0d2e-4a56-9950-2c77b8ae64aa	DIA	Doha International Airport	66752406-6028-48f3-ba2c-64e0906febd9	t
779ae7b5-1554-4714-9622-dc1251801590	DOH	Hamad International Airport	66752406-6028-48f3-ba2c-64e0906febd9	t
ff70ff12-cce4-4ec4-a1a6-fbe49ff32b86	ADE	Aden International Airport	bbc27c0f-3c31-4909-9a27-7312f12be774	t
7bf86f9c-285d-41af-81e9-0438d138d8e1	SAH	Sanaa International Airport	0a37d433-4a46-4707-8d8c-e0311aa871d8	t
f8fb7c6f-9b63-4ff5-93c3-6125152305c9	PIF	Pingtung Air Force Base North	b45e8209-2466-48a0-ad81-774a1f716861	t
798143a1-612d-41cf-8090-54efa9a23b8c	TPE	Taiwan Taoyuan International Airport	721ac053-a91d-441a-870c-26b3ceb94c9e	t
e3faaba4-bf2d-49b2-a428-be21365725b7	CTS	New Chitose Airport	28fbd961-79c7-445f-82b9-6eca8659592e	t
37082580-45d0-47eb-8775-eb8ab1344249	OKD	Sapporo Okadama Airport	28fbd961-79c7-445f-82b9-6eca8659592e	t
8f217208-53a7-4815-966a-a53dabdad491	FUK	Fukuoka Airport	dceddea6-5d5b-4232-a2c3-835fd84d4ff3	t
bfa9bc17-8e6a-4208-aee7-678b0db84e48	KOJ	Kagoshima Airport	0df05dec-91fa-4148-9d20-cd34f4c23253	t
fe635442-85f0-443d-8d8b-38d95909310b	KMJ	Kumamoto Airport	d00fec10-9234-42bf-80a4-7b279f6af4c3	t
64b26e2a-36f5-44b0-8a92-b39ecf81b01b	NGS	Nagasaki Airport	22e464da-7fdf-4116-98cc-8e1507b3b36b	t
44138af2-3d4a-41fe-854f-7d1d7372b5a1	NKM	Nagoya Airport / JASDF Komaki Air Base	a46e22f9-43f2-4f77-858f-8b8563fb72a7	t
6278f149-865a-4f3b-a52b-f78cb5142eac	KMQ	Komatsu Airport / JASDF Komatsu Air Base	371f170a-f823-4296-9cc6-26e72944eec0	t
8ec5b4cc-a606-4347-9e78-3d540384ea64	HIJ	Hiroshima Airport	8d45fe12-1dbe-476e-8641-ee0b31fd32b8	t
9dfd0380-40e7-4db8-abd5-0e8b790db137	OKJ	Okayama Momotaro Airport	87736d36-1632-4357-b4d3-b62ad44efb91	t
f6df4943-13d7-49a9-b2b1-533860aa3ee0	MYJ	Matsuyama Airport	1a3f3480-fbc0-499f-8459-fa6eb6ce8b71	t
4ccea9a7-cdce-4414-aae7-a4dea30818df	TKS	Tokushima Awaodori Airport / JMSDF Tokushima Air Base	dc813ac0-f1bc-4922-ace7-531f1aeed0d9	t
0d268179-70e3-4df6-a2fe-a8f226196b87	KIJ	Niigata Airport	3ae86f15-480f-4b9d-8da4-a2ee7f5d9edc	t
990a61a8-a61a-49ee-abb0-c9ed2f0636b2	HND	Tokyo Haneda International Airport	b6f41e9b-21f7-4e30-aad9-bd38532e25c2	t
e55b24be-200b-42e8-8c1f-8d35d1a59a1c	KWJ	Gwangju Airport	71b646e5-5cc9-42aa-a371-d22b67cbe38b	t
559b7b6e-363c-42bb-adf6-90f958a176ed	PUS	Gimhae International Airport	d0cb6ea7-a58e-4fa8-aa41-ea13a385730b	t
de60b441-1d43-4415-b16d-0d3662f05393	USN	Ulsan Airport	0a950338-916e-44f5-bb21-6f5814ea415a	t
e85051dd-23af-4706-8658-f798b8a5bf9b	ICN	Incheon International Airport	40597543-2a9b-4017-8a20-5993f9ed0203	t
9b574db5-f1c2-4ee3-99eb-ded265a144e7	GMP	Gimpo International Airport	40597543-2a9b-4017-8a20-5993f9ed0203	t
412035ca-06e2-4939-90ce-18e175fd51ef	KPO	Pohang Airport (G-815/K-3)	15f1a7d9-11a4-47f4-8c3f-357b2248f43a	t
e0b52f78-a553-4560-ac46-028a1aab541d	TAE	Daegu International Airport	fa5ce01b-b20f-423c-b06e-27b6269e227d	t
c5e7d1f7-1300-4baf-a5ff-f34699d1d14d	CJJ	Cheongju International Airport/Cheongju Air Base (K-59/G-513)	cdfd419e-d9ac-4985-824f-51ddd4c565b1	t
34b3a7b2-1560-4327-b8dd-d36692ce369e	OKA	Naha International Airport	9e118683-bf17-48cf-832d-3432205f761f	t
8f727d42-e0df-452e-bb4d-3dc234a1aa71	DVO	Francisco Bangoy International Airport	536a4736-cd89-40e8-80e2-02d20a950399	t
b2d8d3c9-cf88-41a7-9da6-73675b34f40f	GES	General Santos International Airport	5c117a9e-16d0-4136-b3fa-1f6db72f026b	t
920f824a-eabf-434c-833d-1949d8d61f49	ZAM	Zamboanga International Airport	043d02b0-d0ec-4d43-a9b3-b56c96eeab8d	t
5b5e4fb1-7eb8-4779-90f1-eec59dae392e	SJI	San Jose Airport	fc81f3ce-8697-4dce-ad02-014d07a27d60	t
8c38d257-58e6-4051-b426-9a5f8ace0095	WNP	Naga Airport	5b756aec-de88-478a-a313-a5a4dcb215d6	t
046971e5-8d40-4533-995b-4d4ac835680f	ROS	Rosario Islas Malvinas International Airport	d6bebda4-9963-47f3-8534-0fd29224fd94	t
561ee7d9-1c5c-44a8-b0cf-7ce4ddca6773	SFN	Sauce Viejo Airport	6cc9fe42-d85d-43bf-af1b-4e6f148d7a50	t
35fb879c-2aad-457d-9d97-02e776a4117d	AEP	Aeroparque Jorge Newbery	4009e03f-c1ce-4b65-93dd-9dbba0fcaa5b	t
6ee8048d-fbd3-4ff1-a971-36d6b7c41038	MDZ	Governor Francisco Gabrielli International Airport	1f018b65-9cd6-4537-b837-65a81dbcc308	t
eba27cda-f361-4f6e-868f-40583f564ec7	UAQ	Domingo Faustino Sarmiento Airport	033474f8-6a11-437b-90ef-e3b437236372	t
1031e0a5-63e5-46c6-ae5f-549c20d5117c	LUQ	Brigadier Mayor D Cesar Raul Ojeda Airport	3bb612ec-7952-48ea-9911-b0a3ffdf5308	t
160bc91f-e0a5-4fa9-9d49-3973a0dc66e3	SLA	Martín Miguel de Güemes International Airport	ba5fbe1c-8cac-4dee-aed4-3ba737dcd6f4	t
631a9aca-c157-419d-8f7d-66ab9801ea9a	MDQ	Ástor Piazzola International Airport	2b528850-d2fd-4a9e-80ea-db4ce7e7e3ef	t
72104a00-0c27-4643-998f-28b8cc5af9ed	AJU	Aracaju - Santa Maria International Airport	15073f3f-78b4-433e-abb3-260fd8c80ca9	t
394ea280-477e-4eb7-ba5a-55faaf2ebed4	BEL	Val de Cans/Júlio Cezar Ribeiro International Airport	18b8c53b-0b3c-4496-a310-e347a1e5721f	t
fb75c671-2c6f-4fdb-9a8c-60c9f34e1aa9	BSB	Presidente Juscelino Kubitschek International Airport	44497c6f-18f0-488b-8fbe-1add50380aa9	t
661de048-cc8b-438d-b3f0-c853e98a2da3	CNF	Tancredo Neves International Airport	db42a054-13d6-4b8d-9125-b5107cb34cb4	t
9ef8720b-ddb3-4335-b7de-929ef02ece05	CGR	Campo Grande Airport	a99fc2ab-d78a-4cac-ac24-1d1dccd4dcfd	t
7d93bfea-93ec-4310-9055-7ad07e345bd5	CWB	Curitiba-Afonso Pena International Airport	fef13e83-d27f-423b-9cea-fca16201e139	t
638f30ff-e98b-4a84-bc3a-0ea57f562b35	CGB	Várzea Grande–Marechal Rondon International Airport	3336c857-6576-4059-84e0-600efa42e4b7	t
3012728c-1053-4e3f-a891-f82caf2ae374	MAO	Eduardo Gomes International Airport	e6bb15d0-fb0a-44eb-8090-78e25ae23552	t
9180a26b-e55f-406f-87bf-c13cc39568af	IGU	Cataratas International Airport	02d95e9e-dbaf-4737-91f7-2f693f53a944	t
354dc4fe-5bde-422f-bbe0-9790b39b33e1	FLN	Hercílio Luz International Airport	81b93093-9f07-478e-b335-902a6a0db46e	t
1b7ecf85-18b6-427d-b64d-eb7a6c21b47a	FOR	Pinto Martins International Airport	9b173358-11f0-442d-b859-f2cbdc3a8bfe	t
09f3addf-95e5-4aad-96dd-31cc0dc65126	GIG	Rio Galeão – Tom Jobim International Airport	6c835c2c-bb45-4375-a406-ecf880616c2d	t
b220f7bc-1bc8-4459-9bc9-9aa160d92a4d	GYN	Santa Genoveva International Airport	fc01505e-064f-4714-b43d-bea6e9f1b2e5	t
ac1b3abd-3d03-4c7b-9020-dd7e816e8420	GRU	São Paulo/Guarulhos–Governor André Franco Montoro International Airport	b8dfa00e-5618-4007-a1ee-5c241ded4841	t
cf5b115e-fcac-4d9d-84ce-873e9ab76909	IPN	Usiminas Airport	2118c434-1812-490a-aab7-0c714f2dddfb	t
cd8589bf-e6ed-4bf1-8207-1d1b5b63a340	JDF	Francisco de Assis Airport	4c8d8cf1-6e98-4be4-b966-d2985fc11fd1	t
6d22419c-e043-4708-ba6c-ab14b97f42f8	JPA	Presidente Castro Pinto International Airport	2835f7ca-f364-444c-809f-a819385406fb	t
484f75a9-4991-4323-b548-38fb984dfad5	RRJ	Jacarepaguá - Roberto Marinho Airport	6c835c2c-bb45-4375-a406-ecf880616c2d	t
2aaa991f-fecc-485c-b282-0e5521fc129c	JOI	Lauro Carneiro de Loyola Airport	a0470978-d40c-4e16-b582-5f23dc60506a	t
d0978fe3-222f-477e-8e97-19c3f9091d80	CPV	Presidente João Suassuna Airport	5c2e6978-582a-4184-8207-6aca1eb70135	t
d933e3cf-f90e-4afc-a197-a26757862d07	VCP	Viracopos International Airport	a911ce5f-f8cd-4602-85dc-040a790e2aac	t
d91548db-f0b3-4998-9cbe-792c4e15536c	LDB	Governor José Richa Airport	58b221e1-7004-4fa5-a0d2-d038cbc4b1d5	t
d5859f5e-6636-4c40-a580-d807e4dbabb6	MCZ	Zumbi dos Palmares International Airport	a7234e47-ac59-4a7a-8ce6-d6d3fe54901e	t
93839e2c-e77e-4e65-be4b-9f741a0f3b3e	MCP	Macapá - Alberto Alcolumbre International Airport	bbebb513-de78-4f1c-8b43-5227800dc2c9	t
62bae4d4-1993-449c-92e3-cfbaa7a2ac54	POA	Porto Alegre-Salgado Filho International Airport	5165b757-bab9-4ff0-9c72-d273f129e7e7	t
266df946-e1b9-4904-b749-67be0f65da1e	REC	Recife/Guararapes - Gilberto Freyre International Airport	64c445f8-a57c-4cb1-a240-b8ad21854674	t
e0f7a4bc-33ac-4613-82aa-ea27b604e981	SDU	Santos Dumont Airport	6c835c2c-bb45-4375-a406-ecf880616c2d	t
cf290850-a6c2-4ec8-94ce-19ea53d25ac9	RAO	Leite Lopes Airport	b95ac81b-b17a-4d69-9c0d-b33c4ccd8a78	t
76e56311-9655-4277-9e33-89834e294a80	NAT	Rio Grande do Norte/São Gonçalo do Amarante–Governador Aluízio Alves International Airport	ecf54f33-44b2-4965-9794-160057656c63	t
dd8698e5-52f5-485d-928e-9b8de89af85f	SJK	Professor Urbano Ernesto Stumpf Airport	7a88917e-c94b-4d31-88a9-9445d500d9cc	t
bf473b86-1445-4e0b-884a-d957d5d59642	SLZ	Marechal Cunha Machado International Airport	9d0179d4-9b56-4734-bb62-224691924c1d	t
dbe6af88-28a3-494b-a295-b222a1023cf9	CGH	Congonhas–Deputado Freitas Nobre Airport	b8dfa00e-5618-4007-a1ee-5c241ded4841	t
7f7bfe7b-ea14-4de4-aac1-7c66d3cf7fe8	SSA	Deputado Luiz Eduardo Magalhães International Airport	d328919a-84ac-49e6-a899-80a5dc6bf38e	t
2d19a33a-b749-45f5-bef6-ca7fc6dcbb02	THE	Senador Petrônio Portela Airport	17033231-10a3-4f30-a4e4-e4c71d6feec3	t
878bfca2-ed0d-4083-9b1a-a3b323f3b215	UDI	Ten. Cel. Aviador César Bombonato Airport	fdd314b7-e4fd-44c5-9fc6-487d767e0a65	t
f9026479-c989-495f-a5bc-f97b914cdf0e	VIX	Eurico de Aguiar Salles International Airport	64dca8f2-bf53-44d4-a03e-b4970bf836f8	t
2ed684fd-871a-47bf-b9e5-2e6ef2c201ed	IZA	Presidente Itamar Franco Airport	4c8d8cf1-6e98-4be4-b966-d2985fc11fd1	t
e0149d64-196c-4186-9c60-12a1281c4609	SCL	Comodoro Arturo Merino Benítez International Airport	b8e51427-c615-4b22-8336-1182de06a617	t
9b4cedb5-7772-40a1-b0e2-ec359ca1bc29	FEC	João Durval Carneiro Airport	b3067062-ddeb-4fbd-8fba-a4908ac87887	t
05505030-00e0-4a23-9c4e-b6adf6184908	GYE	José Joaquín de Olmedo International Airport	77477fde-a952-42d5-95d4-b69c01f04fb1	t
72678adb-c3fe-4567-a1c5-3133c9ff8c72	UIO	Mariscal Sucre International Airport	b47e0135-ae04-4768-bd3d-1e58732b2047	t
8d61396a-cab9-4197-b070-3f3a6252fe71	ASU	Silvio Pettirossi International Airport	e7a884df-cd3c-4475-9f44-8c1e93133975	t
868ac6ff-ec11-4527-9b82-7d1648321d0b	BGA	Palonegro Airport	2e84a3d2-f612-46ea-b46a-f0ce54258430	t
f4b2bbeb-fe10-49ed-b87e-83f47241e2f1	BOG	El Dorado International Airport	2f2bd8b1-8e9b-45ce-a020-d12f1ddb7ffe	t
138a35bb-882f-4186-80e6-1778a4368852	BAQ	Ernesto Cortissoz International Airport	d6737850-c021-481c-a581-12d4ce8d5e66	t
58eda95a-eaa1-45f9-8be5-efada435fd77	CUC	Camilo Daza International Airport	15010519-aa3d-4a7a-ac78-991f0ae59588	t
50d7ac88-d1bb-4053-94d4-9142c38302d6	CTG	Rafael Nuñez International Airport	ffb703fe-db03-4cc9-a119-96facb45acfa	t
effc877d-ab25-42ec-912d-78c07cabd839	CLO	Alfonso Bonilla Aragon International Airport	f13dab2b-f001-4bcb-945a-b7fd86b25c1a	t
548f2cea-e7f8-4763-9bbb-e9207135eacc	IBE	Perales Airport	b844b514-52e4-4a54-a92a-4c0ccaf2ddce	t
0fceab1c-0a01-4e05-8265-0eb55b593b4b	EOH	Enrique Olaya Herrera Airport	87160e82-6a95-4fac-bb37-ad4f5e09594f	t
26b92805-f010-4c31-a841-8b82ea6d0215	PEI	Matecaña International Airport	03ce6a4f-59d3-4329-9040-f83e32c44541	t
730558e3-bc0f-457c-8c97-c1109a9025d2	MDE	Jose Maria Córdova International Airport	87160e82-6a95-4fac-bb37-ad4f5e09594f	t
26ff6ef6-2efd-41ee-a64b-0008b8c1fe2f	SMR	Simón Bolívar International Airport	e882dca5-9ce8-462e-a091-015010201a6e	t
31ec9dd9-ea38-421a-80e9-f6ed4795c001	CBB	Jorge Wilsterman International Airport	4ff719bd-edb8-4b39-9937-e29b5f9188a4	t
d383762c-868c-436b-8d62-1967de711915	SRZ	El Trompillo Airport	69a7ce69-080f-4470-95db-b9760deb085c	t
833ae0eb-8fa2-46ff-bbd9-92bc9877531f	VVI	Viru Viru International Airport	69a7ce69-080f-4470-95db-b9760deb085c	t
ad5abe05-2263-4ba2-93de-ee1002c16e41	CIX	Capitán FAP José A. Quiñones González International Airport	cd0276ee-5092-4502-8d52-2cb422c87a08	t
66843214-aa83-43f0-9692-935070e519fb	LIM	Jorge Chávez International Airport	c3fcbe9c-7ec4-43ae-8b89-96daed3b409a	t
abb1f308-fa9e-43cb-b2f3-a92a9f606edb	IQT	Coronel FAP Francisco Secada Vignetta International Airport	0ba65a3c-7318-447e-bb59-c640530985cd	t
5ee5b7df-da3c-4b8e-8327-f6a1dcbbfe6f	AQP	Rodríguez Ballón International Airport	fe11100f-1ec4-437e-8000-a8a137c5b15f	t
8af28763-b371-46d8-ad7b-be62e9b6b76b	TRU	Capitán FAP Carlos Martínez de Pinillos International Airport	fcb7cfd8-dbc3-435b-9092-9574ed76ca29	t
835c6efc-a4f1-4c51-b9a9-7f55b838e4cd	PIU	PAF Captain Guillermo Concha Iberico International Airport	b882dfef-b300-4ac9-bd34-805aa3518aa5	t
e365e04a-60f4-4940-b089-ffa4c3677d7f	BLA	General José Antonio Anzoategui International Airport	fb077225-7a09-4a1f-89b4-a50e666ffd18	t
33ea2f0b-604f-45a3-89ed-d3279b5efa93	BRM	Jacinto Lara International Airport	e6b299d1-21cf-4812-a8d9-c99be9dd9778	t
b9e92052-8068-4054-af36-24b8ad127c5e	MAR	La Chinita International Airport	a4f92d2d-edc3-4c60-88b0-bb834053f462	t
146027f4-78ca-4236-b63c-206abe1bfa32	MUN	José Tadeo Monagas International Airport	ebd96e2b-1ff2-490d-884a-ccbc5e27ff70	t
e2704de7-69be-4107-9ae0-5062a94a189c	STD	Mayor Buenaventura Vivas International Airport	c5c19ecb-19a4-4007-ae8a-dbafa00d95b0	t
2f0e0949-ae06-43d6-9bb2-fb164eb7b8b5	VLN	Arturo Michelena International Airport	9fda2a5a-9e06-4350-8931-a111ba640a80	t
88811dff-811a-48cf-b89f-cbcc3e205521	SIG	Fernando Luis Ribas Dominicci Airport	033474f8-6a11-437b-90ef-e3b437236372	t
2a305213-910d-45bf-8901-f76a2cbd6dcf	SJU	Luis Munoz Marin International Airport	033474f8-6a11-437b-90ef-e3b437236372	t
9f21e908-df8a-486a-82b7-ac4d82416d9a	VIJ	Virgin Gorda Airport	d21f1a73-8dcc-4ea5-a2a4-2ea0faa45d6b	t
a9396153-9089-4366-a2be-c023ebe888e1	BDA	L.F. Wade International Airport	78f3ac44-53dc-4dc2-b920-b6da9f9c4aa2	t
a8a428e6-9e6a-4f4b-9962-35bf7bcc7c8a	ALA	Almaty International Airport	857c13c4-2654-401e-b35b-e5a6fe08c62b	t
4597b177-9866-49b3-83f7-486a0e0ec1d9	BSZ	Manas International Airport	4b5802a8-6ce8-4f7a-b9a6-080cf320835d	t
c1d5278f-58c2-4a34-9565-7d98f926aa29	OSS	Osh International Airport	e403c965-3724-4dbc-b848-94bdd42885dd	t
1085bef2-f6ce-4e54-88cf-847e0920e176	CIT	Shymkent International Airport	c3f45d43-5e20-4017-b596-fe7d190716e6	t
d69dfc4b-c3ab-4262-abc7-4aef7e3276d4	GYD	Heydar Aliyev International Airport	3fe96651-9cb7-45f1-8b4b-0b0dd4b0a205	t
87134271-00b1-4f77-9299-253195593f31	EVN	Zvartnots International Airport	b38022c6-5fa7-411a-8aef-2a150513d2a6	t
534abddf-338d-4fe6-bb20-71a1e9160698	YKS	Platon Oyunsky Yakutsk International Airport	5d13b88d-6fca-40b3-918b-1ea152051dd0	t
6aec8ab9-58bb-400c-9f9f-171efffa0160	TBS	Tbilisi International Airport	6259a69d-b0bc-429d-9ad7-65d364197f44	t
e05f8f75-f3e8-48a3-8401-b31f9c8bd80e	KHV	Khabarovsk Novy Airport	1803d7ec-063d-4b6d-822c-a685fe535329	t
b711af3b-fa72-40b4-8ad7-53be4de35d09	IKT	Irkutsk International Airport	e569afda-4cff-4c81-90ca-04f2e5fc7086	t
3a6a440e-aabf-4a52-984d-70226782fa03	MPW	Mariupol International Airport	3d97dc40-a926-4007-a4da-67ef1e55ab4e	t
bc589e6b-5680-42bb-8475-b6db65e4cfbf	DNK	Dnipro International Airport	272782ad-c23b-469f-a155-3c9ba236741c	t
9a8db7e9-3d38-4a0b-9b92-997df01fc62e	LED	Pulkovo Airport	b8d5eedd-fdeb-412c-b99d-12bcc2680f90	t
787ea023-4a09-4c67-8c4f-5501d6ae3239	MMK	Emperor Nicholas II Murmansk Airport	0d709ca3-5000-495d-b064-f0dd38e42eec	t
c2e94d30-1b7b-4199-8a07-5e49873127d7	KGD	Khrabrovo Airport	6268a852-a962-4ce7-b001-89fd3a2471f6	t
63804600-d6d1-464c-ab7a-4f203cafd7cc	MSQ	Minsk National Airport	5866110f-42d8-4825-bc85-6027ca986a45	t
bef6a0a9-96b1-420e-989e-edaf7b78ff01	BAX	Barnaul Gherman Titov International Airport	461288b0-9a28-4fda-a3bf-eacf2f7cb180	t
92f9bb9c-5bbc-406e-84b6-858f01a3e07c	KEJ	Alexei Leonov Kemerovo International Airport	5677c28d-1082-463c-bb1d-e987e55ad247	t
cb82c222-aeb6-4843-b1b8-353300f81db4	KJA	Krasnoyarsk International Airport	dbebf2db-79b0-477e-a142-9d59b978ae33	t
b799bf71-6b18-46fe-b37d-55833420a305	KCY	Krasnoyarsk Cheremshanka Airport	dbebf2db-79b0-477e-a142-9d59b978ae33	t
74f9b1c2-b2d8-4084-9110-603c34031454	OVB	Novosibirsk Tolmachevo Airport	89c766a7-a7a3-4adc-9c50-5c5544a7a182	t
b473723c-88c8-4c42-94a3-b9be16631cdb	OMS	Omsk Central Airport	51207e58-7923-49ef-b28b-d18a705d08d5	t
777acbf0-6cd9-4d94-94a4-1cb42c126ad6	TOF	Tomsk Kamov Airport	9dcb565f-6002-45da-acac-c27b0efbb94f	t
26817275-a877-43e7-86d8-bdaa754372ee	NOZ	Spichenkovo Airport	66ce6136-d45a-4b2b-8e8f-de36e9fb9b17	t
5f19726a-2950-4073-a387-61cf2f17a5eb	KRR	Krasnodar Pashkovsky International Airport	1fa55ef4-0f21-4dc5-970a-b1d3c86641d4	t
670109d5-25c5-476b-b0d4-a508698eb38f	MCX	Makhachkala Uytash International Airport	f768cff7-df0d-400e-aaa3-3327b0d2e9ff	t
c5130570-59b8-47ae-a8cd-6b94c841d5d1	ROV	Platov International Airport	881cb956-84ae-4da2-9470-a3b3d3d93503	t
32ce7002-0edb-48f4-99af-138a1b414794	AER	Sochi International Airport	725b9e8b-9b66-4fa3-9c9c-74637cc30e26	t
a53be822-563c-429d-ba56-d13ccabaf5cf	ASF	Astrakhan Narimanovo Boris M. Kustodiev International Airport	15da633f-dfd5-4f6a-bb57-38b83ecbd420	t
9dce84ce-0693-4ef2-ad84-9b477806f594	VOG	Volgograd International Airport	b6b6baca-acc7-4638-b6b8-855e8fbad2c4	t
264b78fa-78a2-4ff4-a8a8-887392540a35	CEK	Kurchatov Chelyabinsk International Airport	3f2a81b9-7866-4f59-8e7f-fdde954ca339	t
ae3630ad-068f-45de-995a-df93db81362a	MQF	Magnitogorsk International Airport	ef16ef49-583c-47e4-9138-9adb24a0b4b6	t
fde06408-b0d1-4132-bba4-0a3109e68dd0	IJK	Izhevsk Airport	326474f1-088f-47d8-ad58-37fd1d0b0cd2	t
94caedfc-86c3-4fea-ab10-746309d326c2	KVX	Pobedilovo Airport	6b1f3eb9-9b3f-474c-b3e5-338b0a28ad06	t
c8fe15b7-3e0f-40c4-8f3d-176df28aba14	PEE	Perm International Airport	861dd31b-80c6-4166-ba10-aa4fe353e65a	t
1310e445-48bc-44ff-b23e-52a18e960a59	SGC	Surgut International Airport	b0f4bfe5-bd0b-4e8b-802d-9b1d24b76df3	t
6ba58d55-006b-48f8-9629-1c1ce007a7de	SVX	Koltsovo Airport	a3020a14-a844-4584-91eb-99dbedc7f4db	t
959ca895-7cd4-4a2e-8989-5ed502e52120	TJM	Roshchino International Airport	644a8b6f-db09-4b69-912e-9c8c4376ea0c	t
ab88537f-f841-4759-84c9-93f041b2f749	ASB	Ashgabat International Airport	2b64bdf9-0ca0-4b1b-8a78-2a77319dafe5	t
f3932183-d635-49a8-9948-addb7e1d024e	DYU	Dushanbe International Airport	4973e442-892d-43f5-b39b-949c30e91124	t
05f871a3-985c-4c14-b7fe-baed19dae9d3	LBD	Khujand International Airport	e263a55d-350d-4c6e-9adf-7f6b98aa52cd	t
2e58e8d9-5806-47f9-ac18-ef9be4105ec1	NMA	Namangan International Airport	2137e1a7-1ffd-4bb5-bc6d-cc90b5c808b7	t
7de452b9-1e7d-44da-bf12-5ac13992fc27	TAS	Tashkent International Airport	4ad5b9fd-5917-4622-a253-6d9352ab7e7d	t
443a0ce3-b166-4aef-a342-596a7e78483b	IWA	Ivanovo South Airport	ed2ffd86-93f7-410f-a54e-aa1ccb8e2930	t
dcb1ac27-a1c6-457c-bd8b-c2e1250966ae	BZK	Bryansk International Airport	0ca56b15-97e6-441f-b025-db085e927f09	t
5f97d2d7-9730-4ae9-8070-4aea95739249	ZIA	Zhukovsky International Airport	bf7cc07c-4ccd-4dca-ab55-8c16a5f56e64	t
1f1fb095-9e2d-437e-a838-1c41cb58cbf6	DME	Domodedovo International Airport	bf7cc07c-4ccd-4dca-ab55-8c16a5f56e64	t
d9974311-b2d7-40cf-9198-177d669cdb7a	SVO	Sheremetyevo International Airport	bf7cc07c-4ccd-4dca-ab55-8c16a5f56e64	t
f50615ea-1d5c-4a53-a084-61db01552186	URS	Kursk East Airport	f3f63f47-ddaa-4c95-8255-d70c4bb276e0	t
956c633e-b205-484a-a456-f2c1a022ef16	LPK	Lipetsk Airport	4015987e-8d69-4116-ba29-4f6cdc6a0770	t
de62a45b-74ad-4273-b95a-8aee4778df19	VOZ	Voronezh International Airport	fc4a07c3-3eff-45d0-a265-5fc5119c3a8d	t
69e1d448-7cb0-4577-ae53-8b6a70facf1f	VKO	Vnukovo International Airport	bf7cc07c-4ccd-4dca-ab55-8c16a5f56e64	t
15b6f8a5-6bc4-495a-a315-15a88beb1b97	GOJ	Nizhny Novgorod / Strigino International Airport	7c540026-e955-40a5-9f9d-b103eab08050	t
10087301-3337-490e-9bed-a45ab8fb1d4a	KZN	Kazan International Airport	01dc1e34-adc1-4e8b-b4b9-41c56539b6f9	t
56a5261a-7ff9-421d-a9c2-4277cad51415	CSY	Cheboksary Airport	041503ee-c0aa-4e4d-a46c-af3366f99923	t
bd1770c0-828c-40fc-80b3-a261bbd8a694	ULV	Ulyanovsk Baratayevka Airport	42fc971c-6a99-49e7-b7a0-77d2731940b9	t
67e6c3e0-cd4c-487e-a2e6-fe01e628401d	REN	Orenburg Central Airport	df6e8483-6606-4616-9bf6-2ebfe3da138d	t
0d5088ff-6bbb-4be1-8898-207c7af6d31a	PEZ	Penza Airport	62d58e15-0e70-4cd3-a98d-e34035adc61c	t
e5b4bb8e-dd9c-4b67-b9a6-a0248af50d12	GSV	Gagarin International Airport	4bce7883-715b-403f-a860-a144af8a0dac	t
baf51bfd-0909-4fbe-bc58-8f0d85d4b8c0	UFA	Ufa International Airport	16a3f9bd-f076-4fbc-8da1-36fd1ed7535e	t
133cf6f5-9903-4a2c-9e0c-e37e7b395223	KUF	Kurumoch International Airport	0ce066d6-740c-4d2e-93c3-32f284b9677d	t
1cd6ec92-ada9-4251-86fe-0b0018442be3	AMD	Sardar Vallabh Patel International Airport	11b14c9d-8651-4e06-9fcd-b81de7b05fd6	t
a4c93da4-23d3-4ae5-b499-4f155a77247f	IXU	Aurangabad Airport	42798999-83d7-4460-a450-243ce7ba7493	t
a0b81957-b6f3-4d4f-95ca-6fc0dbef5859	BOM	Chhatrapati Shivaji Maharaj International Airport	13e23fed-d339-42b7-b506-ad47885b8d37	t
d67f149c-9968-41e3-b5e6-16d6d0b93d12	IXG	Belagavi Airport	1f3751d1-6405-4682-becb-9d973df099ff	t
e6899ab4-bcbe-4df0-8f26-9d444e3a857c	BDQ	Vadodara International Airport	765e3f00-58d0-4cf1-beed-7fdb939ce11f	t
0ffc52b0-bde1-4cd2-be53-faea499ba703	BHO	Raja Bhoj International Airport	2cacf553-1722-4f22-a60d-fc04f0efe33b	t
52f96aa7-b476-47ac-9fbd-ca1869a583a3	BHU	Bhavnagar Airport	eaf3c0de-3ce0-4dfe-9289-83e99d06d7bf	t
7d213f27-a8a4-4dd3-9ae8-0b59286934c8	IDR	Devi Ahilya Bai Holkar International Airport	a08e1d06-729e-4295-b527-dfbb80077d5b	t
5d30d97c-cfb7-44cb-8a2e-db72a3baed1c	JLR	Jabalpur Airport	6a012fd2-87bb-43cf-bf57-93914e5643df	t
87d22dcc-6846-4e34-9d6d-c5d3c7c6e9a1	KLH	Kolhapur Airport	baa0f475-0e57-49ae-b31b-53dd2c6ac5e5	t
5e3a8148-c2a0-41f8-8654-b33e3a206c45	NDC	Nanded Airport	bb3465fb-af25-409e-8d20-b5414cf1cfbb	t
274006c4-11e2-4560-a03b-0c328a58ba68	NAG	Dr. Babasaheb Ambedkar International Airport	f5f430d5-c68d-47cc-bec6-ca0553b4ac6c	t
cb58792e-dcaf-442d-ac9c-a0ece83d6b5b	PNQ	Pune International Airport	9e3e3130-dd4a-4293-a0db-7043ade53cab	t
a75ba1e4-5728-4592-a366-d3a4d80e70b3	RPR	Swami Vivekananda Airport	9ecf355d-acd1-4c4a-bbb1-ca57ec78bbb9	t
958d603a-0ed3-4942-bd84-db38c02ff239	STV	Surat International Airport	33614684-31b7-469c-8d87-1818aeff4845	t
af8baa61-9bfd-48ad-864d-f43557819a96	UDR	Maharana Pratap Airport	56778fb3-2a92-4f57-9a47-52fab05bc51d	t
30a66e59-f058-4169-b982-a6dc3df56f31	IXB	Bagdogra Airport	3d1e769a-27ae-45bf-b845-4711f8508583	t
a74b123a-3bc6-4e9e-99a4-f019d04c5026	VNS	Lal Bahadur Shastri International Airport	a4b3bb49-00ae-4ab8-b1f7-78e958377b11	t
16024775-c2e5-4c71-8227-231840dcee84	PAB	Bilaspur Airport	3532fda0-8bcd-4cca-9223-478964e092a6	t
18b2785a-dfcd-4879-9eae-f4c43b3a5e88	CCU	Netaji Subhash Chandra Bose International Airport	ba4ed876-d951-4469-adb4-15878abdc8a8	t
e30f4853-fab1-453e-8e8d-e77b0344296c	GOP	Gorakhpur Airport	9551df76-0220-4b40-9731-bc6302cdc835	t
b8bfa8a0-b012-45d4-9a70-a3424ccd1239	GAU	Lokpriya Gopinath Bordoloi International Airport	a23314c7-336e-482f-a028-49007995c97d	t
3ca00f6f-ea31-4b88-8ce5-357668d2b15c	GAY	Gaya Airport	f9ff37c2-24e9-494a-89f3-dcc3b94c515c	t
b41b7807-2ccd-4d90-99ac-71b00f7296df	PAT	Jay Prakash Narayan Airport	b6b09ed8-7b32-4b30-a276-a60042af6152	t
5962d629-2263-4ed3-aa4c-45fa10a56c3c	IXR	Birsa Munda Airport	c85e0b5e-9e15-42c4-a944-b03fe4019d8e	t
2545a335-d7fd-4cda-8947-e88268f2d185	DAC	Hazrat Shahjalal International Airport	9b85f0f8-cf89-45d6-8d53-141ed524745d	t
fafa7ca0-800a-458f-970f-54c98199b116	RJH	Shah Makhdum Airport	5be856b0-f375-4fe5-9979-18bdbd1e7408	t
374dbaed-52d5-40b0-9229-fd4a247d824c	HKG	Hong Kong International Airport	2604aa5d-cdd3-4bdf-ae38-5bed168e7dc8	t
fb03a706-361e-49a2-b998-41da473d3343	AGR	Agra Airport / Agra Air Force Station	df9a0efb-99e7-49be-8f57-25dec912026a	t
57783128-c1d1-45a5-a162-1778a74c9a57	IXD	Prayagraj Airport	8116a443-22a5-404e-8bb9-c28c2eab4fbf	t
1f787fe3-6a81-4d07-b78c-7f87e89fb4ef	ATQ	Sri Guru Ram Das Ji International Airport	120b899d-bf58-450d-a520-cec6ad4db609	t
515c660d-55a8-49ad-b703-0ddbfbb007ef	BEK	Bareilly Air Force Station	08fed689-d8f9-4654-b741-826e7c6c0bce	t
cdaeee7e-2aa6-4eb6-89da-bb740294a4b2	IXC	Shaheed Bhagat Singh International Airport	0bf5066f-0e7f-43d9-b34a-1794542412b8	t
13a39fd3-e76e-46c3-bad6-c67b5f3ab786	KNU	Kanpur Airport	c59c34aa-9611-42f5-bd8f-be1c4f1594a2	t
c1f71d09-8cc7-484d-94b9-ae88cef74ec7	GWL	Gwalior Airport	813685ef-d53d-4ae8-a8f9-6b9cc1c39b84	t
385cbec9-0f3d-4819-be78-8b0a6330e9b0	HSS	Maharaja Agrasen International Airport	9e29f4f2-8f11-41cc-98da-3bfc8f3f11ab	t
e3d68f38-3bca-458d-ab76-10a14548bcd6	JDH	Jodhpur Airport	3b9cf9d1-4af3-436a-a968-6c7efadfab61	t
d876fd0d-aee4-413c-9e87-1845e07e15bb	JAI	Jaipur International Airport	06a76cad-2f3b-4130-9996-331277033eee	t
2aa7e74e-3df5-4685-888c-c852375973ed	IXJ	Jammu Airport	3f7384c4-8371-4b67-84f5-c8bcef38880e	t
05e0cd2c-7059-4b66-8211-1f882e71fbd0	LKO	Chaudhary Charan Singh International Airport	fb05184e-fa42-4413-b385-daaaee21a4c9	t
b38f6728-fa62-4186-9ac8-79e67b45e2e0	MZS	Moradabad Airport	06ace452-d5f0-46a0-a1b5-3192e2e2520b	t
d585821b-d5d1-481e-93c4-fc45c293376e	SXR	Sheikh ul Alam International Airport	7e8cd7ef-e57a-4411-a919-baa0b7ccff35	t
7c0f69aa-2103-421a-90f0-f53ce03b3538	VTE	Wattay International Airport	0e3de1c4-4fb0-498e-bd2f-0afa5a417265	t
1218f90f-979b-4cf5-9f77-4bad513291c2	KTM	Tribhuvan International Airport	5289acdb-bf33-4d00-beb8-4b9a699e683b	t
a86e234b-42f9-4ad2-85dd-9d30b257e5e0	VGA	Vijayawada International Airport	c4a353a2-f0da-4316-995e-1d1284aba504	t
3768ace9-da0e-4ac1-90f9-81e78601b00f	CJB	Coimbatore International Airport	b095b7da-cacf-4e07-9e75-947c56100276	t
0d13d707-67ed-4ba1-9ce0-daf3571acb0c	COK	Cochin International Airport	e3fa9379-de0c-480e-9c34-c6a06f5844fd	t
40326b05-735b-4235-a305-d475e5695e7a	HYD	Rajiv Gandhi International Airport	9bfc4411-68ee-476c-a548-99afef632d71	t
e68e392d-d8df-48bf-8f95-59153183197b	IXM	Madurai Airport	20841a27-8e86-42aa-bee9-2e92cc91f917	t
901e24e2-f76b-45ab-bec9-133148bab9af	MAA	Chennai International Airport	4054f5ab-d882-4a63-aea5-d194976c4785	t
4ff38906-dbae-4ea4-9e38-306a2ffe5e3b	MYQ	Mysore Airport	c2008cc1-8580-49a9-8132-cd9a189851eb	t
7da55f74-3b4d-4c82-9473-dd706acbd560	TRZ	Tiruchirappalli International Airport	a6e1c1cf-37d8-4bfc-96d2-68c41974065a	t
b440f868-6c2b-4d2b-93e2-d7b2cde75a46	TRV	Thiruvananthapuram International Airport	fba50766-69f6-48ef-a72e-a9c03459de62	t
9d837085-7468-4329-97d6-f1625fad353e	DMK	Don Mueang International Airport	5182444e-5e21-4cc3-aec8-ef9f7c5a9581	t
85df4f91-c08c-46c6-ae3b-da2641bfb5d6	BKK	Suvarnabhumi Airport	5182444e-5e21-4cc3-aec8-ef9f7c5a9581	t
6bd5b338-3584-4abf-a1f9-afd730a08aee	CNX	Chiang Mai International Airport	d6d339ba-a390-4974-8997-0d2cae563e7c	t
be5c21e7-b755-497c-9e5a-35681b4f76c7	VCA	Can Tho International Airport	7729dda2-7773-4d5a-9670-63776196bab0	t
1c49ffd7-2007-47bb-a045-84a223741d91	DAD	Da Nang International Airport	7e3f2f05-dab9-47ae-9397-22912d618ad4	t
21bed5a5-8ca9-4c9c-a562-8fde4a1b0eba	SGN	Tan Son Nhat International Airport	f53f11d5-6129-408f-ab1c-f3e5c86c3cce	t
f20e7e4d-60ff-403a-9f65-0ad0dda930c9	VII	Vinh Airport	6ee88bf3-3e55-49c9-b65c-778c085ca3c9	t
54a7dde8-66e5-4e90-90c9-6749070df51b	MDL	Mandalay International Airport	bd8d4bab-7fa5-4639-88f2-247b27050439	t
eca7dea1-4431-4ca3-8a88-2432187d81c0	PLW	Mutiara - SIS Al-Jufrie Airport	c7023b27-10e2-488d-b733-a1c046587496	t
838405ac-5644-4015-8709-ca8153cf4b3a	YIA	Yogyakarta International Airport	d9ba823b-8643-479e-b10a-345cd36ae2fc	t
9f8e4b1b-d6c6-45a4-b164-9eaf50a07757	CXP	Tunggul Wulung Airport	74984a70-d4ec-4671-a2aa-f6a8d1da5a7d	t
ad0113d5-a470-4d46-b703-790f56c6fa29	BPN	Sultan Aji Muhammad Sulaiman Sepinggan International Airport	ae581c81-3e20-4680-8f77-d3b8078f8f3f	t
ef4cd741-b4d4-431b-8385-b50ddf10ea1d	AAP	Aji Pangeran Tumenggung Pranoto International Airport	e349c777-f735-4623-bd39-302182735928	t
c5038352-8544-4d43-af90-aecc9205cac5	MDC	Sam Ratulangi International Airport	c20fa669-9a6f-4f2c-8338-8a559d69b004	t
c81dded5-1ed9-4b9f-b0d7-146f14f5fd57	MLG	Abdul Rachman Saleh Airport	46ef1998-36d0-4ce8-aac0-31a4e0d79a8c	t
4a75c7f3-6164-4b65-a440-32e24e9f0ae2	JOG	Adisutjipto International Airport	d9ba823b-8643-479e-b10a-345cd36ae2fc	t
2dc4f9b5-977e-4165-be87-c7f299c1e234	SOC	Adisumarmo Airport	fa60f6e5-631b-4acd-99f3-d958f8cba388	t
94ba2938-5d90-47dc-bb32-f17c955f3f59	SUB	Juanda International Airport	1d343857-4a82-4b87-bbdb-ac2593077c65	t
5c4342fb-0d4a-47f4-8bf7-f893a44e0e8d	SRG	Jenderal Ahmad Yani Airport	420da575-08b4-4e20-a150-e4b47cde70ee	t
667596a6-5fbb-4c7b-ba34-d3abf438d95c	KCH	Kuching International Airport	578a93c5-da32-49ce-9ac7-2e4bf968c272	t
3d41c8b8-92d5-45e3-8092-91ac796e4eff	BKI	Kota Kinabalu International Airport	8edd997a-1579-4e1b-bcbe-3b87dbd8309d	t
b0e1560e-3865-40be-b3f4-6fe2ccfaa3bc	SDK	Sandakan Airport	73086d9a-bb95-4d50-b2e1-bd4bada9582a	t
15958d0b-1285-433f-9864-dafb26f60c8e	PKU	Sultan Syarif Kasim II International Airport / Roesmin Nurjadin AFB	fd95d863-ef2d-4487-a5fd-90af08e898ed	t
61e2e4b3-e673-4e36-9378-8d3ec31ef576	BDO	Husein Sastranegara International Airport	f5bcbf96-192d-4cea-94c2-8967ac55793a	t
396cc9f2-b727-4981-8356-2a15425dd524	HLP	Halim Perdanakusuma International Airport	68ba35b7-60ab-47bd-85c0-749c18a1b1d8	t
83909702-9064-4a4d-ad7a-6ff909963815	CGK	Soekarno-Hatta International Airport	68ba35b7-60ab-47bd-85c0-749c18a1b1d8	t
33b1e86d-ea22-419e-9f6b-b2768c95c9c2	TKG	Radin Inten II International Airport	f15b264d-2d05-4ca1-8f9f-6894c1399e26	t
4521f8dd-196a-4c92-afcc-2513f99dcb4b	PNK	Supadio International Airport	31b2735d-bcf7-49e5-92c2-b4aa3703d181	t
af53a463-4105-4b45-b0a7-e445b3b42fdd	BKS	Fatmawati Soekarno Airport	c0617a44-7999-4283-9ae8-7b695d6094bb	t
ea5eabbb-dfdc-4786-861c-cc358936f711	PLM	Sultan Mahmud Badaruddin II Airport	2629b257-b541-4501-9b80-9f1f56aa11fa	t
d1da7cf0-5478-4168-bbe5-a34c9bea994a	BTJ	Sultan Iskandar Muda International Airport	097bc8e8-8f2b-4ba2-a404-cda9f61f1dc8	t
55202eec-1afc-4840-98ee-5603521f4ff0	KBR	Sultan Ismail Petra Airport	e3f52a2b-84be-4779-a4d4-4dc7a98fac83	t
1b5f02dd-47ac-4014-8316-f8692fc8c6a1	IPH	Sultan Azlan Shah Airport	02ca0dcf-e616-4d79-817d-4203cd048814	t
0b5b1da2-5500-4c86-af9d-b1e01294bf40	JHB	Senai International Airport	c37fd75c-145b-4b20-b11e-a6121ae43918	t
f0051265-c939-4675-923d-8f52cd85d83c	MKZ	Malacca International Airport	aed3cd3b-48ba-45d9-ba5e-e66c60235826	t
bcadbf12-09c6-4b6c-bad8-726a4f85d908	SIN	Singapore Changi Airport	f919a10c-7f3a-46a1-b44a-79dd5ca108ee	t
b104836f-dc1f-446b-82d4-aeb35c397554	ALH	Albany Airport	b3cd9766-96e5-4793-95fb-e333e7464020	t
7601fe34-0ee8-4b72-9d2a-09eb1e3ab0ee	BNE	Brisbane International Airport	9f298e67-e713-4f43-851e-1bbfc512a5b7	t
ee524b24-9489-4c6e-bd5b-9cc76ecefe6c	OOL	Gold Coast Airport	3788118e-883b-42dd-9b28-0d04f1fb56be	t
611b58f6-f3af-453c-8e32-eb815a75a10b	MBW	Melbourne Moorabbin Airport	18d540f5-8650-4b94-9d84-8d28b716ccf7	t
f939c7f0-d5a5-4bb1-8f23-375a78586fb8	MEL	Melbourne Airport	18d540f5-8650-4b94-9d84-8d28b716ccf7	t
0cae645a-d38a-40c1-9f07-cc6026d6ea1c	ADL	Adelaide International Airport	cee1188c-3497-4b8b-acd2-04e3fa34ada4	t
64124557-6406-4201-820e-23fe65d21dac	PER	Perth International Airport	91af78e3-12bc-4b76-8dda-fb82ebc65cb5	t
c4ae0cc6-560e-4ed4-bea0-f04052a51225	PEK	Beijing Capital International Airport	0cbaf93a-c5c0-4645-9fbb-aac849732432	t
eb1d9134-e7ce-4948-8e4a-4fb02bcd4dbb	PKX	Beijing Daxing International Airport	0cbaf93a-c5c0-4645-9fbb-aac849732432	t
7dd912aa-f24d-4232-90d1-7ec0c66df69d	CDE	Chengde Puning Airport	9bc510a6-b3ed-4180-a03b-10eb84300fe3	t
be3d2dd8-1427-4655-8f2f-90a29502163d	CIF	Chifeng Yulong Airport	b6324b35-5a93-4647-931e-5a8089fe9db4	t
d003f179-b4dd-44f4-a1b5-3f9ba06b9284	DAT	Datong Yungang International Airport	d441c936-3276-4a2f-abd5-bbd49746d186	t
e9be8aa0-8582-4982-a0f5-f95d334b1f12	HDG	Handan Airport	7aebe743-f10b-4ea5-8833-fe142a8d731d	t
acbd1206-338f-43ee-a44a-1a87c03a393e	HET	Hohhot Baita International Airport	57bfa89c-45ee-4a08-9306-e18660a5091b	t
ae4a0dd4-f687-4ff3-9a6c-2166b64eddae	BAV	Baotou Donghe International Airport	136f5959-70d5-40ec-a4b8-23c4605dae07	t
f09951cf-6509-481b-81ee-a141a3054a17	TSN	Tianjin Binhai International Airport	0a755901-caa3-4ddb-8bf4-9f697a5a0b3a	t
8c4bb40e-e9be-4c7c-b487-ffb080d74696	TGO	Tongliao Airport	94234c9f-d09a-4c36-b6d0-f5e8985af2b3	t
4c180e85-f947-4edc-9e5a-2f3bca006129	TYN	Taiyuan Wusu International Airport	587985f8-6e8d-4c46-9d83-1bb11f8d1062	t
ba7dbd05-0179-4c16-afe3-acfe5145d013	ZQZ	Zhangjiakou Ningyuan Airport	f013491b-4b7b-4efc-84f8-74986699acf8	t
d9416c74-a2c2-488e-bdcb-4127133253f4	BHY	Beihai Fucheng Airport	1f2d8c45-75d2-4885-9b5f-3087d58f7c2e	t
0eca020c-c797-42ac-8aa9-05735db303e9	LLF	Yongzhou Lingling Airport	4a680e08-6e67-4ad4-8bb4-a54ed002affc	t
d473a8bd-844c-46ab-b006-578e9244d6da	SZX	Shenzhen Bao'an International Airport	7d096baa-e1a4-4b3c-a340-cf6f89da5d3b	t
a097aec7-5de8-4930-8cc6-91a75ea18600	YLX	Yulin Fumian Airport	3be7a5a6-82d7-4c25-a5f4-ddc67d255ce7	t
5e7afe62-9f51-454e-9dd1-04441a697510	ZHA	Zhanjiang Wuchuan International Airport	d219f3c0-b02f-4ce2-bc38-e1f59437f1cd	t
6f25a8a6-1611-484f-b1ce-67f39f59d0bf	CGO	Zhengzhou Xinzheng International Airport	3d991f29-6f3c-44fd-a0e3-8e1f2807aa3c	t
782be120-2106-4437-b33a-8238687b315f	XAI	Xinyang Minggang Airport	9abf5111-7f5a-4d91-99cb-d5afd910234e	t
20c1d611-855c-4fae-8ca4-b231569620ff	FNJ	Pyongyang Sunan International Airport	dd0fd3a6-2a48-474a-bc5e-8153bcd49555	t
f0833596-39fa-4cdb-a2e6-2559c6585e05	INC	Yinchuan Hedong International Airport	1cdaf5d9-5cf4-4991-a5be-b0ff0fb33437	t
f5f6c8c8-524f-465e-82f9-efc745ffbda6	UYN	Yulin Yuyang Airport	3be7a5a6-82d7-4c25-a5f4-ddc67d255ce7	t
0b9449bb-8a6f-406f-8818-71d2448598ce	KMG	Kunming Changshui International Airport	f55a6336-14bf-4825-9dbe-a263bc393058	t
4bf592c2-470e-4f40-86a4-8f5e111af0e1	XMN	Xiamen Gaoqi International Airport	22f1cedc-f5c3-4aad-80b7-59ecc100bb6f	t
c265e690-eece-470e-8482-45c2ccbb9a04	AQG	Anqing Tianzhushan Airport / Anqing North Air Base	8eebdbe8-7b02-4817-947a-8a4d67943332	t
479768a3-62f1-4f92-a6e7-4505ab92a9d2	CZX	Changzhou Benniu International Airport	cc51743c-c0a8-4c60-88a5-b0c73bb61bef	t
3dcb8a4a-a915-4950-bc8a-efc370a074cb	KHN	Nanchang Changbei International Airport	dfa3edfd-ccb7-49f5-817f-9c9209ee3c8e	t
a1b4861a-39e7-4ac7-b391-0fe12caaddba	HGH	Hangzhou Xiaoshan International Airport	72f11611-d39a-44b2-80c0-cef5534c5f26	t
ab037071-e904-4d04-be54-6223186d9f78	JDZ	Jingdezhen Luojia Airport	e1d4a5d2-32e9-42fb-8e7d-7bf671d28c5c	t
4137df7c-3dea-4afd-b5ae-fdec47f2080d	JNG	Jining Da'an Airport	c9a5304b-402b-46ca-8702-cc4bc062a332	t
321565e7-0a48-424e-8c47-a8b30baa27cb	LYG	Lianyungang Huaguoshan International Airport	0886fc3a-d6bb-4c10-bbec-42c1abcb5cc4	t
24304099-debe-4d86-83ec-6a83c06b91cc	NGB	Ningbo Lishe International Airport	fe6bccfd-6a78-4353-810a-5b060b3db3ed	t
accffbd9-8437-42b8-ae37-09dcbe9beba1	NKG	Nanjing Lukou International Airport	e18e6dcf-a7c4-4024-bf37-8e0444c38364	t
6501846e-b1dd-4cc5-b6ab-4db2c5114fbf	HFE	Hefei Xinqiao International Airport	6143b623-b11e-49e9-9992-a633d52269e8	t
62af9d8f-bad3-4757-8672-c17fe5468446	JJN	Quanzhou Jinjiang International Airport	864618f7-47e9-45b9-b396-8d5f69a253dc	t
c9febf2d-434a-4d1c-bf5e-9a80b8abffc8	WHA	Wuhu Xuanzhou Airport	0e9aa151-29a6-4fee-89aa-f01336533133	t
eebefc62-20a4-4cbb-adda-b90f95ad266e	WEH	Weihai Dashuibo Airport	90f92d47-1110-4831-ac36-d9b8f7b7506d	t
23a877bd-0444-4d38-950e-ec8d5e72ce24	WUX	Sunan Shuofang International Airport	184a53ed-3a58-4e55-9b8d-6adbf4f567e2	t
108dde4b-8bb8-4e00-b498-eed5d70fb2e2	XUZ	Xuzhou Guanyin International Airport	7b770454-d7aa-4dfb-a88d-c058f9407818	t
60f6b47d-4bcf-4b90-b165-4f0411ae16da	YTY	Yangzhou Taizhou Airport	5f7b0900-964a-4429-9866-201589fd03bc	t
2c684fce-dbeb-45ab-b628-69e7da1cbaec	YIC	Yichun Mingyueshan Airport	0291c5d8-4e6b-407f-a7a9-9a614e7229d7	t
e36f4407-160f-49ef-8032-8b44cc895637	YNT	Yantai Penglai International Airport	9ad9c752-73a6-495c-b772-21634ed59963	t
ca083353-19c4-4ceb-9a63-713663bdbbf3	CKG	Chongqing Jiangbei International Airport	dc62a2f6-ea52-4382-a81e-e40fe03f8e75	t
f0ed0734-aa24-45dd-bb82-4d79a9663f96	WMT	Zunyi Maotai Airport	b4158b86-b298-42c3-b931-0758c6e481a5	t
9eca789a-73a3-4990-834d-ce5ad5359934	ACX	Xingyi Wanfenglin Airport	c247b2c6-cab8-4793-8d8f-3b5f70102eaa	t
cbe92891-5d34-4f58-a0b9-43251ace67f3	ZYI	Zunyi Xinzhou Airport	b4158b86-b298-42c3-b931-0758c6e481a5	t
e812c3af-6382-49f6-a648-abd58170f32e	KHG	Kashgar Laining International Airport	8f5ae731-8646-4ae7-8437-f1a3efc3612a	t
141a3c13-c7b6-4c57-8e3e-b716a6cc041c	URC	Ürümqi Tianshan International Airport	4a81f6bf-c206-4f87-930a-8432131cc275	t
e1768c3f-484e-4e4a-83f0-990be09516e5	AOG	Anshan Teng'ao Airport / Anshan Air Base	4a288322-237c-4d06-8a6a-32ce71a3832d	t
f7d8a5e8-c9f2-4a35-9d1a-180b564e43f7	CGQ	Changchun Longjia International Airport	4efcb289-51c5-4d9c-a091-cee34e146e61	t
18dff544-6095-4975-87a4-93dcf5697d38	HRB	Harbin Taiping International Airport	8479dd54-fc62-49ba-a7fa-4bf3dda429dd	t
5e2c2c73-e8ca-41c4-acfb-4339dc8e9829	JMU	Jiamusi Songjiang International Airport	a6e821ad-252d-4c91-8e53-c9de593b8d62	t
1c3036dd-18d6-40b7-be5d-40788ff1f82c	JXA	Jixi Xingkaihu Airport	739d3563-79d6-4319-a2e1-ce370bd11749	t
da0d5edd-1bad-4d7a-b520-3f730d5982da	LDS	Yichun Lindu Airport	0291c5d8-4e6b-407f-a7a9-9a614e7229d7	t
1bb16c5a-5e24-44bc-be19-c2c3572f1025	NDG	Qiqihar Sanjiazi Airport	43e1f2ba-35ab-41de-a0b9-0451a431d1a9	t
77dc82b3-f173-4436-9b4d-28c5bbd73a04	YNJ	Yanji Chaoyangchuan Airport	ed6cd484-47c9-400e-9582-8cf763371d16	t
\.


--
-- Data for Name: booking_assignments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.booking_assignments (id, booking_id, country_code, service_type, assigned_user_id, assigned_by, assignment_status, assigned_at) FROM stdin;
\.


--
-- Data for Name: booking_workflows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.booking_workflows (id, booking_id, country_code, service_type, assigned_user_id, workflow_status, current_step, notes, updated_at) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bookings (id, booking_code, tour_id, departure_id, customer_id, booking_type, group_name, leader_user_id, join_code, party_size_expected, status, fulfillment_status, total_price, notes, created_at, internal_notes, is_urgent) FROM stdin;
4600dd2d-d04e-44ab-85f6-77b1e76eb400	BK-C0332D	fbdf7f16-12c6-4190-9295-9be7ee432e45	48d1b8f8-921f-4f7d-8399-afc811f1d5f4	ef4bcc99-2609-4d0d-944d-e7587c0b1f67	leader_group	Test Group b05t	ef4bcc99-2609-4d0d-944d-e7587c0b1f67	44497A	1	submitted	pending	\N	\N	2026-02-15 14:11:23.88039	\N	f
77b92c6d-909a-4cc4-8a47-fe56858154b0	BK-8A8133	334664f8-2440-4809-9d90-8460ee7314ca	314b53d4-c1fe-462e-9cef-402f18825d8a	a8bb3d8d-6ecd-4ae4-acc6-8064bd37805e	leader_group	Test Group	a8bb3d8d-6ecd-4ae4-acc6-8064bd37805e	59BE46	1	submitted	pending	\N	\N	2026-02-15 14:17:04.442338	\N	f
\.


--
-- Data for Name: bus_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bus_types (id, company_id, name, seats, cost_per_day, cost_per_mile, description, is_active) FROM stdin;
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cities (id, name, country_id, is_airport_city, is_active) FROM stdin;
b6f41e9b-21f7-4e30-aad9-bd38532e25c2	Tokyo	Japan	f	t
3ad6b57b-bec4-4545-8f09-a78b105d1683	New York	United States	f	t
22c345c6-a45b-406c-80bd-b97c12b33641	Mexico City	Mexico	f	t
13e23fed-d339-42b7-b506-ad47885b8d37	Mumbai	India	f	t
b8dfa00e-5618-4007-a1ee-5c241ded4841	São Paulo	Brazil	f	t
a34ba9ae-7ce8-41ca-a72f-cd59851ee723	Delhi	India	f	t
a1256437-3e5a-4132-a9aa-18752653d7b8	Shanghai	China	f	t
ba4ed876-d951-4469-adb4-15878abdc8a8	Kolkata	India	f	t
1f07af0a-3698-481e-95b1-e424c3a2ca98	Los Angeles	United States	f	t
9b85f0f8-cf89-45d6-8d53-141ed524745d	Dhaka	Bangladesh	f	t
4009e03f-c1ce-4b65-93dd-9dbba0fcaa5b	Buenos Aires	Argentina	f	t
71ec3a8e-e6c6-4bec-a7f1-256a01ab25b6	Karachi	Pakistan	f	t
8b1b0c22-9071-4ffa-aea5-76a9587092a1	Cairo	Egypt	f	t
6c835c2c-bb45-4375-a406-ecf880616c2d	Rio de Janeiro	Brazil	f	t
1ca12679-d456-4d70-99bc-beaebb5dafa1	Ōsaka	Japan	f	t
0cbaf93a-c5c0-4645-9fbb-aac849732432	Beijing	China	f	t
8e3027f0-9e51-48de-9d9a-125084f8b30b	Manila	Philippines	f	t
bf7cc07c-4ccd-4dca-ab55-8c16a5f56e64	Moscow	Russia	f	t
cc460ad3-69bd-4bf5-ae34-e54e7f994d75	Istanbul	Turkey	f	t
c44b0f6a-e712-4de2-9d21-e4885a4093d2	Paris	France	f	t
40597543-2a9b-4017-8a20-5993f9ed0203	Seoul	Korea, South	f	t
0c40096d-d273-494c-903e-98e04a1bbe8b	Lagos	Nigeria	f	t
68ba35b7-60ab-47bd-85c0-749c18a1b1d8	Jakarta	Indonesia	f	t
4638ccd8-a7ef-4b06-a15f-cfc69bc16ae2	Guangzhou	China	f	t
ba8a5cb1-f998-4f44-bd01-b506594c5db1	Chicago	United States	f	t
82caac75-41c6-48ba-b4e5-b62d9517c00c	London	United Kingdom	f	t
c3fcbe9c-7ec4-43ae-8b89-96daed3b409a	Lima	Peru	f	t
b9bb8f8a-d405-44fc-808c-e3f4174ff23b	Tehran	Iran	f	t
49c07993-682c-4ae6-9919-faf8b3bfd56b	Kinshasa	Congo (Kinshasa)	f	t
2f2bd8b1-8e9b-45ce-a020-d12f1ddb7ffe	Bogota	Colombia	f	t
7d096baa-e1a4-4b3c-a340-cf6f89da5d3b	Shenzhen	China	f	t
9e247e21-ad84-4511-9c30-17df992f36f2	Wuhan	China	f	t
2604aa5d-cdd3-4bdf-ae38-5bed168e7dc8	Hong Kong	Hong Kong	f	t
0a755901-caa3-4ddb-8bf4-9f697a5a0b3a	Tianjin	China	f	t
4054f5ab-d882-4a63-aea5-d194976c4785	Chennai	India	f	t
2b459dbc-82d6-4c73-adc5-2c4d7a35903a	Taipei	Taiwan	f	t
c27c8263-7d83-4a11-ab9e-9cf0198ec26c	Bangalore	India	f	t
5182444e-5e21-4cc3-aec8-ef9f7c5a9581	Bangkok	Thailand	f	t
744245a8-2b58-434c-8075-37e56a672bcc	Lahore	Pakistan	f	t
dc62a2f6-ea52-4382-a81e-e40fe03f8e75	Chongqing	China	f	t
1fd07f23-b089-4250-a84f-72d08f7cfdb5	Miami	United States	f	t
bf80b639-f154-4dce-966b-064d84b0994f	Hyderabad	India	f	t
37780ae6-5d98-4186-8f97-5a9ce54c7900	Dallas	United States	f	t
70bc0929-a95b-41d6-a500-c23af79c7d20	Santiago	Chile	f	t
7a7f434e-ba37-4578-b271-1023b91921a7	Philadelphia	United States	f	t
db42a054-13d6-4b8d-9125-b5107cb34cb4	Belo Horizonte	Brazil	f	t
2d71b01d-8518-4158-980c-2fe93ea216ed	Madrid	Spain	f	t
4a9e5a97-d7e3-4f5d-87b4-2555cd329fca	Houston	United States	f	t
11b14c9d-8651-4e06-9fcd-b81de7b05fd6	Ahmedabad	India	f	t
f53f11d5-6129-408f-ab1c-f3e5c86c3cce	Ho Chi Minh City	Vietnam	f	t
c71d2716-6bd5-46d6-add5-8389ac3bab96	Washington	United States	f	t
1054f0ce-37a4-4a0e-97d6-4642e5a4f197	Atlanta	United States	f	t
c9e92774-158f-4dc4-a978-0440d6f4ac44	Toronto	Canada	f	t
f919a10c-7f3a-46a1-b44a-79dd5ca108ee	Singapore	Singapore	f	t
b356293c-69fe-48e0-a795-45f55994d45d	Luanda	Angola	f	t
e195fbd9-20dc-4d96-9960-46ce5a0f452b	Baghdad	Iraq	f	t
21c1fd0e-fdc9-4353-9ed1-5c412414fae7	Barcelona	Spain	f	t
272a8fb8-98a5-46b4-a622-5e9f3d8a4222	Haora	India	f	t
89070326-a12d-4b42-b802-50337077e683	Shenyeng	China	f	t
089e3be4-56a8-42aa-9206-d5a42de29c30	Khartoum	Sudan	f	t
9e3e3130-dd4a-4293-a0db-7043ade53cab	Pune	India	f	t
a0b907d2-587a-425c-8a3e-d4285ea8d7e4	Boston	United States	f	t
334a1259-7bd7-40a3-b48e-a5fe3fae1e88	Sydney	Australia	f	t
b8d5eedd-fdeb-412c-b99d-12bcc2680f90	St. Petersburg	Russia	f	t
00490d36-c40a-45a4-be7a-49259961b894	Chittagong	Bangladesh	f	t
ae0a2584-5944-4b2f-bbab-ba12e893674d	Dongguan	China	f	t
d66d0512-768e-4d47-9d4e-6edc8b130731	Riyadh	Saudi Arabia	f	t
36140d91-8855-47f5-a919-354e2764ac6a	Hanoi	Vietnam	f	t
c5250ccc-1cb5-426d-a148-0cfac43ec94a	Guadalajara	Mexico	f	t
18d540f5-8650-4b94-9d84-8d28b716ccf7	Melbourne	Australia	f	t
bcc907b2-c48d-4850-9a64-f82b4a309f2c	Alexandria	Egypt	f	t
91b649dc-dfd9-490f-ba02-23553e3fe4bd	Chengdu	China	f	t
c811cd49-ee9e-4f60-8eed-592aa59bdcc7	Rangoon	Burma	f	t
ae72eaf0-8a3b-48d8-9612-f5149a78e0cb	Phoenix	United States	f	t
34e033e1-ac2c-426b-b9e4-b5a3775f9d39	Xian	China	f	t
5165b757-bab9-4ff0-9c72-d273f129e7e7	Porto Alegre	Brazil	f	t
33614684-31b7-469c-8d87-1818aeff4845	Surat	India	f	t
a6af0c28-59f7-436d-8b15-3254578d121f	Hechi	China	f	t
21cce3c3-de1d-40d3-944a-09275428d9e6	Abidjan	Côte D’Ivoire	f	t
44497c6f-18f0-488b-8fbe-1add50380aa9	Brasília	Brazil	f	t
e0e6cdeb-58c3-4c62-9a2a-e8ed02887f1a	Ankara	Turkey	f	t
ac51d41b-5f6d-4387-bb29-6ec47ebf5f2d	Monterrey	Mexico	f	t
fc455be0-277d-4375-a413-d4503fb1b6bd	Yokohama	Japan	f	t
e18e6dcf-a7c4-4024-bf37-8e0444c38364	Nanjing	China	f	t
743922c9-8e89-4787-970f-9b1a8994dcb1	Montréal	Canada	f	t
b897e721-f096-4587-944a-592ad639f405	Guiyang	China	f	t
64c445f8-a57c-4cb1-a240-b8ad21854674	Recife	Brazil	f	t
bfc9149a-c011-4702-905b-5d9a39f06c74	Seattle	United States	f	t
8479dd54-fc62-49ba-a7fa-4bf3dda429dd	Harbin	China	f	t
9942030c-b8d3-4d5c-8548-d49fa4e0cc91	San Francisco	United States	f	t
9b173358-11f0-442d-b859-f2cbdc3a8bfe	Fortaleza	Brazil	f	t
a101abba-8f42-461d-8d9e-76dcb608317e	Zhangzhou	China	f	t
352db6a8-bc30-43bc-b5bc-779c6781fc42	Detroit	United States	f	t
d328919a-84ac-49e6-a899-80a5dc6bf38e	Salvador	Brazil	f	t
d0cb6ea7-a58e-4fa8-aa41-ea13a385730b	Busan	Korea, South	f	t
1cc7f2b1-9c94-48cd-9793-a79ec4fa99f4	Johannesburg	South Africa	f	t
3b7c51bf-f6b8-45a1-a42b-7180622b6458	Berlin	Germany	f	t
905d187c-8137-4e68-b56a-58b50ca008de	Algiers	Algeria	f	t
5d73405c-f6ac-4377-a7c5-438e0f555d2b	Rome	Italy	f	t
dd0fd3a6-2a48-474a-bc5e-8153bcd49555	Pyongyang	Korea, North	f	t
87160e82-6a95-4fac-bb37-ad4f5e09594f	Medellín	Colombia	f	t
7e3544f9-3de9-46a5-b6d8-140cf0c39ba5	Kabul	Afghanistan	f	t
4b6545e7-e7b1-4430-ac6d-c396581bb67c	Athens	Greece	f	t
a46e22f9-43f2-4f77-858f-8b8563fb72a7	Nagoya	Japan	f	t
27b2befa-ada4-4527-b2e3-ece93abffca4	Cape Town	South Africa	f	t
d0d60257-e703-47f4-bc69-c8de160a046a	San Diego	United States	f	t
4efcb289-51c5-4d9c-a091-cee34e146e61	Changchun	China	f	t
156c5da1-f56e-451e-97cb-aba1e8a2fc5a	Casablanca	Morocco	f	t
efc69591-0dff-4b41-b074-f49a922c7abc	Dalian	China	f	t
c59c34aa-9611-42f5-bd8f-be1c4f1594a2	Kanpur	India	f	t
a2df1805-a772-460d-aeb9-fbb6032e41a7	Kano	Nigeria	f	t
d6c315e7-0d9e-4716-a339-4bef3d8e8b7b	Tel Aviv-Yafo	Israel	f	t
7e74a172-6f0b-4d1a-a119-6b786d30e72f	Addis Ababa	Ethiopia	f	t
fef13e83-d27f-423b-9cea-fca16201e139	Curitiba	Brazil	f	t
f27e012f-eb1e-411f-9d9b-b30877c8e1dc	Zibo	China	f	t
62387fc6-e308-458c-a07c-9ea524ff2653	Jeddah	Saudi Arabia	f	t
53555236-f16e-495a-859a-892773c1b679	Nairobi	Kenya	f	t
72f11611-d39a-44b2-80c0-cef5534c5f26	Hangzhou	China	f	t
3f85c684-b027-46fd-aa27-7908dafe3011	Benoni	South Africa	f	t
83454c48-f672-4571-8fbb-fe9656fab7f3	Caracas	Venezuela	f	t
4cc64ab0-9cce-4105-8d7b-4b798da213e9	Milan	Italy	f	t
47b6df9d-6a27-4eaf-9118-d166fb221842	Stuttgart	Germany	f	t
f55a6336-14bf-4825-9dbe-a263bc393058	Kunming	China	f	t
56960feb-ece8-40df-b5e3-665cec0b3a5b	Dar es Salaam	Tanzania	f	t
b7eaa9dd-95bf-409c-9989-75cbd482ff3d	Minneapolis	United States	f	t
06a76cad-2f3b-4130-9996-331277033eee	Jaipur	India	f	t
587985f8-6e8d-4c46-9d83-1bb11f8d1062	Taiyuan	China	f	t
67f31d4f-832c-4161-8a69-85cfc8bcbaa9	Frankfurt	Germany	f	t
48a7a693-f4c5-4ab9-8f6f-2bf2fa081eeb	Qingdao	China	f	t
1d343857-4a82-4b87-bbdb-ac2593077c65	Surabaya	Indonesia	f	t
227d2e0f-2e58-459d-bc3a-397b688e3147	Lisbon	Portugal	f	t
d6b27618-3b86-4cf7-b01b-84aaaa45cc22	Tampa	United States	f	t
9a333c90-4ed5-4734-87ed-0fe16652cad9	Jinan	China	f	t
dceddea6-5d5b-4232-a2c3-835fd84d4ff3	Fukuoka	Japan	f	t
a911ce5f-f8cd-4602-85dc-040a790e2aac	Campinas	Brazil	f	t
94fd34cb-e624-4b7d-9a5b-6ccd54ad5b8d	Denver	United States	f	t
46d86194-7351-44c6-a2a7-4bdf9bcbca8f	Kaohsiung	Taiwan	f	t
fd34c712-8280-4036-a619-b55feba65052	Quezon City	Philippines	f	t
ec728a74-3dc1-4cbb-adb1-d60e5d63dc71	Katowice	Poland	f	t
20597cea-816f-4e92-a772-d3595db68b28	Aleppo	Syria	f	t
7d331d18-af10-4c13-a9d0-6a8c773db5fc	Durban	South Africa	f	t
048a0041-d0b9-4e66-88ce-2375691d5b42	Kiev	Ukraine	f	t
fb05184e-fa42-4413-b385-daaaee21a4c9	Lucknow	India	f	t
e70eb64c-e387-44e5-8711-bc4d08fdb74a	El Giza	Egypt	f	t
3d991f29-6f3c-44fd-a0e3-8e1f2807aa3c	Zhengzhou	China	f	t
c20bc6b5-c3f3-400b-b2e5-0386c5a88350	Taichung	Taiwan	f	t
2318dab5-c467-411d-9455-6296cc0b8dc9	Brooklyn	United States	f	t
54747948-329b-472b-bbbe-76b53995173a	Ibadan	Nigeria	f	t
909cad52-1e90-4681-9413-995a3c099ca2	Faisalabad	Pakistan	f	t
45d49f72-5c5f-4918-95d2-2bb9ccdebce9	Fuzhou	China	f	t
16bf0b51-21a0-4a31-981e-f28b42062edc	Dakar	Senegal	f	t
761b5758-b4e0-4ea9-81b5-c267802ed3ef	Changsha	China	f	t
f3e3b6f3-a6c6-4647-95e1-88a7491f630a	İzmir	Turkey	f	t
7a41cc25-162a-41a5-9743-bc4680fa43fb	Xiangtan	China	f	t
207cbd94-218f-4712-b84f-5088d8b87f93	Lanzhou	China	f	t
148bb039-aa93-47cc-9ea8-3324a7b9f22f	Incheon	Korea, South	f	t
28fbd961-79c7-445f-82b9-6eca8659592e	Sapporo	Japan	f	t
22f1cedc-f5c3-4aad-80b7-59ecc100bb6f	Xiamen	China	f	t
77477fde-a952-42d5-95d4-b69c01f04fb1	Guayaquil	Ecuador	f	t
333c8fd1-8e1b-4c7e-ab4f-fb34a52f8043	George Town	Malaysia	f	t
61e1e72e-be50-4312-9a21-9856f0ab4017	Mashhad	Iran	f	t
1ddd046c-1634-4e57-9baa-88c0b0879093	Damascus	Syria	f	t
fa5ce01b-b20f-423c-b06e-27b6269e227d	Daegu	Korea, South	f	t
f5f430d5-c68d-47cc-bec6-ca0553b4ac6c	Nagpur	India	f	t
47986111-8099-4b48-b246-d71085e33489	Jinxi	China	f	t
1d44e961-b433-48f3-ae58-0ad4441e5c25	Shijianzhuang	China	f	t
19863169-ca25-4be9-86e7-87c21d34e2b1	Tunis	Tunisia	f	t
cd5ed95e-640a-4674-b0bd-ecfcd075f1b9	Vienna	Austria	f	t
3b75d48e-0150-47b0-a8c2-21a7c14b1fe6	Jilin	China	f	t
9ef2d5b0-1f5f-4508-aa9e-9c976c5a7029	Omdurman	Sudan	f	t
f5bcbf96-192d-4cea-94c2-8967ac55793a	Bandung	Indonesia	f	t
bf660b1c-0933-4e0e-9e40-ca77d2b76838	Bekasi	Indonesia	f	t
3712cf7d-f0a8-4b21-8eb8-cec08666c7e6	Mannheim	Germany	f	t
3f90dfe3-3b40-472d-9f5a-832f410d65e5	Wenzhou	China	f	t
dfa3edfd-ccb7-49f5-817f-9c9209ee3c8e	Nanchang	China	f	t
be7a75be-54b1-491a-a324-2962281dff87	Queens	United States	f	t
22333a11-3d2e-4b62-ac9b-6877253a3c5c	Vancouver	Canada	f	t
3872a1da-8d34-481e-acce-3e0ea39eb9ec	Birmingham	United Kingdom	f	t
f13dab2b-f001-4bcb-945a-b7fd86b25c1a	Cali	Colombia	f	t
dbbace84-bb3a-459c-aa7d-98e3a9ff95de	Naples	Italy	f	t
c2138ed6-515e-4b9c-8a83-683e5c7a2827	Sendai	Japan	f	t
b0aa750c-f969-4293-9a5f-56dcd5c71780	Manchester	United Kingdom	f	t
54528fd8-4e29-49ca-a1ca-f7fc5249d708	Puebla	Mexico	f	t
671703f4-9bfe-4ff7-8974-0b1f2c918b17	Tripoli	Libya	f	t
4ad5b9fd-5917-4622-a253-6d9352ab7e7d	Tashkent	Uzbekistan	f	t
061a84ce-4371-44ad-a925-ff0f953d5737	Nanchong	China	f	t
6c4f5b68-01ce-4df9-820b-26f6d9e49bc4	Havana	Cuba	f	t
84abdad4-9d5f-48ec-ab8b-38cb46edf282	Baltimore	United States	f	t
18b8c53b-0b3c-4496-a310-e347a1e5721f	Belém	Brazil	f	t
d6d0fcab-76d2-4c87-ae8d-8fd732313753	Nanning	China	f	t
b6b09ed8-7b32-4b30-a276-a60042af6152	Patna	India	f	t
c5c19ecb-19a4-4007-ae8a-dbafa00d95b0	Santo Domingo	Dominican Republic	f	t
4a81f6bf-c206-4f87-930a-8432131cc275	Ürümqi	China	f	t
9c23ee8f-e062-40f4-827f-9432b2e758b9	Zaozhuang	China	f	t
3fe96651-9cb7-45f1-8b4b-0b0dd4b0a205	Baku	Azerbaijan	f	t
bacfb9be-77f9-42ec-9102-dcfaaf328cc2	Accra	Ghana	f	t
9ad9c752-73a6-495c-b772-21634ed59963	Yantai	China	f	t
e541dfe3-75f0-438a-a68d-623925d88fe5	Medan	Indonesia	f	t
69a7ce69-080f-4470-95db-b9760deb085c	Santa Cruz	Bolivia	f	t
7b770454-d7aa-4dfb-a88d-c058f9407818	Xuzhou	China	f	t
bba0b818-64c1-4fac-8eb0-3e2fd44f4d29	Riverside	United States	f	t
f3b1ebba-60c9-45cf-8a84-5effebb46740	Linyi	China	f	t
ca3341a2-2c89-46aa-85a0-2c081d680eb8	Saint Louis	United States	f	t
517f8226-28ee-4b1e-a902-41f8307d43c6	Las Vegas	United States	f	t
a4f92d2d-edc3-4c60-88b0-bb834053f462	Maracaibo	Venezuela	f	t
38f485bd-4e7f-472a-8421-22650c2cbd2b	Kuwait	Kuwait	f	t
e99c91ac-7306-406d-b5ea-34cbdd711f5f	Ad Damman	Saudi Arabia	f	t
572441d8-855f-4a88-8ac8-96343cbbb31f	Portland	United States	f	t
c8581cc1-e6f2-400f-8c1a-c45ae83fbaef	Haikou	China	f	t
8d45fe12-1dbe-476e-8641-ee0b31fd32b8	Hiroshima	Japan	f	t
136f5959-70d5-40ec-a4b8-23c4605dae07	Baotou	China	f	t
6143b623-b11e-49e9-9992-a633d52269e8	Hefei	China	f	t
a08e1d06-729e-4295-b527-dfbb80077d5b	Indore	India	f	t
fc01505e-064f-4714-b43d-bea6e9f1b2e5	Goiânia	Brazil	f	t
0a37d433-4a46-4707-8d8c-e0311aa871d8	Sanaa	Yemen	f	t
68a70fc0-e0d2-4a24-944c-63c33c709b4f	San Antonio	United States	f	t
b10d56d4-a515-4450-b6c4-8bbdcbfa7cfb	Port-au-Prince	Haiti	f	t
8cfeebc7-4d99-437e-ac0c-af051ebfc168	Haiphong	Vietnam	f	t
31f0929e-5b65-4856-abf8-b46bcb66cec8	Suzhou	China	f	t
0a46ec2b-a1e8-4a13-a74a-6e4250f5ec09	Nanyang	China	f	t
fa6be375-a740-49f6-980c-128127c8ea6f	Bucharest	Romania	f	t
fe6bccfd-6a78-4353-810a-5b060b3db3ed	Ningbo	China	f	t
7257ac39-f647-4655-b6e9-497f9ed482af	Douala	Cameroon	f	t
f4e581a6-1a11-407b-ab52-da3805e83f4f	Tangshan	China	f	t
b7510889-b708-4c17-9af3-183da3e9620a	Tainan	Taiwan	f	t
d441c936-3276-4a2f-abd5-bbd49746d186	Datong	China	f	t
e7a884df-cd3c-4475-9f44-8c1e93133975	Asunción	Paraguay	f	t
48ab6670-58c2-4f64-b1f5-7bf1fedfd08b	Saidu	Pakistan	f	t
9f298e67-e713-4f43-851e-1bbfc512a5b7	Brisbane	Australia	f	t
7ae6cd4b-a825-475b-b7ca-db48aa09a23b	Rawalpindi	Pakistan	f	t
8a612b81-ecc2-471f-af3c-88b43ce1c223	Sacramento	United States	f	t
5e33ac2b-1d05-4cf9-97b1-2b4cf030707f	Beirut	Lebanon	f	t
fc81f3ce-8697-4dce-ad02-014d07a27d60	San Jose	United States	f	t
5866110f-42d8-4825-bc85-6027ca986a45	Minsk	Belarus	f	t
cd1f5411-ab1c-4e0d-856f-b16613800c82	Kyoto	Japan	f	t
d6737850-c021-481c-a581-12d4ce8d5e66	Barranquilla	Colombia	f	t
91f338e1-603f-4548-9348-5c1f987c603b	Orlando	United States	f	t
9dae73a8-a491-426a-abf0-f1d12d00b08f	Shuyang	China	f	t
86e20488-b7c8-496c-9534-3a0ecb39471b	Valencia	Venezuela	f	t
7d6e2a8b-5cec-49f5-930c-885c41dec022	Hamburg	Germany	f	t
765e3f00-58d0-4cf1-beed-7fdb939ce11f	Vadodara	India	f	t
e6bb15d0-fb0a-44eb-8090-78e25ae23552	Manaus	Brazil	f	t
bd084f90-dc79-4914-8db5-55974328e47f	Shangqiu	China	f	t
184a53ed-3a58-4e55-9b8d-6adbf4f567e2	Wuxi	China	f	t
2629b257-b541-4501-9b80-9f1f56aa11fa	Palembang	Indonesia	f	t
83368527-a06c-426a-961e-0e15c8fcd76a	Brussels	Belgium	f	t
5636e4d1-9cf3-40ff-99b5-cd51e49cb363	Essen	Germany	f	t
c66d06af-7d65-49ff-81b2-054113a39242	Cleveland	United States	f	t
2cacf553-1722-4f22-a60d-fc04f0efe33b	Bhopal	India	f	t
57bfa89c-45ee-4a08-9306-e18660a5091b	Hohhot	China	f	t
752afb22-62c5-45ee-affd-3f9eeb3ec73c	Pittsburgh	United States	f	t
0f1cd2d3-a348-42dc-b920-6838baf102f0	Luoyang	China	f	t
41925198-fa89-4879-b688-fb11c5d9e204	Santos	Brazil	f	t
875fd4b6-f707-451c-bdd8-3b6c6a97912b	Jianmen	China	f	t
64dedaf7-7a38-48c8-a89a-95dc6a1e54df	Warsaw	Poland	f	t
fa53085f-abd0-422b-9477-7b31b3a03ac5	Rabat	Morocco	f	t
64dca8f2-bf53-44d4-a03e-b4970bf836f8	Vitória	Brazil	f	t
b47e0135-ae04-4768-bd3d-1e58732b2047	Quito	Ecuador	f	t
3b9a7629-27f0-47dc-a96a-fde7a3d1e20d	Antananarivo	Madagascar	f	t
b095b7da-cacf-4e07-9e75-947c56100276	Coimbatore	India	f	t
934de93d-8754-4a21-9096-f5feb24333c4	Daqing	China	f	t
eb57f4a9-7a60-4e0f-8871-872dc816103e	Luan	China	f	t
6e6df7c2-2972-4e3e-a84e-4f48a0a5d873	Wanzhou	China	f	t
fb4e4438-c97c-48b5-a9a0-fb85731da429	Budapest	Hungary	f	t
76a4062b-0bfa-408b-a52e-69eaba349f63	Turin	Italy	f	t
80938193-77aa-464b-8934-8b7a9e52961c	Ludhiana	India	f	t
cc28a165-2a48-44d2-ada1-631fc9ed365d	Cincinnati	United States	f	t
f1550b6d-de5d-4c34-a084-55023538e5ff	Kumasi	Ghana	f	t
adcc96a0-61e7-4a9e-99bb-ea8c2168091d	Manhattan	United States	f	t
43e1f2ba-35ab-41de-a0b9-0451a431d1a9	Qiqihar	China	f	t
4a288322-237c-4d06-8a6a-32ce71a3832d	Anshan	China	f	t
c0288aa1-2313-462e-8623-8462a19214a0	Austin	United States	f	t
23ce8a2f-33e3-40b2-ad86-9e7e15bdc7b6	Zhongli	Taiwan	f	t
7aebe743-f10b-4ea5-8833-fe142a8d731d	Handan	China	f	t
66366ef0-6b4b-431f-8ab7-4f767414037e	Taian	China	f	t
b3b55b20-a870-467e-8713-a219c0941b67	Isfahan	Iran	f	t
7f7af49e-02a9-43d6-8f25-3fff4b97f140	Kansas City	United States	f	t
6cf62d07-2936-4861-bf35-d31001452eea	Yaounde	Cameroon	f	t
85aa4885-d2c7-4068-b954-e13394830a0b	Shantou	China	f	t
df9a0efb-99e7-49be-8f57-25dec912026a	Agra	India	f	t
d219f3c0-b02f-4ce2-bc38-e1f59437f1cd	Zhanjiang	China	f	t
cff37066-93e9-4d5a-8466-7e577e0f3142	La Paz	Bolivia	f	t
0947b088-2333-499e-8198-938c02efade9	Kalyan	India	f	t
80e973dd-0217-4b0d-96ef-9406b52ea264	Abuja	Nigeria	f	t
8c00ce91-4194-4589-9b10-2263a37d36e3	Harare	Zimbabwe	f	t
6715f7fa-3434-4329-8954-d272e9330181	Indianapolis	United States	f	t
b49fdc54-f609-43a6-9aae-9f499b4e2137	Xiantao	China	f	t
9cae2538-dac0-4e0a-b136-482a97d8a3f7	Tijuana	Mexico	f	t
f1f5dbe8-0f9c-4799-a49b-0dba36c78c63	Khulna	Bangladesh	f	t
b9038440-4e19-4ed1-a8cf-58f9b250dab4	Weifang	China	f	t
b8e51427-c615-4b22-8336-1182de06a617	Santiago	Dominican Republic	f	t
9abf5111-7f5a-4d91-99cb-d5afd910234e	Xinyang	China	f	t
053c393c-8d59-4b90-81ee-db435ea66aaa	Luzhou	China	f	t
91af78e3-12bc-4b76-8dda-fb82ebc65cb5	Perth	Australia	f	t
14dbd9e8-a466-489d-9ff8-d69b46d71d3c	Toluca	Mexico	f	t
df1b8302-d03b-4c3f-aa8b-748ea2658e87	Leeds	United Kingdom	f	t
2f25f28d-239a-4faf-949c-ffdf9fac63ca	Vishakhapatnam	India	f	t
c4f4e821-13ea-4277-9593-21fcd3b52623	Kōbe	Japan	f	t
bc8f170d-6c52-4d92-ae39-3148b2c3ef42	Columbus	United States	f	t
65cdd9bb-cafb-4310-b276-b840e9d8d435	Multan	Pakistan	f	t
e3fa9379-de0c-480e-9c34-c6a06f5844fd	Kochi	India	f	t
cf067114-aa3a-449d-9a00-fd642e6ba461	Gujranwala	Pakistan	f	t
3941b28e-3d28-49ad-8bd2-2c7ee08c136c	Montevideo	Uruguay	f	t
3f28c30d-d2d2-43cc-a05f-4786af1187c7	Niterói	Brazil	f	t
385139ee-c23d-4569-b083-fd8ba9f81642	Ganzhou	China	f	t
c3103558-27b6-41f2-b8a8-8d13e6e5d2dc	Florence	Italy	f	t
f3f82eaa-6e1b-48f7-bc91-f8db122d2458	Liuzhou	China	f	t
2ef4103a-7bfa-4428-9c88-8bd1b605eddf	Bamako	Mali	f	t
a690d313-1ebb-4675-a4f9-ba70b230814b	Conakry	Guinea	f	t
25d52d54-ba4f-4594-ae39-2bd54eb7cf05	Bursa	Turkey	f	t
a66fc8d5-bda4-48a6-ae6f-c93181f08f00	León	Mexico	f	t
9de5e425-96c6-49f2-84bd-98f8e9056b98	Virginia Beach	United States	f	t
ac1c7e85-e4af-4f7a-9d59-5a97613718df	Nasik	India	f	t
c412eded-86b9-4720-bba2-f71703f10abb	Fushun	China	f	t
e2e83b5b-a0a3-4b0c-9c51-3d98c59625eb	Changde	China	f	t
d6e14e18-1c1f-41f0-bf95-26d08084e8e5	Daejeon	Korea, South	f	t
d5cf3d87-b746-4f4b-a07f-525c1fb1413a	Charlotte	United States	f	t
646d1201-f095-4c54-afd4-4fc2ad6c85d7	Phnom Penh	Cambodia	f	t
4665f0a4-c642-4051-8fae-0530a99963b0	Neijiang	China	f	t
864618f7-47e9-45b9-b396-8d5f69a253dc	Quanzhou	China	f	t
4b66b344-00f0-4567-bddf-526559a98128	Kharkiv	Ukraine	f	t
9bfc4411-68ee-476c-a548-99afef632d71	Hyderabad	Pakistan	f	t
b192f8e3-84bc-46fb-99b0-9888fc85dd96	Bronx	United States	f	t
4931fca1-28be-43c8-bdba-fb76b85ab5bf	Lomé	Togo	f	t
0859afad-b330-4cf0-b8c6-b19a8e19f12a	Córdoba	Argentina	f	t
51934c79-6f4e-4e48-9a71-92d4f1c222fc	Huainan	China	f	t
66752406-6028-48f3-ba2c-64e0906febd9	Doha	Qatar	f	t
10753ea6-946f-42d2-bae8-dba42e32f945	Kuala Lumpur	Malaysia	f	t
2bf072e5-cfa2-41cd-969d-7c15cc079196	Maputo	Mozambique	f	t
f542a9bf-1998-4503-9549-cd5fadb3e047	Kaduna	Nigeria	f	t
71b646e5-5cc9-42aa-a371-d22b67cbe38b	Gwangju	Korea, South	f	t
c2e2efc7-7bae-4ba7-9c14-71567ecd00f6	Kawasaki	Japan	f	t
bcadc15d-b89e-453c-bbd6-4b919b98ac20	San Salvador	El Salvador	f	t
640db2dd-119d-4682-97d1-bbd6a17c8788	Suining	China	f	t
4730eeca-e03d-42a7-9221-e6846ca15292	Lyon	France	f	t
70f1e173-2742-4717-86de-c12a343b2b2b	Karaj	Iran	f	t
afbdce63-1c32-457b-8495-695fef3d8ac0	Kampala	Uganda	f	t
29c69ec5-7793-4476-bd7a-19cd7f8e828a	Tabriz	Iran	f	t
664c6b0d-3f42-48f0-a465-c419755eb501	The Hague	Netherlands	f	t
536a4736-cd89-40e8-80e2-02d20a950399	Davao	Philippines	f	t
e1c289e0-5478-4dd0-baed-7850cd217e8b	Marseille	France	f	t
06d9b342-5266-415d-af9b-7aa85d7d17c1	Meerut	India	f	t
31590df2-6927-4b0d-a674-6cbd4722cd39	Mianyang	China	f	t
420da575-08b4-4e20-a150-e4b47cde70ee	Semarang	Indonesia	f	t
ceae5d2c-2710-4bb5-92b3-0dfa2bd99b84	Faridabad	India	f	t
89c766a7-a7a3-4adc-9c50-5c5544a7a182	Novosibirsk	Russia	f	t
b662f249-6ca4-4acf-a8be-d36d2eca1325	Makkah	Saudi Arabia	f	t
3dcfa53e-c94b-477c-ae20-4bea73d03fa9	Dubai	United Arab Emirates	f	t
9937e790-b623-41c5-b778-2e8f7546f7e1	Milwaukee	United States	f	t
9518c062-8a19-4610-b683-28b032f4639a	Auckland	New Zealand	f	t
8692d331-6fa3-40e3-95b0-a015c9e4cfe7	Maanshan	China	f	t
fa56b712-6a9c-41a4-b9f1-9e270c6672e0	Brazzaville	Congo (Brazzaville)	f	t
a0b3db09-f8bc-47f9-acd0-0e04f26f8ee8	Yiyang	China	f	t
a4b3bb49-00ae-4ab8-b1f7-78e958377b11	Varanasi	India	f	t
4252c2b8-2816-4b82-8c9c-43bc3ddd2d07	Lubumbashi	Congo (Kinshasa)	f	t
59c118f8-8265-458c-b6bd-3bd208fad387	Ciudad Juárez	Mexico	f	t
26d6540d-36e3-486e-8dd2-d71327d75552	Ghaziabad	India	f	t
454b48f5-436a-465a-b318-78ac0d0dc4b2	Pretoria	South Africa	f	t
610f7e66-4a71-442b-9a97-0a3d1bf2b3a8	Heze	China	f	t
c28e53f8-f0b1-4b55-82dc-cd59771b5c4f	Porto	Portugal	f	t
204509d2-5367-44ff-a061-b3c8dc207f61	Lusaka	Zambia	f	t
25a26f8b-6063-4f6d-adea-acca20183b86	Asansol	India	f	t
cc51743c-c0a8-4c60-88a5-b0c73bb61bef	Changzhou	China	f	t
3592bc95-0810-4a48-be7f-aff2a351a2b9	Mosul	Iraq	f	t
a3020a14-a844-4584-91eb-99dbedc7f4db	Yekaterinburg	Russia	f	t
d1b8d1c2-6325-405d-81ca-4f7ca332e670	Peshawar	Pakistan	f	t
bd8d4bab-7fa5-4639-88f2-247b27050439	Mandalay	Burma	f	t
ed3cd293-fb28-41c4-b297-5b48ef97580a	Jamshedpur	India	f	t
274e00c3-4065-4074-894f-5aa55c8c5bed	Mbuji-Mayi	Congo (Kinshasa)	f	t
20841a27-8e86-42aa-bee9-2e92cc91f917	Madurai	India	f	t
35cb0f3c-aed4-4ea5-88ef-2c33e4f53f40	Adana	Turkey	f	t
a7198581-5f33-409a-9eae-3fdc29ac017a	Sheffield	United Kingdom	f	t
6a012fd2-87bb-43cf-bf57-93914e5643df	Jabalpur	India	f	t
ef552efb-a662-4ce5-8a69-5d41f97b283f	San José	Costa Rica	f	t
f9d2d4a4-94b3-48a6-a2f1-b5259569e4b3	Panama City	Panama	f	t
7c540026-e955-40a5-9f9d-b103eab08050	Nizhny Novgorod	Russia	f	t
b6324b35-5a93-4647-931e-5a8089fe9db4	Chifeng	China	f	t
4537ede2-56bb-4e54-9006-01d898e25be9	Duisburg	Germany	f	t
d0a81b7e-5752-4545-b4fa-8a10bf3dc448	Munich	Germany	f	t
3874f6b5-029c-4b2d-ab0b-f3256bde46d8	Stockholm	Sweden	f	t
0c01a913-6c3e-4157-898f-9e0b958f0788	Huaiyin	China	f	t
f662595b-5477-4dc7-92d6-3df03c5ca59d	Ujungpandang	Indonesia	f	t
0f01bd1a-8096-42ed-838e-42e1dd781935	Rajkot	India	f	t
b8c2eb53-fb28-4505-92eb-bc5135f9a45f	Dhanbad	India	f	t
5e5e8a6f-8833-4445-ad86-132e100d9670	Mudangiang	China	f	t
4a820a76-e7d9-4ba2-a845-eb8678c4a8c3	Geneva	Switzerland	f	t
39227d08-0202-467d-888d-a698977a3133	Shiraz	Iran	f	t
7890852f-afc3-444d-a2b0-728f839faa2d	Huzhou	China	f	t
e61dd8bd-6968-4f88-9481-5524fc913c55	Tianshui	China	f	t
29ca54ea-c5ec-4d77-8164-12b6f400c1f4	Lupanshui	China	f	t
fee3c3e0-bdcd-4277-b014-4fee5c20f137	Düsseldorf	Germany	f	t
c84aed32-36e8-421e-9d6b-090c47963670	Maoming	China	f	t
739b2d72-3cbc-4102-be28-ebf370b79e61	Seville	Spain	f	t
120b899d-bf58-450d-a520-cec6ad4db609	Amritsar	India	f	t
d4451757-da83-42a1-ad13-c4977b4762e6	Vila Velha	Brazil	f	t
857c13c4-2654-401e-b35b-e5a6fe08c62b	Almaty	Kazakhstan	f	t
9b2272cc-1670-4f5c-a470-753d70b9a027	Providence	United States	f	t
e65001cd-99d8-4fdc-977a-be08a4391b42	Warangal	India	f	t
d6bebda4-9963-47f3-8534-0fd29224fd94	Rosario	Argentina	f	t
8116a443-22a5-404e-8bb9-c28c2eab4fbf	Allahabad	India	f	t
05afe870-8369-416d-ba86-90cb8cd00e81	Benin City	Nigeria	f	t
c9a5304b-402b-46ca-8702-cc4bc062a332	Jining	China	f	t
a7234e47-ac59-4a7a-8ce6-d6d3fe54901e	Maceió	Brazil	f	t
11394023-1d99-4c85-ab4a-6adc3a18194d	Sofia	Bulgaria	f	t
a0715bf0-a818-414b-8caf-f83afe0a1d2c	Abbottabad	Pakistan	f	t
073c5fe6-88bb-4c27-8987-83e57628ea1a	Banghazi	Libya	f	t
74984a70-d4ec-4671-a2aa-f6a8d1da5a7d	Cilacap	Indonesia	f	t
db4c991a-fc06-4670-964d-f4fc6ac90010	Prague	Czechia	f	t
0a709f8f-4a59-4690-a41e-9ec1c2c884b2	Glasgow	United Kingdom	f	t
2cb578fa-47e8-48b7-beaf-215f0b61a4e0	Leshan	China	f	t
07e36211-33b4-4ee0-932d-83ff4d489040	Jacksonville	United States	f	t
2bc7084e-2fda-40a5-ab2d-aa47d00216d6	Ouagadougou	Burkina Faso	f	t
cee1188c-3497-4b8b-acd2-04e3fa34ada4	Adelaide	Australia	f	t
e1191f94-b063-48f3-b7bf-147057563c36	Ottawa	Canada	f	t
295c5533-87dc-4402-b5d0-a87944812d37	Shangrao	China	f	t
6cf9cceb-0ca7-4770-8b19-35a69bc2c2f8	Torreón	Mexico	f	t
7e8cd7ef-e57a-4411-a919-baa0b7ccff35	Srinagar	India	f	t
c4a353a2-f0da-4316-995e-1d1284aba504	Vijayawada	India	f	t
0ce066d6-740c-4d2e-93c3-32f284b9677d	Samara	Russia	f	t
51207e58-7923-49ef-b28b-d18a705d08d5	Omsk	Russia	f	t
990e0452-66a3-4493-aae8-0aa436145dc7	Newcastle	Australia	f	t
3be7a5a6-82d7-4c25-a5f4-ddc67d255ce7	Yulin	China	f	t
59a533a3-139c-45cb-b9c0-5e53e8664541	Nampo	Korea, North	f	t
8996b434-dc65-41c9-8384-1a359bd7a460	Xianyang	China	f	t
d32eddfb-05cf-4d61-aca6-c8e2d1d10e37	Cagayan de Oro	Philippines	f	t
7729dda2-7773-4d5a-9670-63776196bab0	Can Tho	Vietnam	f	t
e6b299d1-21cf-4812-a8d9-c99be9dd9778	Barquisimeto	Venezuela	f	t
01dc1e34-adc1-4e8b-b4b9-41c56539b6f9	Kazan	Russia	f	t
e55677a6-e42d-4a41-97df-70575fa11915	Helsinki	Finland	f	t
42798999-83d7-4460-a450-243ce7ba7493	Aurangabad	India	f	t
1be3e992-9151-4604-aa8c-ff515e2faf13	Calgary	Canada	f	t
96eb53cb-d533-487d-b557-616449f08b52	Nezahualcoyotl	Mexico	f	t
eb8ea7b9-2495-4056-80c0-3bb4f2b99b71	Zürich	Switzerland	f	t
68d0d320-3eec-4a45-8e15-808efe845f51	Baoding	China	f	t
02db70b9-865b-4f19-b913-d98e3c0c811f	Zigong	China	f	t
ae24bc99-152e-4978-84cc-d35c3a7cab92	Sharjah	United Arab Emirates	f	t
b38022c6-5fa7-411a-8aef-2a150513d2a6	Yerevan	Armenia	f	t
0b3b5f87-423b-4b6a-9acb-de49f25a676a	Mogadishu	Somalia	f	t
a5dc2972-0fbe-4e5b-8097-70aeea6dad62	Huambo	Angola	f	t
b02ff1c1-b8cc-40fa-b9a9-ed0d2e1ec165	Ankang	China	f	t
6259a69d-b0bc-429d-9ad7-65d364197f44	Tbilisi	Georgia	f	t
4c4ef215-ab6c-4d29-8fda-ad44241defcb	Ikare	Nigeria	f	t
f4ce2e0b-00cc-4e25-b77c-200f20c42205	Belgrade	Serbia	f	t
0171d726-1b8b-4912-8a2e-70d1f7af8f0e	Salt Lake City	United States	f	t
12af245a-1161-452e-8324-7b5934ec5661	Bhilai	India	f	t
41270b20-0e44-46ff-a6b2-c612cc811a23	Jinhua	China	f	t
3f2a81b9-7866-4f59-8e7f-fdde954ca339	Chelyabinsk	Russia	f	t
ecf54f33-44b2-4965-9794-160057656c63	Natal	Brazil	f	t
4973e442-892d-43f5-b39b-949c30e91124	Dushanbe	Tajikistan	f	t
2bf2376b-c591-4c73-9c92-f40495e04294	København	Denmark	f	t
cf3bb22e-60e4-4339-9520-72c0ae36870d	Changwon	Korea, South	f	t
bea80dc0-b900-4dc0-ae6d-7dddcc0d8f4a	Zhuzhou	China	f	t
104cccc1-f1c7-40e9-ba2b-578faaf8f691	Suwon	Korea, South	f	t
6e0d4ad8-8892-4a5d-9bbb-122bbe7e249e	Nashville	United States	f	t
ff1370b2-f7b0-49c3-a22a-f1850dc19572	Vereeniging	South Africa	f	t
882378cf-aba9-40f8-a6f9-6ecfefd58c39	Xiangfan	China	f	t
eb2fdf3c-f349-4418-91ae-953ed6ca0a0e	Memphis	United States	f	t
0a950338-916e-44f5-bb21-6f5814ea415a	Ulsan	Korea, South	f	t
5934f3e1-24da-4533-9aa1-124c03daf139	Zhucheng	China	f	t
e16b83eb-6c26-4db1-bbfc-f6fa508a56fa	Amman	Jordan	f	t
411ae23b-dd40-498f-a88b-ad9937e02e47	Richmond	United States	f	t
c8f3ce3b-817c-4263-806d-ee000afc76d3	Dublin	Ireland	f	t
dcdf48d3-fbd9-422b-b290-d1beca90dc66	Edmonton	Canada	f	t
36237888-689e-4de4-9fdc-a4cef38fabec	Sholapur	India	f	t
43f3bc64-99a2-4454-9494-cbe1b6ad2438	Rostov	Russia	f	t
272782ad-c23b-469f-a155-3c9ba236741c	Dnipro	Ukraine	f	t
f0f5eb1e-e4ac-46a4-8edf-1ee0fa6e1951	Xining	China	f	t
f013491b-4b7b-4efc-84f8-74986699acf8	Zhangjiakou	China	f	t
2f46378d-6968-463a-887f-3d63a3b60afc	Gaziantep	Turkey	f	t
09b28f27-9727-43ad-90c5-70a44bec3cf8	Lille	France	f	t
c85e0b5e-9e15-42c4-a944-b03fe4019d8e	Ranchi	India	f	t
8097787b-9ba8-4833-acf9-d5a75bc7843f	Monrovia	Liberia	f	t
9d0179d4-9b56-4734-bb62-224691924c1d	São Luís	Brazil	f	t
67455ff6-2d3a-4b84-926f-1218d53385f3	Amsterdam	Netherlands	f	t
ba392572-7c6d-4c81-b5b1-b573778c5daa	Jerusalem	Israel	f	t
e3547dad-1f2d-4293-8a16-b032e2cc2314	New Orleans	United States	f	t
25181523-2ba7-4d95-a9d9-79507a414665	Guatemala	Guatemala	f	t
81b93093-9f07-478e-b335-902a6a0db46e	Florianópolis	Brazil	f	t
62242992-f006-4794-aa7b-ee78661be9b8	Zhuhai	China	f	t
e331ef2d-ea22-499f-bffa-6ac6b7cee040	Port Elizabeth	South Africa	f	t
a6e821ad-252d-4c91-8e53-c9de593b8d62	Jiamusi	China	f	t
dc9d58a2-c220-434d-89a6-c28381d7671f	Port Harcourt	Nigeria	f	t
ed48f3c1-535f-40a5-af07-e54ea65e9c82	Raleigh	United States	f	t
16a3f9bd-f076-4fbc-8da1-36fd1ed7535e	Ufa	Russia	f	t
4ff0e07b-8ea2-4c68-9c8f-5e391c6cc6aa	Hengyang	China	f	t
08210511-33e1-4f60-82ed-eca655db9fa1	Benxi	China	f	t
19bb1b8c-6d08-459f-a5e2-62980f8ef459	Louisville	United States	f	t
aae1a4aa-49c3-43c4-8965-6e91dab8b2db	Haifa	Israel	f	t
dac25dd7-44e3-4d46-a876-29971d426d8d	Medina	Saudi Arabia	f	t
2e84a3d2-f612-46ea-b46a-f0ce54258430	Bucaramanga	Colombia	f	t
306c4e0b-0885-4570-b963-69f07b0c2239	Maracay	Venezuela	f	t
7ed62f4c-a6b8-42fd-86ef-9ee01cadd353	Rotterdam	Netherlands	f	t
e2769581-7c26-4717-9556-ee1af5600de4	Hims	Syria	f	t
4ce95a83-2524-492b-813f-f4f97a293eb8	Cologne	Germany	f	t
b9cdfe6c-3ba6-4b0c-b97a-d29ef4f081b9	Qinhuangdao	China	f	t
19cb2e66-b6fa-40c8-863a-ed5f4439a845	Fez	Morocco	f	t
4ff719bd-edb8-4b39-9937-e29b5f9188a4	Cochabamba	Bolivia	f	t
935b7164-80df-4f12-81c1-ff9c59c618af	Baoshan	China	f	t
4a680e08-6e67-4ad4-8bb4-a54ed002affc	Yongzhou	China	f	t
7e3f2f05-dab9-47ae-9397-22912d618ad4	Da Nang	Vietnam	f	t
bbc27c0f-3c31-4909-9a27-7312f12be774	Aden	Yemen	f	t
4bc92478-0bce-4c8a-a5c6-b196fb2736be	Kitakyūshū	Japan	f	t
861dd31b-80c6-4166-ba10-aa4fe353e65a	Perm	Russia	f	t
e186a5e3-d4c8-4c63-bbe1-5074ab09f9a1	Ahvaz	Iran	f	t
3b9cf9d1-4af3-436a-a968-6c7efadfab61	Jodhpur	India	f	t
8e1cad1a-9e43-4076-8ba3-88bba3727c3f	San Luis Potosí	Mexico	f	t
053da592-8bd1-40aa-b8f9-0ccaf6cd2e57	Odessa	Ukraine	f	t
1cdaf5d9-5cf4-4991-a5be-b0ff0fb33437	Yinchuan	China	f	t
6479055f-b9e7-41f7-9aa8-ba9b88ffb5ae	Ndjamena	Chad	f	t
f5dec7b8-ba96-4b7f-bdca-ecf97d3c401e	Donetsk	Ukraine	f	t
a0470978-d40c-4e16-b582-5f23dc60506a	Joinville	Brazil	f	t
396cf17b-b4a2-4023-a841-b954e4edbafa	Jiaxing	China	f	t
a4a73c84-9de9-4333-b1d9-cc1744f97a59	Guilin	China	f	t
0d87a987-9cb1-4409-b26e-9c1eea3ddb56	Dahuk	Iraq	f	t
b6b6baca-acc7-4638-b6b8-855e8fbad2c4	Volgograd	Russia	f	t
a23314c7-336e-482f-a028-49007995c97d	Guwahati	India	f	t
0291c5d8-4e6b-407f-a7a9-9a614e7229d7	Yichun	China	f	t
0fbfb4aa-a928-4fcf-86b6-2b551b970003	Yangquan	China	f	t
0bf5066f-0e7f-43d9-b34a-1794542412b8	Chandigarh	India	f	t
813685ef-d53d-4ae8-a8f9-6b9cc1c39b84	Gwalior	India	f	t
52c532a6-405d-4f3e-940f-8f1a300b984d	Hamamatsu	Japan	f	t
f1a0f971-4920-44c2-ad71-36da3294a2db	Qom	Iran	f	t
15d95859-0d60-4501-b1f0-3611d04d77ae	Mérida	Mexico	f	t
739d3563-79d6-4319-a2e1-ce370bd11749	Jixi	China	f	t
eb0cf191-70d6-4e8b-9b98-ca117ef4e101	Xinyi	China	f	t
ce755f75-5f78-4d3c-80ad-bd5058d58abd	Pingxiang	China	f	t
dd14ec08-c251-47d6-a716-f481654cac94	Querétaro	Mexico	f	t
68a7792e-abed-4ccf-bd6f-e3ff4fec367d	Kelang	Malaysia	f	t
2835f7ca-f364-444c-809f-a819385406fb	João Pessoa	Brazil	f	t
c8890435-2fb4-42b4-87b5-1174f2f68dae	Jinzhou	China	f	t
6a87f5b4-3679-43d8-97e2-da4c1e45830d	Oklahoma City	United States	f	t
266cf456-ad8c-49e0-90cb-112cedcdef3b	Salerno	Italy	f	t
fba50766-69f6-48ef-a72e-a9c03459de62	Thiruvananthapuram	India	f	t
b75d5dae-ec1f-4bce-9f9d-b1b729e7021b	Kozhikode	India	f	t
a6e1c1cf-37d8-4bfc-96d2-68c41974065a	Tiruchirappalli	India	f	t
53151129-3954-4404-bc52-d744ce6ce78a	Ogbomosho	Nigeria	f	t
5c117a9e-16d0-4136-b3fa-1f6db72f026b	General Santos	Philippines	f	t
8cc570bd-132f-407d-8f3a-bdb6ab645753	Hue	Vietnam	f	t
026ea3dc-83af-4f30-8f9b-add70beb4dd0	Bacolod	Philippines	f	t
7b552306-f24e-44e2-8e98-e65fe2390c63	Nantong	China	f	t
ef420bb6-b676-4795-9d6d-8b537d9ed602	Tegucigalpa	Honduras	f	t
682d0971-aafc-4d28-9a51-27521dea693c	Foshan	China	f	t
18ec154e-e2f8-4b3d-9083-492843613a96	Songnam	Korea, South	f	t
55004d41-325f-49c0-b67c-795a578a04cd	Bridgeport	United States	f	t
8411903f-c1a6-43a5-a7d9-3f2bece57070	Kingston	Jamaica	f	t
bda29fe0-c4cf-40da-b49d-ca9a3fad670c	Naypyidaw	Burma	f	t
1d58d3a4-117c-4147-a899-5fc556d01fb7	Nice	France	f	t
a5b6145b-2a9f-4994-b377-28f9d6b295be	Buffalo	United States	f	t
729ac5ff-c03a-4631-9391-d81c25124ea2	Irbil	Iraq	f	t
dbebf2db-79b0-477e-a142-9d59b978ae33	Krasnoyarsk	Russia	f	t
eae1e137-4de5-4594-bf90-15368444651f	Djibouti	Djibouti	f	t
e86f557b-6666-4a85-b9b4-2c7c6880fbeb	Olinda	Brazil	f	t
df2b07c1-9086-4d90-867a-efd30c64c88f	Managua	Nicaragua	f	t
b9152765-e0a2-4965-bc3e-15cde75eb1a5	Antwerpen	Belgium	f	t
e50587d1-465c-4431-a9e8-0355d245f7dd	Konya	Turkey	f	t
df75eb2a-4061-4272-8b21-d799d95f3cc1	Bogor	Indonesia	f	t
8767c6b6-c97b-4b9a-ab9f-206ac63fd0c2	Niamey	Niger	f	t
910d8964-c18c-489e-a1dd-4ff4d169365d	Hartford	United States	f	t
2bd0bb18-85b7-46b7-934c-57da3e3ddc06	Xinyu	China	f	t
f1cbb061-1284-4fdc-9439-d071515befd0	Huaibei	China	f	t
17033231-10a3-4f30-a4e4-e4c71d6feec3	Teresina	Brazil	f	t
9e118683-bf17-48cf-832d-3432205f761f	Naha	Japan	f	t
2c41aaae-591a-4a49-bb0b-2e7d880005f3	Goyang	Korea, South	f	t
bbc17498-f00e-4be3-bb65-62792f6c860b	Xinxiang	China	f	t
c3d7f072-163d-49f4-842a-58ee27ceedc4	Yibin	China	f	t
82214e6c-b820-4337-b62a-5176cbe29dd3	Aba	Nigeria	f	t
5ad0106f-c7ee-463f-87ee-b618632c4cb2	Maiduguri	Nigeria	f	t
1b7c6121-b471-45b1-91db-1b7af0e50bca	Tirana	Albania	f	t
5289acdb-bf33-4d00-beb8-4b9a699e683b	Kathmandu	Nepal	f	t
97c3f8d6-d7a2-4e64-a747-6c68ffd206f6	Az Zarqa	Jordan	f	t
9ec63d71-d2d9-401f-b9cc-f79142651c30	Tarsus	Turkey	f	t
a645f0a0-09ab-4f33-a05a-204cd81d55e2	Bengbu	China	f	t
1f018b65-9cd6-4537-b837-65a81dbcc308	Mendoza	Argentina	f	t
4e2dfcd2-1693-4908-9389-64b09a1daa5e	Hubli	India	f	t
f0a5745f-5340-4497-aebe-b64e4c6d6e3c	Concepción	Chile	f	t
79df1e78-92b7-4639-a8dd-087765b0242b	Zaria	Nigeria	f	t
1c3cd722-6450-4c87-84d6-2ea593da255c	Anyang	China	f	t
ffb703fe-db03-4cc9-a119-96facb45acfa	Cartagena	Colombia	f	t
c2008cc1-8580-49a9-8132-cd9a189851eb	Mysore	India	f	t
8644c2df-091a-4016-a699-59965da7b192	Mexicali	Mexico	f	t
369ca071-d111-4474-b103-86ae302ff93f	Ulaanbaatar	Mongolia	f	t
94234c9f-d09a-4c36-b6d0-f5e8985af2b3	Tongliao	China	f	t
3f1d14ba-021c-4ac3-84c7-5bb8c03af95a	Mombasa	Kenya	f	t
cc38f79b-7dab-42f5-bc65-571fc8660535	Newcastle	United Kingdom	f	t
b5a41242-5db9-4eaa-888f-f9eb70df8106	Novo Hamburgo	Brazil	f	t
71f7fc7a-d1dc-43ab-8571-d8ba5815be60	Callao	Peru	f	t
36c51e52-f341-4a85-8cc9-d21dee6715ce	Bilbao	Spain	f	t
c37fd75c-145b-4b20-b11e-a6121ae43918	Johor Bahru	Malaysia	f	t
c018ecbd-5d37-487f-9999-0cf5deecd403	Yichang	China	f	t
9ecf355d-acd1-4c4a-bbb1-ca57ec78bbb9	Raipur	India	f	t
cff80e71-a8d5-4733-97ce-9a3af289af51	Fort Worth	United States	f	t
8b84aac3-2e27-4276-bc43-b488c82a3581	Salem	India	f	t
bfdbc270-d4aa-4b49-a213-eec85df320c9	Yangjiang	China	f	t
f37b45cc-1a73-48ce-b950-8320a9c6b34b	Marrakesh	Morocco	f	t
2c97c412-6276-4442-8198-06cb7f486666	Kaifeng	China	f	t
3d20aa58-cdf8-4faa-b416-f7ad52b08d8d	Dandong	China	f	t
4aaeeaa7-38a6-43b1-8d58-12e5d187397e	Basra	Iraq	f	t
3fb63066-2239-4811-9a8e-5187df310103	Aguascalientes	Mexico	f	t
fa467389-ddab-4f78-ada5-455338500c6f	Tucson	United States	f	t
87736d36-1632-4357-b4d3-b62ad44efb91	Okayama	Japan	f	t
8c3fc38b-b07f-4dbe-8567-765223b6e728	Puch'on	Korea, South	f	t
d769fb64-5afd-48ea-a558-43aa7ec2e84f	Xuanzhou	China	f	t
564b7c13-2c3d-4fa4-befd-07fae7eeba7f	Rizhao	China	f	t
f15b264d-2d05-4ca1-8f9f-6894c1399e26	Bandar Lampung	Indonesia	f	t
255a2631-532f-48ce-b7c3-6c6f8cfb7198	Palermo	Italy	f	t
2c333fdc-9887-42c3-b1c5-1d75fd199f68	Cardiff	United Kingdom	f	t
31210c12-23ea-47f2-bc61-c6e487a7459c	Kigali	Rwanda	f	t
0621e432-e2df-477e-ad67-0e29e37eba81	Tampico	Mexico	f	t
a26fa822-0db4-49a8-84bb-d2adbd0fa433	Jiaozuo	China	f	t
95caef6c-b0fc-4ec8-9067-09db49ae944e	Padang	Indonesia	f	t
73a3c2a1-728f-4bdd-898d-4747e8975377	Jullundur	India	f	t
65e5e6dd-b4aa-410f-908b-fa480dff4f9b	Valparaíso	Chile	f	t
d8580d34-35c7-4f9b-af0a-bdab9ea2b1e8	Zhenjiang	China	f	t
b4158b86-b298-42c3-b931-0758c6e481a5	Zunyi	China	f	t
713a178c-11a6-4ea4-9ddb-3c6359975267	Anshun	China	f	t
1fca183b-fa27-43f3-b3c2-03500f00dfc2	Pingdingshan	China	f	t
6e9aa53d-455f-4f4f-bb1d-9c6a5df35cc3	Toulouse	France	f	t
6c0a3878-1c47-4c96-a633-40636bfae150	El Paso	United States	f	t
e91438c1-e4ca-408f-aaae-6dbfac727a2e	Nova Iguaçu	Brazil	f	t
43ed25f9-6bfb-40ef-b834-5a4c433f3a3c	Bhubaneshwar	India	f	t
fc4a07c3-3eff-45d0-a265-5fc5119c3a8d	Voronezh	Russia	f	t
4bce7883-715b-403f-a860-a144af8a0dac	Saratov	Russia	f	t
a44e2966-5557-4af9-b9b7-bb8e75dc74f2	Yuci	China	f	t
fe6bf3ce-31b3-427f-8f32-391edefcaf13	Yancheng	China	f	t
4b5802a8-6ce8-4f7a-b9a6-080cf320835d	Bishkek	Kyrgyzstan	f	t
9d30f957-8219-4ddc-be39-657a5ab55df4	Oslo	Norway	f	t
34c620de-5738-4d25-bd5f-60c24088cd5a	Cuernavaca	Mexico	f	t
22022140-9b82-4e4c-9f3c-1d0b8937f997	Linfen	China	f	t
e19799e0-14b7-4d42-a420-d233d5b64de6	Honolulu	United States	f	t
479815c5-01e8-4c38-a94a-d9b1db0c4336	Bangui	Central African Republic	f	t
c2d24ef9-ace0-4fee-9a10-e677d318054d	Warri	Nigeria	f	t
352b0bc9-7cac-467d-8fb8-eac9e4c08c9c	Tucumán	Argentina	f	t
717ee454-00fe-4895-98bf-aa8da6bad156	Basel	Switzerland	f	t
e8001fc8-91b3-4afc-8a26-be5cb0d216a6	Kermanshah	Iran	f	t
e503467f-0996-4871-849a-5ebafb272745	Thessaloniki	Greece	f	t
60d44606-aa6d-4fc1-918d-d8df0f75a9fa	Omaha	United States	f	t
d7f80983-b1ae-4d63-ac3d-be4070d7174f	Kota	India	f	t
237df165-95fe-4727-8bee-b1f8bdb1099a	Freetown	Sierra Leone	f	t
099405e9-7934-4826-a62e-27a953bf768c	Braga	Portugal	f	t
82b38f4f-8191-4cfe-a902-d754142bdf4e	Jhansi	India	f	t
12454cc4-5b82-44c2-8282-83410252bb58	Yueyang	China	f	t
a72111dd-113c-49af-8f26-cef59dc8bb0e	Nottingham	United Kingdom	f	t
22b0443d-562f-4ccb-889a-295f3345806f	Agadir	Morocco	f	t
87796add-adaa-43b2-ae9d-ab46e5600373	Butterworth	Malaysia	f	t
08fed689-d8f9-4654-b741-826e7c6c0bce	Bareilly	India	f	t
7a3f33e2-b9b5-49c5-83a1-de0d4ea04f3e	Jos	Nigeria	f	t
c247b2c6-cab8-4793-8d8f-3b5f70102eaa	Xingyi	China	f	t
fe11100f-1ec4-437e-8000-a8a137c5b15f	Arequipa	Peru	f	t
5874824e-89a1-43c3-8e93-f83c7103862d	Cebu	Philippines	f	t
7f47e69c-cd3b-4af1-ab80-8ad6022fa868	Liverpool	United Kingdom	f	t
5be856b0-f375-4fe5-9979-18bdbd1e7408	Rajshahi	Bangladesh	f	t
0b96bbc7-83ab-45f1-8754-603c54b65493	Langfang	China	f	t
0e9aa151-29a6-4fee-89aa-f01336533133	Wuhu	China	f	t
0380924d-e847-461d-afb5-3cfe2619d267	Zhaotang	China	f	t
10b9131c-f5d1-48bd-b8af-67f29f7a9ff8	Culiacán	Mexico	f	t
9fda2a5a-9e06-4350-8931-a111ba640a80	Valencia	Spain	f	t
3336c857-6576-4059-84e0-600efa42e4b7	Cuiabá	Brazil	f	t
a33c969f-6b57-415f-8972-d886164f7aac	Lingyuan	China	f	t
724a96ce-8f52-46f9-a403-cbae5a877e66	Qui Nhon	Vietnam	f	t
46ef1998-36d0-4ce8-aac0-31a4e0d79a8c	Malang	Indonesia	f	t
21077754-782a-4e8a-9dbf-a0bcd61673e3	Aligarh	India	f	t
f9144f2b-3af1-4134-901b-dbc41f23ea08	Lvov	Ukraine	f	t
fb9c3759-a481-4135-97e2-1d3f9efdfd73	Bordeaux	France	f	t
d7f86560-9da6-4a91-9437-361190432799	McAllen	United States	f	t
76882507-5a5a-4fa7-8e1b-3c98ff4b8c06	Baoji	China	f	t
fd95d863-ef2d-4487-a5fd-90af08e898ed	Pekanbaru	Indonesia	f	t
0b0120f0-7d80-4180-a1d3-69b1fa7176fc	Oran	Algeria	f	t
35b51191-56e3-4593-95cb-43eda47dca65	Yingkow	China	f	t
8cac6734-dc8d-4953-b528-1b5c733ef5e2	Bhiwandi	India	f	t
7e2f8f85-8c73-4cd3-965d-a35931194668	Liaoyang	China	f	t
c8816d23-cb02-4e3f-8010-33abbcef2ca5	Chihuahua	Mexico	f	t
3f7384c4-8371-4b67-84f5-c8bcef38880e	Jammu	India	f	t
aed3cd3b-48ba-45d9-ba5e-e66c60235826	Malacca	Malaysia	f	t
3127dbca-3a1b-45f4-a30d-2a94471f5f9d	Zaporizhzhya	Ukraine	f	t
06ace452-d5f0-46a0-a1b5-3192e2e2520b	Moradabad	India	f	t
516e93db-00ae-4bc9-8337-0e1f656c0833	Antalya	Turkey	f	t
0bcc7963-6067-4441-9422-393180deb102	Al Hudaydah	Yemen	f	t
92a9ec68-542e-4adf-b8bf-b454c8c0199e	Islamabad	Pakistan	f	t
a99fc2ab-d78a-4cac-ac24-1d1dccd4dcfd	Campo Grande	Brazil	f	t
6233e612-13ac-4280-9536-7a153c77f77d	Shaoxing	China	f	t
4e13b06f-497b-4259-bae6-9af57dc1f412	Mangalore	India	f	t
48c88c24-b491-4eec-a42c-96b73139a364	Wuppertal	Germany	f	t
cdfd419e-d9ac-4985-824f-51ddd4c565b1	Cheongju	Korea, South	f	t
043d02b0-d0ec-4d43-a9b3-b56c96eeab8d	Zamboanga	Philippines	f	t
c23da669-f364-4cfc-a5d4-1043a6210cd3	Hamhung	Korea, North	f	t
c660496e-8726-4ef0-8a2b-783df8b3a5b3	Ilorin	Nigeria	f	t
33f4207e-928d-4122-b684-887da82eb20c	Fuyang	China	f	t
671b24d1-2e98-454a-80f7-6bff1738897e	Saarbrücken	Germany	f	t
a7825cd8-f96e-4a84-a56e-91f48ee920e7	Shiyan	China	f	t
09a7267a-1ef9-4add-b948-cfd4528528b6	Fuxin	China	f	t
b5f73ec9-95b2-4070-88eb-be3f1bd6a097	Quetta	Pakistan	f	t
fcb7cfd8-dbc3-435b-9092-9574ed76ca29	Trujillo	Peru	f	t
be64a586-fc90-4520-86dc-36c3275398b8	Kananga	Congo (Kinshasa)	f	t
d620158a-ad65-46bf-a4aa-88c8f65ad408	Trabzon	Turkey	f	t
b494b594-5c94-4c2a-8c00-67d9ed1f5314	Cotonou	Benin	f	t
b70e19e8-5fad-4b68-9ab2-6df2d985032a	Jincheng	China	f	t
ec10517a-b12a-49b6-9634-82cfa5a5b1bc	Albuquerque	United States	f	t
d8431862-c40e-425a-bb49-caa9918f40e5	Łódź	Poland	f	t
c360f67f-442e-43e9-b9c8-e1b37fec97e1	Kraków	Poland	f	t
f508dbaf-99bd-4d9c-b447-48213d7c0bd8	Saltillo	Mexico	f	t
0e3de1c4-4fb0-498e-bd2f-0afa5a417265	Vientiane	Laos	f	t
7a88917e-c94b-4d31-88a9-9445d500d9cc	São José dos Campos	Brazil	f	t
0dbfdeca-5a3f-41aa-ba96-b83f779a494e	Hungnam	Korea, North	f	t
5acc121b-0860-4fbc-8913-d54326da8ff9	Taizz	Yemen	f	t
f4970283-6c85-4c52-b5e6-fb2788733f3c	Pietermaritzburg	South Africa	f	t
652e2ea8-27da-46a1-b115-9691d540fdb9	Tangier	Morocco	f	t
2137e1a7-1ffd-4bb5-bc6d-cc90b5c808b7	Namangan	Uzbekistan	f	t
baa0f475-0e57-49ae-b31b-53dd2c6ac5e5	Kolhapur	India	f	t
e3a74925-2cb1-47f9-87fe-c56e7031f44d	Hsinchu	Taiwan	f	t
ae088e00-257f-499f-a43b-556d156ff57a	Fargona	Uzbekistan	f	t
fd3c904e-5c47-459d-9eb8-167757bca13b	Changhua	Taiwan	f	t
e18e6c6b-8c1d-4d04-b07b-1b4bb290f9e0	Liège	Belgium	f	t
e6d76ff5-c888-4679-8ac3-caadc36a12f7	Ciudad Guayana	Venezuela	f	t
2f3e2561-415d-44d7-a243-25931680ed9c	Birmingham	United States	f	t
6cc1deab-2b41-49e0-a9db-86089f3d0746	Hegang	China	f	t
8ab5c370-a3a8-44ff-8c44-441d100cd515	Riga	Latvia	f	t
65a6e792-135e-425d-951c-b875789d4d82	Nouakchott	Mauritania	f	t
5b756aec-de88-478a-a313-a5a4dcb215d6	Naga	Philippines	f	t
b6b64306-f64d-4fb1-b528-0d255dd64a8b	Gdańsk	Poland	f	t
90178bb8-7a50-4a77-bbd0-6610d62453ab	Ansan	Korea, South	f	t
d118d983-7758-4f8e-a347-d25733baeacc	Nürnberg	Germany	f	t
3426e490-bc91-4db6-b306-d887d5815517	Oyo	Nigeria	f	t
1ac1f113-512e-42c7-bf80-2d18c7838210	Muscat	Oman	f	t
6d3fed92-8624-453f-affe-8f693786afae	Amravati	India	f	t
b9a19c5f-c3df-4dc7-bf96-1cd5a885adab	Denpasar	Indonesia	f	t
7cd0a878-382b-460d-9cbe-b395acaf9628	Sokoto	Nigeria	f	t
1f2d8c45-75d2-4885-9b5f-3087d58f7c2e	Beihai	China	f	t
2b64bdf9-0ca0-4b1b-8a78-2a77319dafe5	Ashgabat	Turkmenistan	f	t
4bdc73ef-fd58-4efe-b735-d131d505aaae	Bremen	Germany	f	t
4e8da65e-e316-4175-9078-79bf2203f4f5	As Sulaymaniyah	Iraq	f	t
7012b92d-c63c-4cfe-af92-537885ad7dd8	Zagreb	Croatia	f	t
066e1868-3e21-4c4a-b3b7-4989a2705093	Hannover	Germany	f	t
15010519-aa3d-4a7a-ac78-991f0ae59588	Cúcuta	Colombia	f	t
78f3ac44-53dc-4dc2-b920-b6da9f9c4aa2	Hamilton	Canada	f	t
7e6c27a4-66fb-46d2-be20-1b2791725575	Moshi	Tanzania	f	t
b3cb0c26-04df-417a-b6fc-cd6dbfb15380	Shaoguan	China	f	t
d00fec10-9234-42bf-80a4-7b279f6af4c3	Kumamoto	Japan	f	t
4fe23fc7-9ec8-4626-aa76-f99adbee283d	Dayton	United States	f	t
0886fc3a-d6bb-4c10-bbec-42c1abcb5cc4	Lianyungang	China	f	t
9aa7a95f-9b52-4e8d-abe5-b5bebbcfa2c9	Acapulco	Mexico	f	t
e715c041-ba1a-47b9-9afc-0ad37e800055	Kandahar	Afghanistan	f	t
f0bccd36-1578-4ac2-a551-330711646dba	Dehra Dun	India	f	t
ca65b0bf-ad18-49bd-b645-25359cdeb5bd	Rochester	United States	f	t
e5a31282-104c-4192-b358-4a140a50a6b6	Jeonju	Korea, South	f	t
5788c2bd-2fa5-4718-bf36-c689dd72dc59	Samarqand	Uzbekistan	f	t
efa277ca-1a3d-4ce3-841d-ce6689313544	Qingyuan	China	f	t
5d0d5414-5e83-4bb5-9443-bd8e71d8d46b	Sarasota	United States	f	t
2548cb86-a466-46bf-875a-9104053f32ef	Changzhi	China	f	t
86b3a98f-a3d2-4455-be6b-e5aa049a5886	Tolyatti	Russia	f	t
c5305f7a-a1f0-4d7e-bf5c-e82530883e91	Jaboatao	Brazil	f	t
35ad1dc1-41e5-4a7b-8cc6-70f2e0d5c758	Shizuoka	Japan	f	t
33be8fb9-351d-4850-bd26-6b869fd33548	Bulawayo	Zimbabwe	f	t
cae0d48d-c4d3-4ce1-adf7-d053984277c2	Soledad	Colombia	f	t
376b2c73-b994-46ef-888c-1aed3bde80ce	Fresno	United States	f	t
c060d8d1-e4f0-4adf-8d08-b277f529b3a4	Meknes	Morocco	f	t
cf86518e-a32f-4bc1-a755-5d85cb99a1c3	Sarajevo	Bosnia And Herzegovina	f	t
ec954ee4-4d98-4df6-b4f7-b96eb255ea4c	La Plata	Argentina	f	t
695774e9-8c9c-4720-98e4-b80e3c48cbf0	Malegaon	India	f	t
95c330ba-1cae-4c4d-b64d-6002bc585b6c	Enugu	Nigeria	f	t
ecec3bf0-a332-488a-b687-6f99ae18aba4	Chișinău	Moldova	f	t
e4615f15-9f09-4b9b-bde3-7ea84f84d21d	Huangshi	China	f	t
15073f3f-78b4-433e-abb3-260fd8c80ca9	Aracaju	Brazil	f	t
78933721-626a-4c27-9b98-dba5f1fa6d90	Allentown	United States	f	t
97970653-8d06-49d3-9fa2-4cd185a22d53	Bonn	Germany	f	t
ff020dde-e12f-4965-986c-8215ff507719	San Pedro Sula	Honduras	f	t
32d65790-c786-4e76-93e0-228c61559004	Nellore	India	f	t
8ffe765b-5c92-4c54-9bf5-8aaf577170b8	Catania	Italy	f	t
9551df76-0220-4b40-9731-bc6302cdc835	Gorakhpur	India	f	t
02ca0dcf-e616-4d79-817d-4203cd048814	Ipoh	Malaysia	f	t
4b9952b5-8f9f-4454-a006-66ec2ca2da63	Chongjin	Korea, North	f	t
845af5d9-ee00-4487-9524-ddd899fd2861	Tulsa	United States	f	t
6a5bde44-77ce-4540-aa32-0a1ff5768c55	Utsunomiya	Japan	f	t
b42f435a-e167-4e6e-ad93-d6235f0284fb	Puyang	China	f	t
b1e1405e-fd6a-4f3c-ab15-1b984cfaaf95	An Najaf	Iraq	f	t
8c0ecbb1-8e1e-4b92-af3d-0b1a6b20e40e	São José dos Pinhais	Brazil	f	t
434dfb18-c5fe-42d8-9a3c-c002128f4cf3	Santo André	Brazil	f	t
f74d1c69-68c0-4025-8590-f5bcc37cdfc0	Bytom	Poland	f	t
7d79c729-226b-4e80-821d-2b77acd61120	Pointe-Noire	Congo (Brazzaville)	f	t
f6cfa329-6c54-41c4-9bd5-dda8fb3c197c	At Taif	Saudi Arabia	f	t
4fa2e3fe-b8fd-4ea9-a405-e273be863a81	Ismaïlia	Egypt	f	t
ad53bcc1-6900-4767-833e-58d5046a0213	Concord	United States	f	t
ce7c031d-15e2-4c73-a2cb-87b6d60d5378	Shimoga	India	f	t
c9649fa4-29ac-4d58-adfd-478a93fc8b43	Biên Hòa	Vietnam	f	t
cc90936d-f7fd-4b82-bf9f-a9d1a94efbb6	Zhanyi	China	f	t
d4f901e2-d4e4-4c00-b379-2a1655e58dd3	Kryvyy Rih	Ukraine	f	t
c46d1df9-0c18-4afb-97f2-f9bb428c329a	Andijon	Uzbekistan	f	t
75e3cd37-b8ea-46e2-b0c0-a57885f6efc2	Tiruppur	India	f	t
49b1bf5d-0cda-4097-b15a-babd00eafd7f	Irbid	Jordan	f	t
1fa55ef4-0f21-4dc5-970a-b1d3c86641d4	Krasnodar	Russia	f	t
520c6702-ab37-4407-9e40-2dba6ff3599c	Zaragoza	Spain	f	t
823cd451-3580-4669-84e6-751c1fa702d4	Genoa	Italy	f	t
6159088b-2d58-4fd3-82f0-202036a3f30b	Lilongwe	Malawi	f	t
db69bb09-33dd-4cb2-93ed-f1a0b1744544	Diyarbakır	Turkey	f	t
cc808f5a-0fb6-45ef-8b57-06863db84fbc	Morelia	Mexico	f	t
42fc971c-6a99-49e7-b7a0-77d2731940b9	Ulyanovsk	Russia	f	t
fef460b1-f4f9-4d2c-b72e-d36b0d0e6a85	Utrecht	Netherlands	f	t
d2f0913f-0fbb-4812-a8b6-20b60f1ed37c	Kikwit	Congo (Kinshasa)	f	t
82f4d85a-52f6-4db4-9ba5-cf4d588ac053	Al Hufuf	Saudi Arabia	f	t
d9ba823b-8643-479e-b10a-345cd36ae2fc	Yogyakarta	Indonesia	f	t
3cc068f3-c564-4ed5-967b-20c4e34647de	Wrocław	Poland	f	t
6d426f48-5da5-42a4-ab7b-d889be27e0c9	Winnipeg	Canada	f	t
326474f1-088f-47d8-ad58-37fd1d0b0cd2	Izhevsk	Russia	f	t
a59280a1-7eea-41a4-8e8a-5d25e5302e15	Cape Coral	United States	f	t
fb1eef3d-17b7-4900-ae5a-a1d5b9468a23	Springfield	United States	f	t
23e7b236-941a-4011-8633-f8c0dbb16e2f	Zhuozhou	China	f	t
4f2ddc04-f601-44cf-a9c1-2cf0917e1438	Raurkela	India	f	t
d5de38a3-2055-4455-822d-0cc5f961e83d	Québec	Canada	f	t
87226550-d33f-4acf-b060-08454f072327	Poznań	Poland	f	t
7a173dff-a69f-4e9f-afea-e6c1188a6173	Colorado Springs	United States	f	t
6f6c92da-c425-4e4a-a0ff-5fd3100ac3cb	Bur Said	Egypt	f	t
bb3465fb-af25-409e-8d20-b5414cf1cfbb	Nanded	India	f	t
62bf6239-00e7-41ac-8181-9318cf9b637a	Bannu	Pakistan	f	t
430e6776-ebf4-4f67-af71-cb1f715cd719	Asmara	Eritrea	f	t
43a21199-1746-4c7b-b06e-3a791752178a	Southend-on-Sea	United Kingdom	f	t
582c2125-ed7a-44ff-b1ff-191b789f6eaf	Dresden	Germany	f	t
8089fb85-666e-4d4b-ba47-616728b73301	Wiesbaden	Germany	f	t
27923283-18a3-457a-9673-69f55fa88356	Charleston	United States	f	t
cf258465-537d-4cb0-b4f2-8c92eac5b766	Changping	China	f	t
c7023b27-10e2-488d-b733-a1c046587496	Palu	Indonesia	f	t
a4370ac9-48d7-4b72-8df8-eeddd622741d	Taizhou	China	f	t
84d3c14d-fc62-411a-b443-2a2ec4a9820e	Xiangtai	China	f	t
f6daf03e-900a-4569-b6db-371450508f5b	Samsun	Turkey	f	t
2c520b07-cfc1-4e76-8cab-adb54af2943d	Luxor	Egypt	f	t
1f3751d1-6405-4682-becb-9d973df099ff	Belgaum	India	f	t
31b2735d-bcf7-49e5-92c2-b4aa3703d181	Pontianak	Indonesia	f	t
b537974c-734a-4b98-968b-4d28a4e5e130	Yaroslavl	Russia	f	t
7d93a5e8-fb54-4795-a453-a166ffa6d685	Constantine	Algeria	f	t
fa0883b2-bfba-4571-9722-4a33e997dbbd	Bandjarmasin	Indonesia	f	t
3e84bc90-ff4a-4dd5-b154-56d7e1d99d1d	Abu Dhabi	United Arab Emirates	f	t
b47dbab5-85a0-4ec8-a3a9-3848fe0aca4a	Grand Rapids	United States	f	t
097360e3-61a9-4a40-97c1-9f2a96f95235	Kirkuk	Iraq	f	t
1ac7b217-234d-4d4b-a5be-f80782612650	Sangli	India	f	t
fb077225-7a09-4a1f-89b4-a50e666ffd18	Barcelona	Venezuela	f	t
f68080aa-1eac-4b70-84d9-46e089f5e172	Mission Viejo	United States	f	t
3d8627f5-32ad-4e71-beb3-24a419ca7ad5	Sohag	Egypt	f	t
da02053e-e187-470d-8155-34a0fd84b29f	Canoas	Brazil	f	t
1e70884d-e653-4c3c-8262-a92a58d1f5a4	El Mansura	Egypt	f	t
461288b0-9a28-4fda-a3bf-eacf2f7cb180	Barnaul	Russia	f	t
690504a6-31f8-4f54-a4ee-3bf427184a90	Zahedan	Iran	f	t
0287e0e6-3e1e-49b7-a0fd-97c63d996bbd	Jalalabad	Afghanistan	f	t
b3cd9766-96e5-4793-95fb-e333e7464020	Albany	United States	f	t
cd0276ee-5092-4502-8d52-2cb422c87a08	Chiclayo	Peru	f	t
40bd5ba0-1ad6-41ea-918f-2bcb77f868cd	Hermosillo	Mexico	f	t
f5050c17-d626-486f-b173-68ea67970412	Port Louis	Mauritius	f	t
2b279373-5785-4377-99ed-4e072ccd19aa	Chandrapur	India	f	t
d3997029-141f-47f7-bc97-6b31ec74265e	Al Hillah	Saudi Arabia	f	t
198192e1-5d0e-4806-9a7f-145789a0c341	Al Hillah	Iraq	f	t
cbf21b81-0396-445e-8c17-1d6fd9a5f4e2	Rasht	Iran	f	t
aab4722b-b5b3-4076-b073-50e597457206	Nagano	Japan	f	t
6ee88bf3-3e55-49c9-b65c-778c085ca3c9	Vinh	Vietnam	f	t
26ee1642-28a0-48ea-aa4d-dcb2dee8e031	Abeokuta	Nigeria	f	t
900dce96-fbc2-4269-aa50-3deeb5c8fc07	Kayseri	Turkey	f	t
e349c777-f735-4623-bd39-302182735928	Samarinda	Indonesia	f	t
5dc49c58-9102-404f-b756-49e60a665aef	Ajmer	India	f	t
b1bb7e12-28a9-4fd8-a535-65f6cde14c7f	Dortmund	Germany	f	t
cb5641a1-3b86-450d-82b6-a1dbfe0872b0	Vladivostok	Russia	f	t
e569afda-4cff-4c81-90ca-04f2e5fc7086	Irkutsk	Russia	f	t
1bcce999-b19f-4ff3-91e4-37996d4becc1	Knoxville	United States	f	t
b05bf7ae-34f8-4c04-a5b7-c858c82ecfb2	Blantyre	Malawi	f	t
33f10e1f-6f91-4e1f-8134-ca3de314a410	Baton Rouge	United States	f	t
8eebdbe8-7b02-4817-947a-8a4d67943332	Anqing	China	f	t
3da016a4-f8ac-428c-9ed0-a2e86df19965	Cuttack	India	f	t
26755a63-54f6-4339-affa-8fe8a2cd0f9d	Hachiōji	Japan	f	t
1803d7ec-063d-4b6d-822c-a685fe535329	Khabarovsk	Russia	f	t
343ca887-1000-4943-8edd-1bf732728b78	Veracruz	Mexico	f	t
1138974d-7fc6-429b-884c-223c304f496d	Kisangani	Congo (Kinshasa)	f	t
5135d034-5463-43d4-8cab-4a1918381676	Libreville	Gabon	f	t
49308a2a-a4a0-401f-8577-d1ca53bf2b76	Kerman	Iran	f	t
46f898b6-d883-4a90-a959-8cecffc4c25a	Urmia	Iran	f	t
4c82eab7-0439-4229-bde7-a44043b9608f	Bikaner	India	f	t
88ec2425-6e68-4482-9886-0b8124d0662e	Quetzaltenango	Guatemala	f	t
6034ec51-9b28-4fa5-853e-ed13728f8ae9	Bakersfield	United States	f	t
2bedbfba-d59a-4bbc-bc48-c38f1863985e	Ogden	United States	f	t
02f20d2f-1835-4f19-bd6a-42aadf0ba1ae	Shihezi	China	f	t
578a93c5-da32-49ce-9ac7-2e4bf968c272	Kuching	Malaysia	f	t
683d7641-47c3-41c6-914f-1ed26c5d57c1	Shuozhou	China	f	t
3ae86f15-480f-4b9d-8da4-a2ee7f5d9edc	Niigata	Japan	f	t
03ce6a4f-59d3-4329-9040-f83e32c44541	Pereira	Colombia	f	t
4ecd33cd-f4ed-4291-91c3-bf69958fdc83	Macau	Macau	f	t
5268fc44-f8f0-4dfc-9676-5f1977afa5e9	New Haven	United States	f	t
3c4d7982-2a5f-4344-9d84-d6288c1ec09a	Bouaké	Côte D’Ivoire	f	t
53cfb4ec-c73c-4128-9d95-33c2c2944bfe	Columbia	United States	f	t
3aed238c-26e1-45e8-9116-0f418b4d6ee1	Akron	United States	f	t
fefb1934-4313-4d86-a5f7-c6e5b06138e6	Binjai	Indonesia	f	t
6e567d78-c5e9-44f2-8787-a0d32657c2c0	Manama	Bahrain	f	t
fdd314b7-e4fd-44c5-9fc6-487d767e0a65	Uberlândia	Brazil	f	t
ff2020d5-b6c6-4095-91e5-b85eca7ea809	Sorocaba	Brazil	f	t
03ce768f-cb81-419e-b84b-17c8a6baf3c1	Tongling	China	f	t
90f92d47-1110-4831-ac36-d9b8f7b7506d	Weihai	China	f	t
2b528850-d2fd-4a9e-80ea-db4ce7e7e3ef	Mar del Plata	Argentina	f	t
76149256-3b71-4038-b263-843c839734dd	Santiago de Cuba	Cuba	f	t
3bc060a2-63b2-43f0-950d-004eabb6a546	Siping	China	f	t
0df05dec-91fa-4148-9d20-cd34f4c23253	Kagoshima	Japan	f	t
fa60f6e5-631b-4acd-99f3-d958f8cba388	Surakarta	Indonesia	f	t
f768cff7-df0d-400e-aaa3-3327b0d2e9ff	Makhachkala	Russia	f	t
eaf3c0de-3ce0-4dfe-9289-83e99d06d7bf	Bhavnagar	India	f	t
aceff6c7-2db7-4201-8a32-5716c07f0c18	Uyo	Nigeria	f	t
b0c54842-12ec-4aae-a0a0-993cb7f414f8	Bristol	United Kingdom	f	t
26fb3fe0-5096-42e6-a3df-f8a2055b75e5	Bahawalpur	Pakistan	f	t
e279be37-686e-40c4-a62a-a5c3ff6f3177	Kenitra	Morocco	f	t
b95ac81b-b17a-4d69-9c0d-b33c4ccd8a78	Ribeirão Preto	Brazil	f	t
371f170a-f823-4296-9cc6-26e72944eec0	Kanazawa	Japan	f	t
df6e8483-6606-4616-9bf6-2ebfe3da138d	Orenburg	Russia	f	t
5f3ea0ea-88c5-4407-8250-91eefce4e239	Málaga	Spain	f	t
3cad9646-9364-4ed0-8080-7e32510eebfc	Tabuk	Saudi Arabia	f	t
e79bfec5-db45-4505-ba91-a72451a2b8e2	Puerto la Cruz	Venezuela	f	t
e23daa95-9382-4503-88dd-958295b6a87b	Jiujiang	China	f	t
9e29f4f2-8f11-41cc-98da-3bfc8f3f11ab	Hisar	India	f	t
8f5ae731-8646-4ae7-8437-f1a3efc3612a	Kashgar	China	f	t
54d2657d-f936-4355-a426-7ab2856168d9	Matola	Mozambique	f	t
3532fda0-8bcd-4cca-9223-478964e092a6	Bilaspur	India	f	t
650c5582-1519-4c73-a08f-ab6010e3e422	Sargodha	Pakistan	f	t
8af241c5-b052-49ee-81da-9ac0acdaf071	Leipzig	Germany	f	t
adb5b049-1f7d-465c-8fa9-fa570fc8c726	Vilnius	Lithuania	f	t
fe63837a-d419-4399-83ce-0a237bfd5906	Tirunelveli	India	f	t
e42ecc4d-02a8-4cc1-b2d7-e2ddfdf5feac	Cancún	Mexico	f	t
5f7b0900-964a-4429-9866-201589fd03bc	Yangzhou	China	f	t
66ce6136-d45a-4b2b-8e8f-de36e9fb9b17	Novokuznetsk	Russia	f	t
dbd4fa0f-8e95-4538-bd4f-47ba3e188b2f	Al Ladhiqiyah	Syria	f	t
11bf2350-af64-4ad6-b909-c87810b727ae	Matamoros	Mexico	f	t
09369170-c170-4cf7-b26d-e603a88e6182	Göteborg	Sweden	f	t
2b7c9663-770c-42db-b12f-f27fbba39712	Ōtsu	Japan	f	t
9dcb565f-6002-45da-acac-c27b0efbb94f	Tomsk	Russia	f	t
ae352adc-f77d-47ea-bcae-89937ea5cfee	Linxia	China	f	t
1a3f3480-fbc0-499f-8459-fa6eb6ce8b71	Matsuyama	Japan	f	t
c0770f38-bd99-483c-8cf1-0dbb7df882fe	Rouen	France	f	t
98ae91fb-8c59-4f10-97a8-088c5557f41b	Jiangmen	China	f	t
d326855e-9e83-41f1-943b-3ea981eb9786	Oaxaca	Mexico	f	t
d01ba040-72fb-4143-a20d-a7a1acf6744b	Beira	Mozambique	f	t
9861b5db-c17b-499f-8b36-1bb2a515bbe0	Guntur	India	f	t
2e396b6f-e5af-4953-8e29-91cd9533e73f	Trablous	Lebanon	f	t
d62801d8-64d5-4f17-83bf-86190f750c4b	Hamadan	Iran	f	t
240f1013-84db-48e4-bb0b-86d57a13563e	Cangzhou	China	f	t
8edd997a-1579-4e1b-bcbe-3b87dbd8309d	Kota Kinabalu	Malaysia	f	t
3788118e-883b-42dd-9b28-0d04f1fb56be	Gold Coast	Australia	f	t
a77b9658-e182-44fa-b31e-2e054c1c8b19	Jian	China	f	t
58b221e1-7004-4fa5-a0d2-d038cbc4b1d5	Londrina	Brazil	f	t
1d3b7e81-77ad-4fbb-92a7-69a2e07ae91d	Ryazan	Russia	f	t
c4abb8e0-5891-4c97-a65d-fa28ed879140	Shashi	China	f	t
f08e9df5-e4e5-4a2e-abaf-4ee7d0ce4a24	Bello	Colombia	f	t
644a8b6f-db09-4b69-912e-9c8c4376ea0c	Tyumen	Russia	f	t
4015987e-8d69-4116-ba29-4f6cdc6a0770	Lipetsk	Russia	f	t
3d1e769a-27ae-45bf-b845-4711f8508583	Siliguri	India	f	t
069cd4d7-3f48-40ba-9fe7-c20cf367942e	Eskişehir	Turkey	f	t
097bc8e8-8f2b-4ba2-a404-cda9f61f1dc8	Banda Aceh	Indonesia	f	t
6ec974fb-3da0-4edf-973b-6c7c66d6a35a	Ujjain	India	f	t
ba5fbe1c-8cac-4dee-aed4-3ba737dcd6f4	Salta	Argentina	f	t
62d58e15-0e70-4cd3-a98d-e34035adc61c	Penza	Russia	f	t
2050e84d-8962-413d-b699-b2de2b5b08a7	Blida	Algeria	f	t
09ed15fc-71a9-4974-864c-acc267727d60	Mykolayiv	Ukraine	f	t
def9933d-cc83-4bbe-b21e-8b80b7cf379c	Karbala	Iraq	f	t
f9936269-7231-4c2e-b4d8-d8d7db0b4fc4	Suez	Egypt	f	t
d86fae5b-a44e-4e89-9723-f25bb536e401	Gliwice	Poland	f	t
a375440e-b175-4fa4-a533-568bf8e31af7	Bukittinggi	Indonesia	f	t
a1284d78-0621-4084-839b-59dfd502d34c	Liaoyuan	China	f	t
e3f52a2b-84be-4779-a4d4-4dc7a98fac83	Kota Baharu	Malaysia	f	t
0070537e-f9d9-4c48-aaf5-b0e9deef47c3	Jundiaí	Brazil	f	t
0157a106-4bd6-4aad-ae82-424bfce445a4	Edinburgh	United Kingdom	f	t
e35e4811-c80c-4779-a827-7252fab1b357	Tlaxcala	Mexico	f	t
b1980598-3387-4db3-920c-2d60822a5540	Provo	United States	f	t
bc7172cf-bd34-4f0f-ac0d-7248a43c555f	Arak	Iran	f	t
b56211d6-2290-4f07-8257-1321f74cbfcd	Davangere	India	f	t
f39a2d4c-c6ec-40f4-8daa-f2e99183c049	Viña del Mar	Chile	f	t
b45e8209-2466-48a0-ad81-774a1f716861	Pingtung	Taiwan	f	t
1bcf0129-f9e1-4e39-92b4-a9262157ccec	Annaba	Algeria	f	t
c4e2b090-b68b-440b-9d87-f70503030cd6	Akola	India	f	t
c5bfb953-5f2b-467f-a5f1-a5fd800e2fdb	Brighton	United Kingdom	f	t
15da633f-dfd5-4f6a-bb57-38b83ecbd420	Astrakhan	Russia	f	t
4999a418-926e-49b8-8b18-ead9acdd07e0	Bradford	United Kingdom	f	t
9650084e-5117-4903-bc95-72efead42bf0	Bari	Italy	f	t
26edcb71-c74e-4294-80b6-d2515f77307f	Tsu	Japan	f	t
c60774eb-2223-4ede-b24f-6490de6704da	Thái Nguyên	Vietnam	f	t
6805c551-064a-4b6e-88a5-046a4df059cb	Damanhûr	Egypt	f	t
ff7d0f68-c018-4572-a595-c553ba8d4967	El Minya	Egypt	f	t
60af0a1a-cab1-46b7-94f2-147ffec78aad	Shuangyashan	China	f	t
c29676a0-7ecf-47dd-a016-804687e55f1b	Pasuruan	Indonesia	f	t
07780ae5-4b24-4c81-96a5-93bd806c075f	Keelung	Taiwan	f	t
c5c72aa7-e4d4-4401-9146-770302512b59	Chiayi	Taiwan	f	t
721ac053-a91d-441a-870c-26b3ceb94c9e	Taoyuan	Taiwan	f	t
c979d00f-2ec5-4887-876c-dbcc611954a9	San Lorenzo	Paraguay	f	t
9a08fdaf-4e7a-41ee-bfe5-e70d67c39f36	Awka	Nigeria	f	t
cc56a82a-d077-45ef-b67c-2de916c36249	Mazatlán	Mexico	f	t
6762e722-f95d-4b05-91f1-367caa95cd24	Mataram	Indonesia	f	t
bbebb513-de78-4f1c-8b43-5227800dc2c9	Macapá	Brazil	f	t
35725975-c523-4f8a-963e-39f73cd908e1	Worcester	United States	f	t
16a0c5f7-7e0f-4bee-b972-dea98516c20c	Reynosa	Mexico	f	t
11f607bb-0570-4343-b2cf-e6c47e01ae79	Shahrisabz	Uzbekistan	f	t
4d0bdbe2-0fea-4232-ba78-4176a437f9a3	Mesa	United States	f	t
9e0f7751-a9fc-4cf2-81e1-589775f3f47e	Douma	Syria	f	t
95aab8f9-fc86-4d4a-868c-7c6ce13a6fc7	Skopje	Macedonia	f	t
cc982e13-44f0-4a82-b989-f3eef03b9676	Mwanza	Tanzania	f	t
3ca3872e-2f41-4c86-b5fc-e94409552bf6	Wuwei	China	f	t
0055b3f8-6ef4-4142-830d-5de9df7dd3cc	Palm Bay	United States	f	t
48de372d-89fa-4078-a3d5-42a302d6f785	Port Sudan	Sudan	f	t
6cc9fe42-d85d-43bf-af1b-4e6f148d7a50	Santa Fe	Argentina	f	t
3093e0f3-5bbf-4a67-aeec-f62197421f06	Tula	Russia	f	t
c73bd33e-4c21-4307-a42f-edf2077a7020	Beni Suef	Egypt	f	t
ed6cd484-47c9-400e-9582-8cf763371d16	Yanji	China	f	t
0e5a4478-ec63-47d9-b3a4-fec36945057e	Toledo	United States	f	t
3d555d7f-ad61-4706-a137-691a3b805801	Bologna	Italy	f	t
9df35e22-b077-499c-aaef-58db84b43d98	Saharanpur	India	f	t
b51329ff-2d3c-4ac0-8d28-4a245f082f7e	Murrieta	United States	f	t
cb87fb28-ea0e-4617-93c5-67785229f85b	Gulbarga	India	f	t
fb322977-4496-47e4-bf78-d8f3641369a6	Bhatpara	India	f	t
27963b5b-4b25-4091-9faa-deace5897ba8	Wichita	United States	f	t
8b9c231d-3449-4dfe-89b1-b9dc91dece9e	Ife	Nigeria	f	t
b3067062-ddeb-4fbd-8fba-a4908ac87887	Feira de Santana	Brazil	f	t
9c71bd68-2dda-4974-9fa5-a3bb42396430	Shah Alam	Malaysia	f	t
3d97dc40-a926-4007-a4da-67ef1e55ab4e	Mariupol	Ukraine	f	t
3087bec5-126b-45dc-81d6-147f9ed5289d	Des Moines	United States	f	t
966cb875-bece-4557-96bc-9d5e8c1ce3a5	Tuxtla Gutiérrez	Mexico	f	t
e267748f-5a09-4f34-8e97-11466aeb6569	Herat	Afghanistan	f	t
f2ab1206-c477-4842-8601-52daebc8e933	Homyel	Belarus	f	t
cbf75fca-86fd-4833-bebc-9647caa8cd4f	Zhaoqing	China	f	t
e70b1aa5-f2e3-4824-b32a-b7af16bea40d	Americana	Brazil	f	t
2c2e5e52-7618-46d3-bc89-0ee90363a18e	Dhule	India	f	t
dad252ee-f893-4cd2-9d29-ba1c61a06079	Ostrava	Czechia	f	t
e3ac908c-2c38-49e3-8453-771d7a6ada79	Yazd	Iran	f	t
da480625-573f-47ba-a22b-5ec50b6e2a8d	Sialkote	Pakistan	f	t
5677c28d-1082-463c-bb1d-e987e55ad247	Kemerovo	Russia	f	t
cd1debc0-315f-4677-8829-67fb13e2ac17	Nazret	Ethiopia	f	t
1dd5fc09-b960-4abf-a767-c24eaa257db5	Staten Island	United States	f	t
b496a93a-2603-49ca-be5f-2f6f5a8ab5a8	Jiaojing	China	f	t
32539ff8-ccfe-4513-bbbc-ec67cfa51f73	Chaoyang	China	f	t
4c8d8cf1-6e98-4be4-b966-d2985fc11fd1	Juiz de Fora	Brazil	f	t
56778fb3-2a92-4f57-9a47-52fab05bc51d	Udaipur	India	f	t
e781cd1e-fbf0-4a31-bcd0-b13f871cdd9a	Long Beach	United States	f	t
f7e9fcf9-4863-43e8-9ac1-68e14edb5b79	Greenville	United States	f	t
19582eb5-d12c-4070-81cc-ca139ec82fa2	İzmit	Turkey	f	t
efeeb94f-ffba-4da9-8e0d-2c928c9ec078	Piraeus	Greece	f	t
c3f45d43-5e20-4017-b596-fe7d190716e6	Shymkent	Kazakhstan	f	t
42479ed5-cade-4879-818c-343abf89f304	Iligan	Philippines	f	t
2bbb59b1-9716-44ae-88a0-589b37fe945f	Qazvin	Iran	f	t
54e8c40c-96ed-4372-889c-4bf5716aa312	Bloemfontein	South Africa	f	t
75e52568-7f80-4aa9-b9cb-7abe823dd3ca	Calabar	Nigeria	f	t
780a822b-9fab-41ce-a3c6-39163bb46cdf	Malatya	Turkey	f	t
909a0690-2c21-4c41-9494-54d0b24145aa	Panzhihua	China	f	t
eafdd762-ced4-4d19-92e3-cbcd1d27c336	Bandar-e-Abbas	Iran	f	t
1d0a1900-3769-40dd-bc4f-b15d305aea45	Naberezhnyye Chelny	Russia	f	t
e34e181a-dd9e-4dbf-b314-0b7511061e9f	Hamah	Syria	f	t
9f722b9b-fbdf-4c84-abd9-2a7d107db662	Cranbourne	Australia	f	t
0ba65a3c-7318-447e-bb59-c640530985cd	Iquitos	Peru	f	t
5b5ac072-5f64-4de7-aa9a-335117bfe015	Mazar-e Sharif	Afghanistan	f	t
5ef921f0-cd2d-450e-b7d6-08d64bc10834	Leicester	United Kingdom	f	t
6b1f3eb9-9b3f-474c-b3e5-338b0a28ad06	Kirov	Russia	f	t
e1d4a5d2-32e9-42fb-8e7d-7bf671d28c5c	Jingdezhen	China	f	t
a388129c-e2a5-4e0f-8399-2d1fd7d7084d	Durango	Mexico	f	t
87085431-546d-40c4-a71a-38fb7fd19295	Jambi	Indonesia	f	t
3737643c-7085-4ce3-a41d-d0277690924a	Volta Redonda	Brazil	f	t
d034c592-7829-4720-a20e-1c2d8c3fa11e	Hengshui	China	f	t
e1d806aa-f0f9-4e4c-9cac-36a65e91426b	Sfax	Tunisia	f	t
adccbaea-e93e-4f35-94fe-f8c5c55b7f74	Sunderland	United Kingdom	f	t
ed1777cf-91d5-4bca-91b8-44b1ce9df287	Xalapa	Mexico	f	t
da4ab809-750b-4f64-ad39-61b555edbcc6	Luhansk	Ukraine	f	t
c20fa669-9a6f-4f2c-8338-8a559d69b004	Manado	Indonesia	f	t
14e7bbda-429d-4a9e-b687-b330d8999f81	Qaraghandy	Kazakhstan	f	t
d87dc0ec-c24f-483e-aeba-647c8261fdaa	An Nasiriyah	Iraq	f	t
beba79b3-f0de-48e3-9e14-54755a84e912	Oshawa	Canada	f	t
8ed11608-4c26-4ef5-8293-34f6897b9371	Qitaihe	China	f	t
9058d028-db51-4532-b5d9-10ad17fc8faf	Belfast	United Kingdom	f	t
2b77aef9-4bd3-4551-b530-484124c972bb	Şanlıurfa	Turkey	f	t
9bc510a6-b3ed-4180-a03b-10eb84300fe3	Chengde	China	f	t
f767c6d9-ba91-48ae-962f-a6be55b34124	Xuchang	China	f	t
4dbf2436-7edb-4a43-a426-e7e74726f3c1	Chlef	Algeria	f	t
5c58455d-0a98-4975-937b-619f0f66d6a7	Ōita	Japan	f	t
a45d03d0-c84d-45a3-b41c-2c1ed5cc65a9	Baguio City	Philippines	f	t
033474f8-6a11-437b-90ef-e3b437236372	San Juan	Argentina	f	t
041503ee-c0aa-4e4d-a46c-af3366f99923	Cheboksary	Russia	f	t
995c1268-47a4-44f8-ba69-aa308bbb1d8e	Ado Ekiti	Nigeria	f	t
ae581c81-3e20-4680-8f77-d3b8078f8f3f	Balikpapan	Indonesia	f	t
f398b90b-f32b-4a65-b4fa-0b214eabd77a	Bellary	India	f	t
9b54b607-1701-4ce8-87d5-eb465e56f424	Bamenda	Cameroon	f	t
66894aa0-76c5-49c7-a135-7c5cffc2548a	Gent	Belgium	f	t
dc813ac0-f1bc-4922-ace7-531f1aeed0d9	Tokushima	Japan	f	t
78ccfc5c-0f75-479d-a0e7-31b2f779ccf6	Little Rock	United States	f	t
afd02fb5-6d0b-4e4e-9047-8418ccf01311	Wuzhou	China	f	t
6efb401c-5719-4440-bb83-4b02a5bbcdc3	Portsmouth	United Kingdom	f	t
dc5270a1-5691-4d2c-8fbf-b2a9356c0697	Harrisburg	United States	f	t
62315ca9-73ee-4e3f-8639-abb193bbaf5b	Cabimas	Venezuela	f	t
02d95e9e-dbaf-4737-91f7-2f693f53a944	Foz do Iguaçu	Brazil	f	t
15fd0a60-a0e1-45ec-8fca-a874eccf5cc6	Denton	United States	f	t
bf42a5b3-ff1d-4239-89c6-e73af81c5256	Wakayama	Japan	f	t
d6324fef-436d-4286-99ba-6888b193339d	Strasbourg	France	f	t
865804a5-a5fb-43ed-9abe-28e4746bbbb0	Madison	United States	f	t
8f3994a4-0ba8-4994-85db-d014da05a9a5	Mawlamyine	Burma	f	t
0daadaec-2c99-44f6-aa67-c8dc4e3856a4	San Cristóbal	Venezuela	f	t
c97ea522-8047-4830-867f-c8571170c364	Nantes	France	f	t
e263a55d-350d-4c6e-9adf-7f6b98aa52cd	Khujand	Tajikistan	f	t
46fd8aa6-930c-4933-ac32-47aed1e76734	Guangyuan	China	f	t
f4122018-8762-4ce2-a602-0e8953b5808b	Khomeini Shahr	Iran	f	t
f0507ba5-7db2-4b97-9447-bb1914bdce8d	Garoua	Cameroon	f	t
abf2ea86-9da2-4928-9d90-9e717b923122	Bukavu	Congo (Kinshasa)	f	t
f14e2852-2be7-4774-bf87-1d11b113c04c	Tuticorin	India	f	t
22e464da-7fdf-4116-98cc-8e1507b3b36b	Nagasaki	Japan	f	t
15f1a7d9-11a4-47f4-8c3f-357b2248f43a	Pohang	Korea, South	f	t
6268a852-a962-4ce7-b001-89fd3a2471f6	Kaliningrad	Russia	f	t
efac0d65-48e1-4043-8f47-765a3c5469ea	Likasi	Congo (Kinshasa)	f	t
db509058-806c-4a16-ab47-748c0282e5dc	Reno	United States	f	t
d21f1a73-8dcc-4ea5-a2a4-2ea0faa45d6b	Spanish Town	Jamaica	f	t
4fd7a002-6a18-49ee-b15b-e27db47d24bf	Port Saint Lucie	United States	f	t
3bb612ec-7952-48ea-9911-b0a3ffdf5308	San Luis	Argentina	f	t
82796b2b-5deb-4984-98a8-7da360eb52dd	Katsina	Nigeria	f	t
dd934fe4-76e9-4488-9b78-4b11d5342f0f	Welkom	South Africa	f	t
e882dca5-9ce8-462e-a091-015010201a6e	Santa Marta	Colombia	f	t
85d784d5-8500-4785-bb10-85fe4b07a03a	Villahermosa	Mexico	f	t
0ca56b15-97e6-441f-b025-db085e927f09	Bryansk	Russia	f	t
47f445c6-2370-4429-a469-23633bb5df2f	Bournemouth	United Kingdom	f	t
c0617a44-7999-4283-9ae8-7b695d6094bb	Bengkulu	Indonesia	f	t
8e4c76da-8d48-491d-8189-27d9c8d3d08b	Heidelberg	Germany	f	t
543faf31-b9bc-4a6d-a4b5-83f9dd7ed594	Oakland	United States	f	t
aaad4bd8-2fee-4aae-9f56-ac2cb80b96a4	Kurnool	India	f	t
bbc9730d-c8e3-4de4-91cf-fc868358758b	Chaozhou	China	f	t
432acc82-9ec0-4720-a9d3-087c98cf9468	Batangas	Philippines	f	t
94dcab02-a1b5-4474-b05e-1c5d47eb2ab9	Bratislava	Slovakia	f	t
f9ff37c2-24e9-494a-89f3-dcc3b94c515c	Gaya	India	f	t
b844b514-52e4-4a54-a92a-4c0ccaf2ddce	Ibagué	Colombia	f	t
ed2ffd86-93f7-410f-a54e-aa1ccb8e2930	Ivanovo	Russia	f	t
6883ac29-9b7e-4d3f-b4b6-e33f463290ab	Erzurum	Turkey	f	t
dc6055ce-3f8d-4c67-aabd-92ec2467a845	Akure	Nigeria	f	t
9cbfccd4-639b-4170-9ed8-6918bef5371b	Asyut	Egypt	f	t
76935e21-2cf7-45d4-9354-16053062a780	Kolwezi	Congo (Kinshasa)	f	t
ca72f017-345f-41d9-8ec9-2d89dee8c12c	Sukkur	Pakistan	f	t
a7b79ff3-0789-44e5-a196-acad9ab06c95	Luohe	China	f	t
5c2e6978-582a-4184-8207-6aca1eb70135	Campina Grande	Brazil	f	t
3e620363-b210-4e71-93bb-2103d5e868bf	Kitchener	Canada	f	t
cd789ca1-5ce4-4ca9-b0c2-b50838209ff1	Winston-Salem	United States	f	t
39a70ccb-378c-43fe-b380-82cc1f13aa7f	Middlesbrough	United Kingdom	f	t
dd2d5d3a-6960-4beb-918a-f559fd3dc612	Meizhou	China	f	t
0b48b978-1015-4906-9d3e-97b3bec52a00	Ardabil	Iran	f	t
ef16ef49-583c-47e4-9138-9adb24a0b4b6	Magnitogorsk	Russia	f	t
929f6c46-7f50-4ff0-b0a4-e1ccdeab8044	Gifu	Japan	f	t
a7881304-15f0-498f-9a01-ba29bc239adb	Huancayo	Peru	f	t
d854ef90-cd30-4af5-ac9a-fe0d88788052	Nha Trang	Vietnam	f	t
ebd96e2b-1ff2-490d-884a-ccbc5e27ff70	Maturín	Venezuela	f	t
76e934d1-bc38-47e5-a2e4-632dea8bc7b1	Xuanhua	China	f	t
f3f63f47-ddaa-4c95-8255-d70c4bb276e0	Kursk	Russia	f	t
0ba0bc27-0347-4792-a4ed-0a883fd56a77	Oujda	Morocco	f	t
e68efdf6-87bf-4dec-b378-e2de3d6baa17	Metz	France	f	t
609dd665-066b-4046-97da-93038e41702b	Al Ayn	United Arab Emirates	f	t
dbafcac7-66b9-4391-80ff-165978135a3e	Jeju	Korea, South	f	t
1b06ceaa-47be-41d4-acdd-ab995cb965c2	Oshogbo	Nigeria	f	t
3754ff09-f036-4828-b4da-5460e09222bb	Indio	United States	f	t
2118c434-1812-490a-aab7-0c714f2dddfb	Ipatinga	Brazil	f	t
c9c1f404-269d-4c14-9a57-388524773005	Szczecin	Poland	f	t
6fb5be2d-ea2d-44cf-b7e9-465742ef7fc6	Durham	United States	f	t
d10891f7-27e1-4012-8e6b-bf8be41110b2	Syracuse	United States	f	t
59e0a542-9175-4027-a8dc-da9c1a4a415d	Chattanooga	United States	f	t
fb9a0947-34f5-4a5b-a049-debd9c53d48a	Murcia	Spain	f	t
71bb25a4-c45f-41d0-9be5-993c93be1d03	Kitwe	Zambia	f	t
f9fe3a13-564a-4c5a-8d24-94683b0193bb	Tanta	Egypt	f	t
34af96be-6a2b-41e8-8f07-6ab8613b27e8	Lancaster	United States	f	t
ce962bdf-f05f-4da9-af9d-262844820965	Zanzibar	Tanzania	f	t
600a1bdb-dbfe-409d-957b-915e3fad6f7e	Taubaté	Brazil	f	t
9ee09f92-8da2-456b-b9bd-b82b1d89baaa	Yining	China	f	t
3823cd93-e3d7-42ae-9fcb-046906f36987	Bissau	Guinea-Bissau	f	t
d6c71daf-3e17-4069-9b14-873bb15e4e4d	Pasay City	Philippines	f	t
af98bf4b-506d-4bb9-bbf7-0be5e3bc19d0	Spokane	United States	f	t
13372624-9582-4f89-8689-764d37ad9418	Mbale	Uganda	f	t
8a982223-8167-4511-b428-e59bc0188935	Palm Coast	United States	f	t
c69ca370-afa5-4f47-956d-d9df383aa47d	Kassala	Sudan	f	t
b3766dd2-eeb3-42f9-8618-dd60fcbaa529	Sunchon	Korea, North	f	t
d0fbdd9d-e896-458f-9b3d-643375eab62e	Tver	Russia	f	t
b0f4bfe5-bd0b-4e8b-802d-9b1d24b76df3	Surgut	Russia	f	t
4dc5fcfb-cfeb-441a-ad1d-12c767341e4b	Jingmen	China	f	t
634a16b6-8eff-4303-8462-55a477c42c73	Sikar	India	f	t
f9f877f7-825e-4bb4-b7a0-c1858e60e481	Tumkur	India	f	t
9a269fa7-de0b-49b0-a7b8-7997f920f14b	Gómez Palacio	Mexico	f	t
1e51006e-f90f-4dec-a9dd-ddfa377eefe0	Buraydah	Saudi Arabia	f	t
de1c210b-30b4-43a8-bcae-778b79d88cf8	Khmelnytskyy	Ukraine	f	t
bb7e4c78-cc5d-472c-8daf-63a195e0402f	Eindhoven	Netherlands	f	t
d6d339ba-a390-4974-8997-0d2cae563e7c	Chiang Mai	Thailand	f	t
b882dfef-b300-4ac9-bd34-805aa3518aa5	Piura	Peru	f	t
5a100818-329e-4a17-b60e-f93e8013e7fd	Horlivka	Ukraine	f	t
59a5eaac-59e6-450f-ba12-fab6b04fd182	Arlington	United States	f	t
4f351eac-02d3-451f-8202-b9148fd6121b	Ndola	Zambia	f	t
e53a3320-c07a-49ba-b94d-805c82d4d601	Yuxi	China	f	t
e2e076d7-9264-4b5f-a28d-1c29f473198b	Bonita Springs	United States	f	t
19c98d44-e4b1-4499-8ece-dcffef53c318	Poughkeepsie	United States	f	t
b9e342b0-2088-4823-9479-ef5b57781676	Kisumu	Kenya	f	t
ccd9eed3-22ad-4948-828e-6e3c47cd7dfd	Stockton	United States	f	t
b6bb2e5f-db75-498e-8b36-a769018368e7	Kollam	India	f	t
e8f117ee-88ab-4c4d-afb1-ab6435913b66	Tallinn	Estonia	f	t
b56366d7-9d35-44e7-8c90-f728bb4af9c0	Wellington	New Zealand	f	t
472f89d8-40d6-4461-89a2-10a9226d4000	El Obeid	Sudan	f	t
db3f760b-28fb-48a5-820a-2b6fa6df186f	Niyala	Sudan	f	t
73086d9a-bb95-4d50-b2e1-bd4bada9582a	Sandakan	Malaysia	f	t
1fc8f1b2-796f-4743-b2fe-b9df2812a2cd	Ahmednagar	India	f	t
e403c965-3724-4dbc-b848-94bdd42885dd	Osh	Kyrgyzstan	f	t
12e0492e-1e22-43cc-910c-f4375c518706	Stoke	United Kingdom	f	t
83cdc7f7-2bb9-4c29-a680-acc1850449b5	Bhilwara	India	f	t
8a3f4668-fd4c-43d6-9ef7-d39ed466648e	Oxnard	United States	f	t
d07b1c6e-7365-40b2-87d4-ec04541a45b6	Comilla	Bangladesh	f	t
b17e5c29-003e-454b-a8d9-881576e2c1be	Augusta	United States	f	t
499f7b6a-a086-4789-94d5-5940e85044f8	Scranton	United States	f	t
5f227054-232f-4309-bea8-f1c64b5446ec	Samut Prakan	Thailand	f	t
a24f3ab1-21e0-4faa-a156-76f4c8d54fbb	Grenoble	France	f	t
63d29b4b-d66f-4a5e-87cf-e388729f30c8	Cappadocia	Turkey	f	t
c53740fd-9ff4-4249-a4a1-2dd6a30d064b	Izmir	Turkey	f	t
e02b8e8b-aec6-4c79-9736-25705d59bd0c	Bodrum	Turkey	f	t
15b0187c-dec6-4da3-a50d-0237bf0e2ab0	Fethiye	Turkey	f	t
e1090efa-ea6c-4d24-bf8c-116b1e9686f8	Marmaris	Turkey	f	t
a04d1edb-5aa2-453e-9ed1-ec83717797f9	Pamukkale	Turkey	f	t
91da131a-bbd1-4100-a6e0-a02bac3335eb	Kusadasi	Turkey	f	t
501d563c-55fc-418d-88b8-d70b06664b55	Alanya	Turkey	f	t
9d56aab5-16fb-4735-b893-ff2ba7b65e52	Side	Turkey	f	t
e3b798b8-edeb-4938-a45a-cd8d105e2cb5	Cesme	Turkey	f	t
e4a0bb8d-e24d-44df-add3-9a8ec8c58689	Didim	Turkey	f	t
afa74ca1-f4ac-4793-a1a9-3d9374323365	Kas	Turkey	f	t
85348dfe-1240-4141-9bf9-002e1af7f27a	Kalkan	Turkey	f	t
d0c93bca-e7c2-45a6-9992-aba87a608dee	Safranbolu	Turkey	f	t
3f2b26e0-1819-4c33-83ee-6b70c9fd62e6	Van	Turkey	f	t
08da31c0-871f-45e1-bcb1-6e22c9b08fd2	Mardin	Turkey	f	t
672e0a2a-63a1-4515-b175-b61755055303	Sanliurfa	Turkey	f	t
a0b03ea2-1aef-4925-8844-df1490fccb1d	Edirne	Turkey	f	t
24ab612f-82f2-4ec2-9a34-6afe1cda4aa2	Canakkale	Turkey	f	t
757d70a8-154c-40a8-a376-fd554efbf3d3	Amasya	Turkey	f	t
8201cfe9-ee45-49cb-bdb1-5b101595cb94	Rize	Turkey	f	t
3cb070e4-69f8-41c9-b14d-32b847861fb6	Eskisehir	Turkey	f	t
6c333235-2a13-42ad-abf5-a3f9538666c4	Giza	Egypt	f	t
34573eef-55be-457c-acb5-aea194c0e3af	Aswan	Egypt	f	t
a9327165-5520-44ba-9bca-caa54a7f99fe	Sharm El Sheikh	Egypt	f	t
6734d8a5-b299-4aac-bdd7-c4d68b8e1466	Hurghada	Egypt	f	t
ae60934c-a95f-42fd-9ed0-1e4b5e923d64	Marsa Alam	Egypt	f	t
cf87c65a-773b-4dd8-ac11-24d94184840c	Dahab	Egypt	f	t
d21ee363-cc87-42d3-81be-03dc91e5de80	Siwa Oasis	Egypt	f	t
fb47f90c-e70b-419b-9e45-fb479b7703ea	El Gouna	Egypt	f	t
6b935e8f-ab3b-44f8-8f32-88306047bd17	Port Said	Egypt	f	t
9d261db4-1196-4e6d-b25b-7482d56170de	Taba	Egypt	f	t
91aacce5-88d4-473c-8421-c99d8d9393bf	Nuweiba	Egypt	f	t
45448140-e38a-4e6b-9cf6-878f349f9ea0	Abydos	Egypt	f	t
e5074849-fc4b-4bbd-9fab-1e0af03885f0	Edfu	Egypt	f	t
33a78fa5-c256-4f74-950b-e596c45753b7	Kom Ombo	Egypt	f	t
3fcd6cb9-c543-42f8-bf29-1dbf1d99a42e	Ismailia	Egypt	f	t
a342421f-99aa-4877-bf63-fae99e83248a	Minya	Egypt	f	t
3095b9ab-35ef-4fc3-a4e9-2bd36b61c9a4	Petra	Jordan	f	t
76e8fada-6724-41d0-bf58-387b059f0ac6	Wadi Rum	Jordan	f	t
a0d90334-aedc-4260-a5fd-f38d8d003f39	Aqaba	Jordan	f	t
4ff2abf3-cb42-4f9e-bd64-6adf5a31d840	Jerash	Jordan	f	t
11b6c7b2-43d9-4a53-a695-080dee08ed08	Madaba	Jordan	f	t
ed27c49f-e2df-465a-b343-2b960d4cbd99	Dead Sea	Jordan	f	t
0129feeb-7450-4f92-91a4-b0fdca60231e	Ajloun	Jordan	f	t
a8dd4988-43a2-4ba8-9e55-e0caa486ef89	Karak	Jordan	f	t
96e308ab-f4f4-4dbf-9e81-630392747c7f	Salt	Jordan	f	t
a3a02a64-6efc-4a85-962c-ef01a12da2e4	Umm Qais	Jordan	f	t
1668f37f-f7be-41ab-8a6e-9e5caefdd8d8	Ma'in	Jordan	f	t
24aa8573-16d0-4ca6-aef0-4effac8a0330	Dana	Jordan	f	t
dc172206-3409-42a5-a50b-2e8b64222d1f	Azraq	Jordan	f	t
3b8ad277-55b2-4131-b4e7-1dd9c75b1a00	Marrakech	Morocco	f	t
e834bc05-be26-4c5e-a36b-5b94933a213d	Fes	Morocco	f	t
eb2ccad8-09cd-496e-a154-931766064f2c	Chefchaouen	Morocco	f	t
3d9ef998-c165-4fa7-b54d-869561637fb4	Essaouira	Morocco	f	t
1c9dbc95-fd63-463f-b07a-61e9d947b159	Ouarzazate	Morocco	f	t
96115535-4423-4119-889d-4fbd084ea24d	Merzouga	Morocco	f	t
0475722f-89bf-4f90-a4e7-d9b1d191f902	Tetouan	Morocco	f	t
57533ed6-52b4-45f3-bcdf-cde852a0168c	El Jadida	Morocco	f	t
25d83765-71c7-4289-9435-5ac2a7a5f492	Ifrane	Morocco	f	t
19ce7743-9465-4e59-8c40-9e88deab227e	Taroudant	Morocco	f	t
84ff3731-325d-46e4-9d2b-89b9135768aa	Dakhla	Morocco	f	t
99809fdd-8b51-48e0-a6a4-a4a6eef128f3	Asilah	Morocco	f	t
5cbc7134-9b64-43f4-b7f2-8178e7c98720	Tafraoute	Morocco	f	t
c65888a1-43d9-4393-98af-47cc539759d6	Saint Petersburg	Russia	f	t
725b9e8b-9b66-4fa3-9c9c-74637cc30e26	Sochi	Russia	f	t
0d709ca3-5000-495d-b064-f0dd38e42eec	Murmansk	Russia	f	t
881cb956-84ae-4da2-9470-a3b3d3d93503	Rostov-on-Don	Russia	f	t
9443e240-c715-4473-9b7d-44824b1d569f	Suzdal	Russia	f	t
7663e9fe-4f2f-4919-8544-69830bda9afe	Vladimir	Russia	f	t
5d13b88d-6fca-40b3-918b-1ea152051dd0	Yakutsk	Russia	f	t
582c15c8-3f53-46f3-a84c-67b61b176ba8	Venice	Italy	f	t
6c52ee6b-54f5-456b-bdb9-15cf181306b7	Antwerp	Belgium	f	t
badc0621-0c64-4e70-974a-f40bb719addc	Salzburg	Austria	f	t
e06b59df-c56e-4737-b57e-30f0bf33a058	Innsbruck	Austria	f	t
c71af616-ae66-4a32-a821-9417d47e3fb8	Zurich	Switzerland	f	t
67d6843a-439e-4112-9eca-ef371858fe82	Lucerne	Switzerland	f	t
ba1f40ac-1ac2-4218-aa6e-6f9ea8a3bbac	Interlaken	Switzerland	f	t
9bee070d-4409-431e-9b05-f0d1c1421888	Prague	Czech Republic	f	t
6e6427de-c83c-464a-9f9a-1b52e96e0f8b	Krakow	Poland	f	t
8438207b-74da-4b97-b591-9dcda1a4214e	Gdansk	Poland	f	t
1d08ba78-8f99-4601-b06d-1b0ee6455fdf	Dubrovnik	Croatia	f	t
5f8b4632-917b-4763-a1e1-5dde5e6c6343	Split	Croatia	f	t
d042d7cc-484c-4e29-aa3b-db2d9be299bf	Brasov	Romania	f	t
5cf0c9a9-4093-4ea3-9409-b2d6e1212860	Ljubljana	Slovenia	f	t
f975d224-5080-485f-bd86-fadda2427567	Santorini	Greece	f	t
0376825e-238c-4ee0-a8d8-28486fcf3e95	Mykonos	Greece	f	t
038299a4-84cf-437a-91de-73356674a891	Copenhagen	Denmark	f	t
8309b7e4-0d9f-4621-9249-70fd50438b8d	Reykjavik	Iceland	f	t
4a077306-917f-471b-aa94-488240930330	Galway	Ireland	f	t
f1ac7422-3fbf-4002-8087-c745ffdd3e25	Luxembourg	Luxembourg	f	t
9d5ea3b8-a764-4960-b347-b8642e04095a	Monaco	Monaco	f	t
ef2c5e0e-d1ee-4c93-8376-0a594932a6c2	Andorra la Vella	Andorra	f	t
f9698744-bbbc-4a65-bbe4-0cc10a6e30f6	San Marino	San Marino	f	t
f320d591-be52-413c-94f6-782338078ea6	Valletta	Malta	f	t
11e3a491-f8ed-4ddc-9fab-f08ab3483a09	Sarajevo	Bosnia and Herzegovina	f	t
045f2840-55a1-4591-aee3-ec7845522a08	Skopje	North Macedonia	f	t
82065f66-96cc-4cdb-8a60-5f2db5bba12e	Podgorica	Montenegro	f	t
\.


--
-- Data for Name: countries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.countries (id, code, name, region, currency, timezone, is_active) FROM stdin;
c5dc5102-e1c6-4ef8-b4d3-bb88226d5bf8	TST	Test Country CgXQ	Test Region	USD	UTC	t
92aa205e-3b32-4445-aeab-f96460479d80	APIJX	API Test Country Xhf	\N	\N	\N	t
767edc6e-ec42-42bf-b53a-1fcc4b663c1e	AF	Afghanistan	Asia - Southern Asia	AFN	Asia/Kabul	t
afcbc918-b7b0-4101-b6d0-6762204dc2f5	AL	Albania	Europe - Southern Europe	ALL	Europe/Tirane	t
36ca1c23-7bb6-42d7-b52c-ae9806898aa2	DZ	Algeria	Africa - Northern Africa	DZD	Africa/Algiers	t
d1b900cb-026e-46cf-a1dc-496a81ffef06	AS	American Samoa	Oceania - Polynesia	USD	Pacific/Pago_Pago	t
75fbd52b-05b9-4457-ad33-03abf01c8dcc	AD	Andorra		EUR	Europe/Andorra	t
33ebc6f1-30e3-493b-bd30-0755be124426	AO	Angola	Africa - Middle Africa	AOA	Africa/Luanda	t
5a7e78e4-6118-454a-9be7-0c8961384179	AI	Anguilla	Americas - Caribbean	XCD	America/Anguilla	t
a12230a7-5faa-4c54-970a-49f04d073af1	AQ	Antarctica			Antarctica/McMurdo; Antarctica/Casey; Antarctica/Davis; Antarctica/DumontDUrville; Antarctica/Mawson; Antarctica/Palmer; � (+4 more)	t
3b525ea3-5def-41e3-8673-5a198e615b74	AG	Antigua and Barbuda	Americas - Caribbean	XCD	America/Antigua	t
1b504880-f775-47a4-b2ea-917d23fbbb14	AR	Argentina	Americas - South America	ARS	America/Argentina/Buenos_Aires; America/Argentina/Cordoba; America/Argentina/Salta; America/Argentina/Jujuy; America/Argentina/Tucuman; America/Argentina/Catamarca; � (+6 more)	t
025d91e8-0b68-4e14-82ff-abf068ff0ec5	AM	Armenia	Asia - Western Asia	AMD	Asia/Yerevan	t
4ba39814-0799-497f-a2ae-27947dfe3202	AW	Aruba	Americas - Caribbean	AWG	America/Aruba	t
d4384279-c054-424a-b759-70ba9bed72e4	AU	Australia	Oceania - Australia and New Zealand	AUD	Australia/Lord_Howe; Antarctica/Macquarie; Australia/Hobart; Australia/Melbourne; Australia/Sydney; Australia/Broken_Hill; � (+6 more)	t
ca8562ac-6998-4376-9e63-cdbcad8cb50f	AT	Austria	Europe - Western Europe	EUR	Europe/Vienna	t
573d71a1-afe6-4415-9237-28a618e1097a	AZ	Azerbaijan	Asia - Western Asia	AZN	Asia/Baku	t
71fafdf3-2284-4603-a3f0-a361247ab947	BS	Bahamas	Americas - Caribbean	BSD	America/Nassau	t
431d6ed8-511d-423b-a5f2-4b86ec90d003	BH	Bahrain	Asia - Western Asia	BHD	Asia/Bahrain	t
a9619233-237b-4aff-bd16-a79b8d18ba00	BD	Bangladesh	Asia - Southern Asia	BDT	Asia/Dhaka	t
7a8a619d-2652-4e4c-94e5-37eb25dcc731	BB	Barbados	Americas - Caribbean	BBD	America/Barbados	t
64ae5fe6-6db6-4345-858c-f963ded8ce48	BY	Belarus	Europe - Eastern Europe	BYN	Europe/Minsk	t
d71610d4-f7f3-4ddc-b79c-4117073de515	BE	Belgium	Europe - Western Europe	EUR	Europe/Brussels	t
802dbd2b-a11c-4439-b7a8-6a4afe2fc72a	BZ	Belize	Americas - Central America	BZD	America/Belize	t
2ee6a156-8e32-4149-89f3-db11cda3e548	BJ	Benin	Africa - Western Africa	XOF	Africa/Porto-Novo	t
23d19a10-553c-4bd9-aea9-f330f9777c03	BM	Bermuda	Americas - Northern America	BMD	Atlantic/Bermuda	t
95cff533-01c9-428c-bb2d-766dfbe2430c	BT	Bhutan	Asia - Southern Asia	INR	Asia/Thimphu	t
6c5d096c-b595-425f-a2c6-69b3e31f6fca	BO	Bolivia, Plurinational State of	Americas - South America	BOB	America/La_Paz	t
c3c38b92-7209-45f7-a803-a75d83b48482	BQ	Bonaire, Sint Eustatius and Saba		USD	America/Kralendijk	t
568e473e-4231-4ea3-b7d6-aee21cbb320f	BA	Bosnia and Herzegovina	Europe - Southern Europe	BAM	Europe/Sarajevo	t
d78fc094-2165-439c-b8b8-669fe059ebc7	BW	Botswana	Africa - Southern Africa	BWP	Africa/Gaborone	t
1fc1d851-2a23-4bb1-ba59-556ea6dbd56b	BV	Bouvet Island		NOK		t
d34e7c3e-f4d7-43d2-8d39-ab9d9a13320a	BR	Brazil	Americas - South America	BRL	America/Noronha; America/Belem; America/Fortaleza; America/Recife; America/Araguaina; America/Maceio; � (+10 more)	t
e466fc17-2fa6-4fc2-bacf-bf28f161e53e	IO	British Indian Ocean Territory	Africa - Eastern Africa	USD	Indian/Chagos	t
720d2edc-6776-4571-8df7-eb57f36db103	BN	Brunei Darussalam	Asia - South-Eastern Asia	BND	Asia/Brunei	t
28da1b5e-935a-4eb9-82c5-beb1a16bd48e	BG	Bulgaria	Europe - Eastern Europe	BGN	Europe/Sofia	t
f624f96c-42d0-4e91-aadb-5f3da30345f8	BF	Burkina Faso	Africa - Western Africa	XOF	Africa/Ouagadougou	t
ee4173e6-0de7-4782-83be-a7fe71e1978e	BI	Burundi	Africa - Eastern Africa	BIF	Africa/Bujumbura	t
70e618a2-a57d-48b7-81df-659aafa21eda	CV	Cabo Verde	Africa - Western Africa	CVE	Atlantic/Cape_Verde	t
f5d14551-246b-4e0d-a73f-41d6c6e0ffae	KH	Cambodia	Asia - South-Eastern Asia	KHR	Asia/Phnom_Penh	t
828f575d-1fed-4130-8e80-8dbfb4ed0cd1	CM	Cameroon	Africa - Middle Africa	XAF	Africa/Douala	t
893bc6cb-7a05-4087-9f1b-548de9111f21	CA	Canada	Americas - Northern America	CAD	America/St_Johns; America/Halifax; America/Glace_Bay; America/Moncton; America/Goose_Bay; America/Blanc-Sablon; � (+17 more)	t
e4dbd6e5-a35e-4ea3-8d8a-e3cb65b156d6	KY	Cayman Islands	Americas - Caribbean	KYD	America/Cayman	t
3967fe2c-6bc1-4e7d-bf66-1a9f98aa4fe5	CF	Central African Republic	Africa - Middle Africa	XAF	Africa/Bangui	t
93d8b33f-4417-40a2-9bb9-adeaefe40369	TD	Chad	Africa - Middle Africa	XAF	Africa/Ndjamena	t
96dd9458-3db1-4160-babd-d900a096f35e	CL	Chile	Americas - South America	CLP	America/Santiago; America/Coyhaique; America/Punta_Arenas; Pacific/Easter	t
57f32bff-8d93-4204-a635-c13cfa906543	CN	China	Asia - Eastern Asia	CNY	Asia/Shanghai; Asia/Urumqi	t
585d6d8e-6230-45d2-ba85-6c781681df1d	CX	Christmas Island	Oceania - Australia and New Zealand	AUD	Indian/Christmas	t
e4b952e8-22a3-4b4a-af2e-0848fec11e11	CC	Cocos (Keeling) Islands	Oceania - Australia and New Zealand	AUD	Indian/Cocos	t
e006b5cd-0399-4722-9532-cf63d7d4e94f	CO	Colombia	Americas - South America	COP	America/Bogota	t
393fae48-348f-4be0-9b00-b9b9839359a3	KM	Comoros	Africa - Eastern Africa	KMF	Indian/Comoro	t
3f7c49b5-3b57-4dfc-9973-0f8ed767b55e	CG	Congo	Africa - Middle Africa	XAF	Africa/Brazzaville	t
771afe4c-d5cc-4b14-94f3-6747170aa0c7	CD	Congo, The Democratic Republic of the	Africa - Middle Africa	CDF	Africa/Kinshasa; Africa/Lubumbashi	t
a4612d89-e5a0-4462-b1a7-5975ba70f1af	CK	Cook Islands	Oceania - Polynesia	NZD	Pacific/Rarotonga	t
f32642fd-055c-4d3f-9da5-dd56fb22dfa2	CR	Costa Rica	Americas - Central America	CRC	America/Costa_Rica	t
e4f4e295-f79f-45c5-9002-85d7bc130c69	HR	Croatia	Europe - Southern Europe	EUR	Europe/Zagreb	t
d6d23115-9c73-4b55-8066-2850fe868bdf	CU	Cuba	Americas - Caribbean	CUP	America/Havana	t
171fd3ad-5d94-4159-8530-70595bfe581b	CW	Cura�ao		XCG	America/Curacao	t
8692b411-c06d-4707-9f54-ee9aaa63cd44	CY	Cyprus	Europe - Southern Europe	EUR	Asia/Nicosia; Asia/Famagusta	t
b134254f-d960-413a-b67a-79984cf8b3f3	CZ	Czechia	Europe - Eastern Europe	CZK	Europe/Prague	t
f9bd9760-fc1f-4a1a-8358-c1aecc138d89	CI	C�te d'Ivoire	Africa - Western Africa	XOF	Africa/Abidjan	t
dee92013-46bb-4244-9901-b3caf436e7b1	DK	Denmark	Europe - Northern Europe	DKK	Europe/Copenhagen	t
9978d64a-cff9-4f3f-b414-cfd17eb5882e	DJ	Djibouti	Africa - Eastern Africa	DJF	Africa/Djibouti	t
fecc4a07-1763-45b0-971c-3291cad89d99	DM	Dominica	Americas - Caribbean	XCD	America/Dominica	t
0fcb032b-1965-455b-91c0-6aa73c9a4996	DO	Dominican Republic	Americas - Caribbean	DOP	America/Santo_Domingo	t
087f7c7f-e023-4ef5-ab3a-a3e66c953fcc	EC	Ecuador	Americas - South America	USD	America/Guayaquil; Pacific/Galapagos	t
b7ac6516-2177-48d5-9cbc-38791dfe6c87	EG	Egypt	Africa - Northern Africa	EGP	Africa/Cairo	t
24f991c2-42aa-43c8-a7a9-9f59432c745d	SV	El Salvador	Americas - Central America	USD	America/El_Salvador	t
9fe72442-25cc-48b3-ae89-83f0310fe569	GQ	Equatorial Guinea	Africa - Middle Africa	XAF	Africa/Malabo	t
30dafed9-2e4e-4a11-9ffa-131138c44b3f	ER	Eritrea	Africa - Eastern Africa	ERN	Africa/Asmara	t
0a19e064-331b-4af2-8d6c-a5cf7f903818	EE	Estonia	Europe - Northern Europe	EUR	Europe/Tallinn	t
aa03a1a7-5c49-408a-832f-86f8c8c64c9a	SZ	Eswatini	Africa - Southern Africa	SZL	Africa/Mbabane	t
0c92eb8c-8f49-4d5b-ba3c-98dd0d5ccacf	ET	Ethiopia	Africa - Eastern Africa	ETB	Africa/Addis_Ababa	t
56655f37-a208-4c59-8aa5-dff2a9eefd27	FK	Falkland Islands (Malvinas)		FKP	Atlantic/Stanley	t
15b22b76-47bd-4b26-9a35-1d5b54648fbd	FO	Faroe Islands	Europe - Northern Europe	DKK	Atlantic/Faroe	t
7b954d1b-8a74-4006-b807-94006901bba9	FJ	Fiji	Oceania - Melanesia	FJD	Pacific/Fiji	t
3b48e989-7c7d-4309-a123-c072fdbf7d2b	FI	Finland	Europe - Northern Europe	EUR	Europe/Helsinki	t
72899001-ae6b-48f9-bd47-64f840d76c02	FR	France	Europe - Western Europe	EUR	Europe/Paris	t
44cf950c-89b6-4efb-84ac-f42e1d4b5d99	GF	French Guiana	Americas - South America	EUR	America/Cayenne	t
2c75dc88-b215-49f4-bdd0-24254e22b6ad	PF	French Polynesia	Oceania - Polynesia	XPF	Pacific/Tahiti; Pacific/Marquesas; Pacific/Gambier	t
9118dd6d-7f2f-4022-948b-8ba73b518fe5	TF	French Southern Territories		EUR	Indian/Kerguelen	t
7933b6ad-6259-481f-ae71-89e883e98621	GA	Gabon	Africa - Middle Africa	XAF	Africa/Libreville	t
9b9addb3-e79f-4b27-8e11-708b08e54253	GM	Gambia	Africa - Western Africa	GMD	Africa/Banjul	t
bbee17e4-6fe0-4da4-ab86-a838424b2936	GE	Georgia	Asia - Western Asia	GEL	Asia/Tbilisi	t
48c15e3d-71af-4006-842f-81e144a9eb7a	DE	Germany	Europe - Western Europe	EUR	Europe/Berlin; Europe/Busingen	t
1eb417fd-76ac-4f12-925f-410b6338aa1f	GH	Ghana	Africa - Western Africa	GHS	Africa/Accra	t
46d8ee02-5837-43a5-885d-8a9f1672894b	GI	Gibraltar	Europe - Southern Europe	GIP	Europe/Gibraltar	t
d7eaf0a0-03ae-4ca1-97f6-d73fa2c8bb10	GR	Greece	Europe - Southern Europe	EUR	Europe/Athens	t
35a86e69-bd22-4700-9e4f-a43076da2bab	GL	Greenland	Americas - Northern America	DKK	America/Nuuk; America/Danmarkshavn; America/Scoresbysund; America/Thule	t
3888627c-7886-4905-b942-3c0d604f1892	GD	Grenada	Americas - Caribbean	XCD	America/Grenada	t
1eb78947-4419-4cce-8621-cb15e3fe0e4d	GP	Guadeloupe	Americas - Caribbean	EUR	America/Guadeloupe	t
3bc33031-05a6-4e80-aa81-daf8c0ac64df	GU	Guam	Oceania - Micronesia	USD	Pacific/Guam	t
413301cb-5a17-434c-ab9a-7ade9256d60e	GT	Guatemala	Americas - Central America	GTQ	America/Guatemala	t
b4f10a11-b9d1-479a-b4ef-e5269bedbf44	GG	Guernsey	Europe - Northern Europe	GBP	Europe/Guernsey	t
33f690ab-d10e-4ca6-8c8f-6bb8b3a9c7d6	GN	Guinea	Africa - Western Africa	GNF	Africa/Conakry	t
22a214f1-b3e9-47b2-9b53-1071d9778d21	GW	Guinea-Bissau	Africa - Western Africa	XOF	Africa/Bissau	t
13e7771c-4df8-4ee2-944a-c749957ffc36	GY	Guyana	Americas - South America	GYD	America/Guyana	t
30c37261-4425-4b2e-a9d7-4530a98ed79d	HT	Haiti	Americas - Caribbean	HTG	America/Port-au-Prince	t
9f79407b-ddd5-4515-ad44-d4a6fdcdd9c9	HM	Heard Island and McDonald Islands		AUD		t
08ff3215-3bad-44e5-bbfc-891de2e39094	VA	Holy See (Vatican City State)		EUR	Europe/Vatican	t
27d5650d-1531-4bb9-b5d9-28a351cbac55	HN	Honduras	Americas - Central America	HNL	America/Tegucigalpa	t
562f46d9-1fae-44cb-9027-7af7c50747e4	HK	Hong Kong	Asia - Eastern Asia	HKD	Asia/Hong_Kong	t
c21b094b-6b17-4c38-baad-143eec5e790d	HU	Hungary	Europe - Eastern Europe	HUF	Europe/Budapest	t
c01821c8-6ef0-4d68-a898-28b40d330633	IS	Iceland	Europe - Northern Europe	ISK	Atlantic/Reykjavik	t
2074a2de-8e99-4a17-9223-4cddcbd69cb8	IN	India	Asia - Southern Asia	INR	Asia/Kolkata	t
3c4359ce-a83e-4d3e-969b-69732af2fed2	ID	Indonesia	Asia - South-Eastern Asia	IDR	Asia/Jakarta; Asia/Pontianak; Asia/Makassar; Asia/Jayapura	t
b5c919e4-213e-48d7-8b22-dd93d535d832	IR	Iran, Islamic Republic of	Asia - Southern Asia	IRR	Asia/Tehran	t
440d0dbe-52dd-46d6-8386-44f4566c7a2d	IQ	Iraq	Asia - Western Asia	IQD	Asia/Baghdad	t
1104ba91-9043-426e-9b6b-91d16af3b84a	IE	Ireland	Europe - Northern Europe	EUR	Europe/Dublin	t
8ac9e674-21cc-49af-97cc-45c146b554ec	IM	Isle of Man	Europe - Northern Europe	GBP	Europe/Isle_of_Man	t
6b327f7c-6c2e-4f87-8eee-3687b54e655e	IL	Israel	Asia - Western Asia	ILS	Asia/Jerusalem	t
dddcd44a-bf3b-412d-a5bb-fdeef672b130	IT	Italy	Europe - Southern Europe	EUR	Europe/Rome	t
870c371d-9221-47d8-9845-27cb62b2a88c	JM	Jamaica	Americas - Caribbean	JMD	America/Jamaica	t
40ead5f6-a3e1-4bc7-8429-1da3749c2c53	JP	Japan	Asia - Eastern Asia	JPY	Asia/Tokyo	t
3c23adb1-fce1-4d6f-b044-c54121ddcbfc	JE	Jersey	Europe - Northern Europe	GBP	Europe/Jersey	t
41091967-29f1-4079-bff6-7c76c765b8fc	JO	Jordan	Asia - Western Asia	JOD	Asia/Amman	t
957b478c-1c62-4ee3-901c-322c093007b2	KZ	Kazakhstan	Asia - Central Asia	KZT	Asia/Almaty; Asia/Qyzylorda; Asia/Qostanay; Asia/Aqtobe; Asia/Aqtau; Asia/Atyrau; � (+1 more)	t
c8ca9dd8-a654-4438-8640-ef768b6795eb	KE	Kenya	Africa - Eastern Africa	KES	Africa/Nairobi	t
d40b0156-1421-49ae-9077-39e50cae121b	KI	Kiribati	Oceania - Micronesia	AUD	Pacific/Tarawa; Pacific/Kanton; Pacific/Kiritimati	t
d38a9065-6bc9-49b8-a56e-5ad721c723be	KP	Korea, Democratic People's Republic of	Asia - Eastern Asia	KPW	Asia/Pyongyang	t
baf819a3-64b8-4908-95cb-dadb2a523e1f	KR	Korea, Republic of	Asia - Eastern Asia	KRW	Asia/Seoul	t
75b47c7a-ca62-4148-8681-c75ca748c922	KW	Kuwait	Asia - Western Asia	KWD	Asia/Kuwait	t
021fbda4-7d8a-42d7-a3a1-f02265500cc1	KG	Kyrgyzstan	Asia - Central Asia	KGS	Asia/Bishkek	t
6340056b-1613-49a6-a253-40a7b8e192a4	LA	Lao People's Democratic Republic	Asia - South-Eastern Asia	LAK	Asia/Vientiane	t
2e2806f4-cb1f-4d79-b260-c3abec1d9729	LV	Latvia	Europe - Northern Europe	EUR	Europe/Riga	t
19841f9a-9cd5-4434-ae26-61e5ff99dfd0	LB	Lebanon	Asia - Western Asia	LBP	Asia/Beirut	t
9a394a98-a9f7-40ae-a6fb-b98d9729d6ad	LS	Lesotho	Africa - Southern Africa	ZAR	Africa/Maseru	t
ca7f6f17-fd37-4918-b7bb-fcfa7bbab96e	LR	Liberia	Africa - Western Africa	LRD	Africa/Monrovia	t
1f9af878-6444-4b2e-8e40-e0d6744a5128	LY	Libya	Africa - Northern Africa	LYD	Africa/Tripoli	t
d3503739-d7ba-473e-8a1a-507fdc3b7093	LI	Liechtenstein	Europe - Western Europe	CHF	Europe/Vaduz	t
b514d331-9fac-4731-a39b-f4df4ff83fe1	LT	Lithuania	Europe - Northern Europe	EUR	Europe/Vilnius	t
e486e5b0-d3da-4312-aeed-669ccde6fa82	LU	Luxembourg	Europe - Western Europe	EUR	Europe/Luxembourg	t
2322119a-1c66-490d-9f84-1b5d643fdd29	MO	Macao		MOP	Asia/Macau	t
c3daeb47-8c6b-4588-b6b4-9586aec08fc8	MG	Madagascar	Africa - Eastern Africa	MGA	Indian/Antananarivo	t
803083e8-3e98-45e5-97c4-f0fc250bbeb7	MW	Malawi	Africa - Eastern Africa	MWK	Africa/Blantyre	t
ba870b92-3ddb-4dd0-b62f-2531efb46931	MY	Malaysia	Asia - South-Eastern Asia	MYR	Asia/Kuala_Lumpur; Asia/Kuching	t
612e4e09-a25c-452b-a0b6-9bcd2314dd8f	MV	Maldives	Asia - Southern Asia	MVR	Indian/Maldives	t
0982d108-895b-4e30-8ef0-bf3638671643	ML	Mali	Africa - Western Africa	XOF	Africa/Bamako	t
99f4f4e7-64d1-4fab-9035-ebe278c0b5e1	MT	Malta	Europe - Southern Europe	EUR	Europe/Malta	t
5490f715-1851-4dfd-942b-d758ae7b4c7d	MH	Marshall Islands	Oceania - Micronesia	USD	Pacific/Majuro; Pacific/Kwajalein	t
edb88f15-c16f-44ea-8ee8-1cc934daaad1	MQ	Martinique	Americas - Caribbean	EUR	America/Martinique	t
1d866598-5859-4c8b-925f-476a1b6d1aaa	MR	Mauritania	Africa - Western Africa	MRU	Africa/Nouakchott	t
bb8f3681-f515-48bc-809f-4283988ca11f	MU	Mauritius	Africa - Eastern Africa	MUR	Indian/Mauritius	t
489d229a-99b8-4d1a-a0b2-4867d686d67c	YT	Mayotte	Africa - Eastern Africa	EUR	Indian/Mayotte	t
452b571b-1d46-4738-b928-df7d67a05241	MX	Mexico	Americas - Central America	MXN	America/Mexico_City; America/Cancun; America/Merida; America/Monterrey; America/Matamoros; America/Chihuahua; � (+6 more)	t
3fc5af92-8a7e-46e2-bb54-4381ce000d14	FM	Micronesia, Federated States of	Oceania - Micronesia	USD	Pacific/Chuuk; Pacific/Pohnpei; Pacific/Kosrae	t
48b387e6-e9de-48ed-8e42-65746c1829e4	MD	Moldova, Republic of	Europe - Eastern Europe	MDL	Europe/Chisinau	t
09183f6b-1716-4711-bd17-c696d8c773a7	MC	Monaco	Europe - Western Europe	EUR	Europe/Monaco	t
181e7673-9d95-4a03-83eb-7538f873150f	MN	Mongolia	Asia - Eastern Asia	MNT	Asia/Ulaanbaatar; Asia/Hovd	t
bed85391-381c-4b37-af7e-5891c2dc0be6	ME	Montenegro		EUR	Europe/Podgorica	t
3f3d2502-c165-4c8c-bfdf-d6ded9aee5e5	MS	Montserrat	Americas - Caribbean	XCD	America/Montserrat	t
511f4b9d-4e29-40e4-b45d-ce88c15cbf3f	MA	Morocco	Africa - Northern Africa	MAD	Africa/Casablanca	t
94e49c11-6d58-4647-82be-040fcd431be0	MZ	Mozambique	Africa - Eastern Africa	MZN	Africa/Maputo	t
cfb6ed4c-962a-41dd-8712-7a0b408ad07d	MM	Myanmar		MMK	Asia/Yangon	t
3b9c5f69-7cb6-4812-b387-855fd202f7a5	NA	Namibia	Africa - Southern Africa	ZAR	Africa/Windhoek	t
17f52219-45dc-4ade-9a78-086dc87e7ccc	NR	Nauru	Oceania - Micronesia	AUD	Pacific/Nauru	t
0187a551-c985-4909-8bed-9cc4cca1d8aa	NP	Nepal	Asia - Southern Asia	NPR	Asia/Kathmandu	t
25aa192d-5863-4f53-897d-6a8645fce5fe	NL	Netherlands	Europe - Western Europe	EUR	Europe/Amsterdam	t
cdecc264-194d-4538-a6ac-2c5d12877afa	NC	New Caledonia	Oceania - Melanesia	XPF	Pacific/Noumea	t
5609b9c2-54d4-4fe4-8c0f-9610270d9bd1	NZ	New Zealand	Oceania - Australia and New Zealand	NZD	Pacific/Auckland; Pacific/Chatham	t
6df4b672-7f77-4f62-ad86-799af48dd85d	NI	Nicaragua	Americas - Central America	NIO	America/Managua	t
1630489a-cb90-4c6e-a85f-927c2d7ef068	NE	Niger	Africa - Western Africa	XOF	Africa/Niamey	t
7457944c-ea8d-4dbd-8a6f-e3f00538fa2e	NG	Nigeria	Africa - Western Africa	NGN	Africa/Lagos	t
b2e436ca-5156-42f4-b109-45da70cce47f	NU	Niue	Oceania - Polynesia	NZD	Pacific/Niue	t
70cba071-5077-4583-b980-7e27ee124686	NF	Norfolk Island	Oceania - Australia and New Zealand	AUD	Pacific/Norfolk	t
7dbe2f7d-4bd2-4c56-8f11-a4d7f5c0d706	MK	North Macedonia		MKD	Europe/Skopje	t
fdf10da9-e3ff-480c-b6d2-00354af43dcb	MP	Northern Mariana Islands	Oceania - Micronesia	USD	Pacific/Saipan	t
5413eeca-b26c-4117-868c-6f1a680613d3	NO	Norway	Europe - Northern Europe	NOK	Europe/Oslo	t
3153612a-9f49-4c2e-a320-aaa37a7a1e5d	OM	Oman	Asia - Western Asia	OMR	Asia/Muscat	t
f0545a1f-97dd-491c-9796-cfbfa1b58d50	PK	Pakistan	Asia - Southern Asia	PKR	Asia/Karachi	t
1a7f7734-20ea-46eb-b211-8839f9ab73ae	PW	Palau	Oceania - Micronesia	USD	Pacific/Palau	t
930a328b-9888-4b8e-bae1-9cab5cafac54	PS	Palestine, State of		ILS	Asia/Gaza; Asia/Hebron	t
f70e5e61-7af8-4064-bfc6-41027a895492	PA	Panama	Americas - Central America	PAB	America/Panama	t
7788ea62-2927-43f5-9c5f-f844ba3dbd06	PG	Papua New Guinea	Oceania - Melanesia	PGK	Pacific/Port_Moresby; Pacific/Bougainville	t
3f312971-e156-4d93-8aaf-8b3322ecf25f	PY	Paraguay	Americas - South America	PYG	America/Asuncion	t
bfcfa981-c587-447d-8cad-28ece69986ad	PE	Peru	Americas - South America	PEN	America/Lima	t
ae203790-7c2b-4876-9bdc-828920be97bb	PH	Philippines	Asia - South-Eastern Asia	PHP	Asia/Manila	t
e010388c-7935-4543-b44c-5fd3c8aa2549	PN	Pitcairn		NZD	Pacific/Pitcairn	t
416eecde-09a1-4ddd-b15e-05eba67bb24e	PL	Poland	Europe - Eastern Europe	PLN	Europe/Warsaw	t
d63be332-4c91-446e-b760-df1417b24aa9	PT	Portugal	Europe - Southern Europe	EUR	Europe/Lisbon; Atlantic/Madeira; Atlantic/Azores	t
16c8bcb5-6ffa-40ec-a0c7-a61690e2b7ae	PR	Puerto Rico	Americas - Caribbean	USD	America/Puerto_Rico	t
517ec3dc-aa0a-4873-a42b-9355da180dd2	QA	Qatar	Asia - Western Asia	QAR	Asia/Qatar	t
d4e92ac3-4481-4134-a6a4-6edc8b236521	RO	Romania	Europe - Eastern Europe	RON	Europe/Bucharest	t
ec166055-50bd-4eda-acfd-ecc7a46d03e3	RU	Russian Federation	Europe - Eastern Europe	RUB	Europe/Kaliningrad; Europe/Moscow; Europe/Kirov; Europe/Volgograd; Europe/Astrakhan; Europe/Saratov; � (+20 more)	t
b2e52175-0fa0-4ad9-a6c7-501fb2c9af9d	RW	Rwanda	Africa - Eastern Africa	RWF	Africa/Kigali	t
25fc1300-5ad6-43f2-9f7c-81a977572653	RE	R�union	Africa - Eastern Africa	EUR	Indian/Reunion	t
9c121bdd-20d5-4b8f-bbea-8433ffa1a28b	BL	Saint Barth�lemy		EUR	America/St_Barthelemy	t
727f10a6-615c-4f92-ab92-e8c11b50bf7c	SH	Saint Helena, Ascension and Tristan da Cunha		SHP	Atlantic/St_Helena	t
7d95dd26-1c58-4a2a-a4e7-654862ffbddb	KN	Saint Kitts and Nevis	Americas - Caribbean	XCD	America/St_Kitts	t
af0ad507-2c1a-4068-811d-8207a15531e7	LC	Saint Lucia	Americas - Caribbean	XCD	America/St_Lucia	t
eabc8faf-dfb4-4e5c-be8c-f1b0ecee5a06	MF	Saint Martin (French part)		EUR	America/Marigot	t
7877e85c-6235-473f-863c-5d3ea5fe2e0e	PM	Saint Pierre and Miquelon	Americas - Northern America	EUR	America/Miquelon	t
02f46297-f6ca-4b6c-963c-ca77c2a071da	VC	Saint Vincent and the Grenadines	Americas - Caribbean	XCD	America/St_Vincent	t
dd257207-a8c8-4261-8e5d-cfbecfd795ac	WS	Samoa	Oceania - Polynesia	WST	Pacific/Apia	t
84157ee3-6019-4896-8a25-834f20f7e545	SM	San Marino	Europe - Southern Europe	EUR	Europe/San_Marino	t
f09e3636-1265-4b81-9273-02691650bbcb	ST	Sao Tome and Principe		STN	Africa/Sao_Tome	t
9caf3cbb-e803-4fa0-9eec-1129678df53f	SA	Saudi Arabia	Asia - Western Asia	SAR	Asia/Riyadh	t
c2214f8b-443d-4173-bc10-bca6e0055f4e	SN	Senegal	Africa - Western Africa	XOF	Africa/Dakar	t
3b2f012c-3bba-4a7f-90d0-cff68a192758	RS	Serbia	Europe - Eastern Europe	RSD	Europe/Belgrade	t
cd38b263-2995-4db8-a694-96b321116ce5	SC	Seychelles	Africa - Eastern Africa	SCR	Indian/Mahe	t
0823f62f-6e21-4912-bfa1-84b34baf5ad4	SL	Sierra Leone	Africa - Western Africa	SLE	Africa/Freetown	t
28480847-f3a1-496b-b41b-1db762675131	SG	Singapore	Asia - South-Eastern Asia	SGD	Asia/Singapore	t
ff848330-3ca3-4054-97a8-e526b6729e88	SX	Sint Maarten (Dutch part)		XCG	America/Lower_Princes	t
b29785e4-6f44-43a8-8b2d-0f18763123a3	SK	Slovakia	Europe - Eastern Europe	EUR	Europe/Bratislava	t
b782f73f-ec71-422c-923a-d281789e1000	SI	Slovenia	Europe - Southern Europe	EUR	Europe/Ljubljana	t
384091c1-2f6b-46ec-940f-d66bc5060b31	SB	Solomon Islands	Oceania - Melanesia	SBD	Pacific/Guadalcanal	t
1c18b98c-551f-4472-a9cf-a8695bafb943	SO	Somalia	Africa - Eastern Africa	SOS	Africa/Mogadishu	t
3f25dc0a-728c-40cc-a7de-8bd831063858	ZA	South Africa	Africa - Southern Africa	ZAR	Africa/Johannesburg	t
89cfa882-7f54-4de4-b8d7-66b6053f9e64	GS	South Georgia and the South Sandwich Islands	Americas - South America	GBP	Atlantic/South_Georgia	t
ed17127f-97c5-4e29-8293-7c2ecd2a143b	SS	South Sudan	Africa - Middle Africa	SSP	Africa/Juba	t
bdcf7ca5-4974-459d-927a-32456797b1dd	ES	Spain	Europe - Southern Europe	EUR	Europe/Madrid; Africa/Ceuta; Atlantic/Canary	t
8232746d-ad31-4162-930f-4aa766dcde2d	LK	Sri Lanka	Asia - Southern Asia	LKR	Asia/Colombo	t
0e1da429-9801-42c4-ae8e-a1d91162f404	SD	Sudan	Africa - Northern Africa	SDG	Africa/Khartoum	t
2a8f189b-fdb0-46b8-bb9a-33e2f9369759	SR	Suriname	Americas - South America	SRD	America/Paramaribo	t
ec29d636-a0fd-48bd-9596-2fc71db61e0c	SJ	Svalbard and Jan Mayen	Europe - Northern Europe	NOK	Arctic/Longyearbyen	t
34f95008-719c-4efb-ab4d-030da8c9d6d2	SE	Sweden	Europe - Northern Europe	SEK	Europe/Stockholm	t
95631dc4-1de3-435c-b979-b1e19965c4c7	CH	Switzerland	Europe - Western Europe	CHF	Europe/Zurich	t
746611fc-e340-4287-8d5b-1997b4ef3bca	SY	Syrian Arab Republic	Asia - Western Asia	SYP	Asia/Damascus	t
ac2bc498-2860-4e3c-b530-081d40191a2a	TW	Taiwan, Province of China	Asia - Eastern Asia	TWD	Asia/Taipei	t
11fd24e1-e513-4f80-8b07-1c00ffa6ca83	TJ	Tajikistan	Asia - Central Asia	TJS	Asia/Dushanbe	t
e81e73c1-b275-40bb-bed6-345ea401d902	TZ	Tanzania, United Republic of	Africa - Eastern Africa	TZS	Africa/Dar_es_Salaam	t
2202faab-30ff-4818-8fd2-94fccbd7a6a5	TH	Thailand	Asia - South-Eastern Asia	THB	Asia/Bangkok	t
a5d2b0ba-583d-4766-bbe4-1a99b7f84778	TL	Timor-Leste	Asia - South-Eastern Asia	USD	Asia/Dili	t
945b9656-5380-4d84-9b4d-59ead026823e	TG	Togo	Africa - Western Africa	XOF	Africa/Lome	t
0865075a-9a1a-4621-ba06-085e41666f55	TK	Tokelau	Oceania - Polynesia	NZD	Pacific/Fakaofo	t
afe85430-48a2-4d05-a805-f3143b4e43a7	TO	Tonga	Oceania - Polynesia	TOP	Pacific/Tongatapu	t
f99f0797-c749-4ac9-afac-9ad5f20f7cb4	TT	Trinidad and Tobago	Americas - Caribbean	TTD	America/Port_of_Spain	t
b06b6509-8eb0-44e1-ae77-eaccfc57e24f	TN	Tunisia	Africa - Northern Africa	TND	Africa/Tunis	t
30a2b8e8-ffa4-4bd7-9221-6f95992ffb93	TR	Turkey	Asia - Western Asia	TRY	Europe/Istanbul	t
9f3c3820-945c-4fcf-9a86-432cdf9cfabe	TM	Turkmenistan	Asia - Central Asia	TMT	Asia/Ashgabat	t
e2e7d928-4382-4e37-9c60-ae4b5bf416c8	TC	Turks and Caicos Islands		USD	America/Grand_Turk	t
a297e557-3242-4fbe-ba9c-c9bdcc0f70af	TV	Tuvalu	Oceania - Polynesia	AUD	Pacific/Funafuti	t
05436a04-38ac-428b-968b-4c9c1071eb76	UG	Uganda	Africa - Eastern Africa	UGX	Africa/Kampala	t
6f7dfe9b-5ef8-4c81-b2c0-a780e83612ad	UA	Ukraine	Europe - Eastern Europe	UAH	Europe/Simferopol; Europe/Kyiv	t
b692e64d-158d-4d53-9033-b2f81c99036f	AE	United Arab Emirates	Asia - Western Asia	AED	Asia/Dubai	t
1baf1827-5256-47d7-b5fe-1a9318c05aa0	GB	United Kingdom	Europe - Northern Europe	GBP	Europe/London	t
4a06d9b0-2f06-4c61-bbf2-5604e7d01b92	US	United States	Americas - Northern America	USD	America/New_York; America/Detroit; America/Kentucky/Louisville; America/Kentucky/Monticello; America/Indiana/Indianapolis; America/Indiana/Vincennes; � (+23 more)	t
0d202a4c-cd50-4702-abed-668faedc6c90	UM	United States Minor Outlying Islands	Americas - Northern America	USD	Pacific/Midway; Pacific/Wake	t
6449af59-2cc8-4a52-8ce6-6a3d16e38d3a	UY	Uruguay	Americas - South America	UYU	America/Montevideo	t
19211d0d-5ea5-435e-b5aa-b251e7e0972a	UZ	Uzbekistan	Asia - Central Asia	UZS	Asia/Samarkand; Asia/Tashkent	t
8060bcf7-5101-424c-92bc-12ada0053df6	VU	Vanuatu	Oceania - Melanesia	VUV	Pacific/Efate	t
b72b55e5-2f20-4a7b-b945-fcb15eb5d17d	VE	Venezuela, Bolivarian Republic of	Americas - South America	VES	America/Caracas	t
40fb687b-2b90-4e39-a40c-51e97d7fce3a	VN	Viet Nam	Asia - South-Eastern Asia	VND	Asia/Ho_Chi_Minh	t
864c4181-bed0-4a00-9943-3e689a54de2f	VG	Virgin Islands, British		USD	America/Tortola	t
f0ab8609-d263-41ef-9bb3-f5141b76e2c3	VI	Virgin Islands, U.S.		USD	America/St_Thomas	t
43b93fa1-8fa3-4d9f-b1bc-fd7ccb14c4f1	WF	Wallis and Futuna	Oceania - Polynesia	XPF	Pacific/Wallis	t
5475c48f-681a-4684-87c5-539a76938a1e	EH	Western Sahara	Africa - Northern Africa	MAD	Africa/El_Aaiun	t
b1491fde-ef0d-43fd-8934-aa6e245ee32c	YE	Yemen	Asia - Western Asia	YER	Asia/Aden	t
3fae674e-a154-4a7d-a00d-d302554f712d	ZM	Zambia	Africa - Eastern Africa	ZMW	Africa/Lusaka	t
190d4e64-4394-473c-afbe-82c74b7ef331	ZW	Zimbabwe	Africa - Eastern Africa	USD	Africa/Harare	t
1fff8427-15cf-46f1-990c-8500f1e4e822	AX	�land Islands		EUR	Europe/Mariehamn	t
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, booking_id, traveler_id, workflow_step_id, doc_type, file_name, file_url, uploaded_by, doc_status, reviewed_by, created_at, review_notes) FROM stdin;
\.


--
-- Data for Name: guide_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.guide_rates (id, country_code, city_base, guide_name, guide_code, language, rate_unit, currency, valid_from, valid_to, price, license_level, notes, status, created_at) FROM stdin;
\.


--
-- Data for Name: hotel_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hotel_rates (id, country_code, city, hotel_name, hotel_code, room_type, meal_plan, currency, valid_from, valid_to, price_per_room_per_night, tax_included, min_nights, blackout_dates, notes, status, created_at) FROM stdin;
068fc61c-6aa1-45d8-b63a-61dd55b03845	IL	Jerusalem	TestHotel_00nAmf	\N	DBL	BB	USD	2026-03-01	2026-10-31	175	t	\N	\N	Test rate	draft	2026-02-15 15:13:59.248932
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.messages (id, booking_id, workflow_id, sender_user_id, sender_name, message_visibility, message_text, created_at) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, booking_id, amount, currency, payment_method, payment_status, receipt_url, created_at, notes, created_by) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (sid, sess, expire) FROM stdin;
X6Y3vcbjaLui7NFCKFq-N15dCMY81-be	{"cookie": {"path": "/", "secure": false, "expires": "2026-03-25T17:55:08.880Z", "httpOnly": true, "originalMaxAge": 604800000}, "userId": "c05c4c29-0e3c-4d5c-b3de-ae76d4e68191", "userRole": "admin"}	2026-03-25 17:55:45
\.


--
-- Data for Name: sights; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sights (id, name, city_id, description, sight_category, ticket_required, estimated_duration, is_active, individual_ticket_cost, group_ticket_cost, long_description) FROM stdin;
\.


--
-- Data for Name: sights_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sights_rates (id, country_code, city, attraction_name, attraction_code, ticket_type, currency, valid_from, valid_to, price_per_person, requires_timeslot, notes, status, created_at) FROM stdin;
\.


--
-- Data for Name: tour_days; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tour_days (id, tour_id, day_number, title, description, country_code, city, activities) FROM stdin;
3bb04878-33ed-4031-a56c-148a3512b050	6bbfa6a0-94cd-4b00-8866-0091a5515db2	1	Arrival in Paris	Welcome to France! Transfer to hotel.	\N	Paris	Airport transfer, hotel check-in
e4fc0d82-cfe3-4314-89da-33be34a5171b	6bbfa6a0-94cd-4b00-8866-0091a5515db2	2	Paris Sightseeing	Full day exploring Paris landmarks.	\N	Paris	Eiffel Tower, Louvre Museum
\.


--
-- Data for Name: tour_departures; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tour_departures (id, tour_id, start_date, end_date, capacity_total, capacity_booked, status, public_join_enabled, price_per_person, booking_cutoff_date, notes) FROM stdin;
48d1b8f8-921f-4f7d-8399-afc811f1d5f4	fbdf7f16-12c6-4190-9295-9be7ee432e45	2026-06-15	2026-06-18	20	0	open	t	500	2026-06-01	Automated test departure
314b53d4-c1fe-462e-9cef-402f18825d8a	334664f8-2440-4809-9d90-8460ee7314ca	2026-08-01	2026-08-04	20	0	open	t	500	\N	test departure
\.


--
-- Data for Name: tours; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tours (id, title, description, highlights, image_url, duration, base_price, currency, countries, is_published, created_by, created_at, tags, pdf_itinerary_url, internal_notes) FROM stdin;
6bbfa6a0-94cd-4b00-8866-0091a5515db2	Test Brochure Tour tqziQ_	A wonderful test tour for brochure testing	Beautiful scenery\nHistoric sites\nLocal cuisine\nCultural experiences	\N	7	1500	USD	{France,Italy}	t	c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	2026-02-15 13:26:12.90333	\N	\N	\N
c70ac7dc-041b-44d7-901a-a9f31753fbaa	Brochure Test Tour g2f5-G	Amazing tour for brochure testing	Scenic views\nLocal food\nHistorical landmarks	\N	5	1200	USD	{Spain}	t	c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	2026-02-15 13:39:59.510717	\N	\N	\N
fbdf7f16-12c6-4190-9295-9be7ee432e45	Passenger Test Tour udMI6b	Tour for passenger testing	Test highlights	\N	3	500	USD	{Thailand}	t	c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	2026-02-15 14:09:23.932886	\N	\N	\N
334664f8-2440-4809-9d90-8460ee7314ca	Passenger Mgmt Tour xe0mI2	Tour for testing passenger management	Testing	\N	3	500	USD	{Japan}	t	c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	2026-02-15 14:15:45.135118	\N	\N	\N
\.


--
-- Data for Name: transport_bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_bookings (id, booking_id, tour_id, company_id, route_id, bus_type_id, service_date, service_end_date, status, cost_quoted, confirmed_at, notes, created_at) FROM stdin;
\.


--
-- Data for Name: transport_companies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_companies (id, name, country_id, vehicle_types, contact_name, contact_phone, contact_email, is_active, address_line1, address_line2, city, state, postal_code, bank_name, bank_account_number, bank_swift, bank_iban, tax_id, notes) FROM stdin;
d4d456e1-74d9-4a67-bcc0-7dfa978384ea	TestTransport_FhvCjp	\N	{Bus,Van}	John Test	555-1234	test@transport.com	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: transport_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_invoices (id, company_id, transport_booking_id, invoice_number, service_details, amount, status, submitted_at, approved_at, notes) FROM stdin;
\.


--
-- Data for Name: transport_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_payments (id, company_id, invoice_id, tour_id, amount, payment_date, payment_method, reference, notes, created_at) FROM stdin;
\.


--
-- Data for Name: transport_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_rates (id, country_code, city_base, vendor_name, vendor_code, vehicle_type, seat_capacity, rate_mode, currency, valid_from, valid_to, base_price, included_hours, included_km, overtime_per_hour, extra_per_km, route_from_city, route_to_city, notes, status, created_at) FROM stdin;
\.


--
-- Data for Name: transport_route_pricing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_route_pricing (id, route_id, bus_type_id, cost_per_trip, notes) FROM stdin;
\.


--
-- Data for Name: transport_routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_routes (id, company_id, name, description, from_city, to_city, distance_miles, is_active) FROM stdin;
\.


--
-- Data for Name: travelers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.travelers (id, booking_id, first_name, last_name, dob, nationality, passport_number, passport_expiry, gender, special_needs, created_at) FROM stdin;
e601a3e8-8231-443c-a7fb-7058fd85ddd4	4600dd2d-d04e-44ab-85f6-77b1e76eb400	Jane	Doe	\N	Thai	\N	\N	female	\N	2026-02-15 14:12:22.276368
\.


--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_profiles (id, user_id, role, phone, company_name, country_code, is_tour_leader, is_active, transport_company_id) FROM stdin;
3f4970af-0516-43d2-9efe-0c8568ab5937	test-customer-e2e-001	customer	\N	\N	\N	f	t	\N
52ebf0cb-09e2-462a-b1ba-0e8702d689b5	test-admin-e2e-002	admin	\N	\N	\N	f	t	\N
b57a464e-a611-43ec-a804-054bee683a93	test-supplier-e2e-003	airline_supplier	\N	\N	\N	f	t	\N
5faf7c85-4415-4df0-a1a4-f49c9d62dd05	test-ops-e2e-004	hotel_manager	\N	\N	\N	f	t	\N
adb8c9fa-6a3a-4e68-9db4-a680cda38cdc	real-admin-test-I3N_Lk	admin	\N	\N	\N	f	t	\N
16050522-418c-4e0a-ad2d-40233b9855d0	real-supplier-test-1SzMzo	airline_supplier	\N	\N	\N	f	t	\N
4ebaae6e-3c6c-4c2a-870a-057be0eeeaf6	47089032	admin	\N	\N	\N	f	t	\N
00ca0ce2-860e-4da2-874f-66bd3578d9d3	admin-master-test-8qEL3s	admin	\N	\N	\N	f	t	\N
ae8047ce-fc4e-4216-99a7-357c6946ad2d	leader_test_1	customer	\N	\N	\N	f	t	\N
aa75d7ef-74f7-4caa-b977-28fdf6ccefb8	test-admin-001	admin	\N	\N	\N	f	t	\N
aa61a1d8-096b-4ea2-a1a0-b4e8d2a7a6e0	c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	admin	\N	\N	\N	f	t	\N
a754ab6e-270a-485c-ac4b-256b9156d4ab	d6c4750b-6aa3-4331-b2fd-e91fb42fe3e6	admin	\N	\N	\N	f	t	\N
c1dc3f2c-289d-4196-bda9-4386ea7249f1	04ac7775-b144-4889-a731-150b65b3ca27	customer	\N	\N	\N	f	t	\N
bc73d8ca-2cf4-460c-bcc1-445afd58b1ac	b8a611a6-97b9-474a-a5e8-b8d5e46577c3	customer	\N	\N	\N	f	t	\N
88bfda24-d4fa-40e8-a3e3-6901264ac56a	ef4bcc99-2609-4d0d-944d-e7587c0b1f67	customer	\N	\N	\N	f	t	\N
c5d58a2a-0110-489d-985a-2d12c54643eb	a8bb3d8d-6ecd-4ae4-acc6-8064bd37805e	customer	\N	\N	\N	f	t	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at, username, password_hash) FROM stdin;
test-admin-001	admin@tourops.test	Admin	User	\N	2026-02-13 18:10:59.169285	2026-02-13 18:10:59.169285	\N	\N
test-admin-e2e-002	admin2@tourops.test	Alex	Admin	\N	2026-02-13 19:19:19.883064	2026-02-13 19:19:19.883064	\N	\N
test-supplier-e2e-003	supplier3@tourops.test	Sam	Supplier	\N	2026-02-13 19:21:56.326746	2026-02-13 19:21:56.326746	\N	\N
test-ops-e2e-004	ops4@tourops.test	Olivia	OpsManager	\N	2026-02-13 19:22:58.766349	2026-02-13 19:22:58.766349	\N	\N
real-admin-test-I3N_Lk	adminL8dDV4@tourops.test	Test	Admin	\N	2026-02-13 20:08:59.184146	2026-02-13 20:08:59.184146	\N	\N
real-supplier-test-1SzMzo	supplierLfjxkv@tourops.test	Test	Supplier	\N	2026-02-13 20:09:48.512392	2026-02-13 20:09:48.512392	\N	\N
admin-master-test-8qEL3s	adminqYNDtT@tourops.test	Master	Admin	\N	2026-02-13 20:55:30.493223	2026-02-13 20:55:30.493223	\N	\N
leader_test_1	leader_test_1@example.com	Leader	Tester	\N	2026-02-14 17:31:22.186954	2026-02-14 17:31:22.186954	\N	\N
47089032	danielmalka@live.com	daniel	malka	\N	2026-02-13 20:41:16.943018	2026-02-14 23:15:10.518	\N	\N
c05c4c29-0e3c-4d5c-b3de-ae76d4e68191	admin@tourops.com	System	Admin	\N	2026-02-15 12:40:06.115634	2026-02-15 12:40:06.115634	admin	$2b$10$5dJoiNjvY/Z2oJEZ9bLNf.jPqxaY9AsU4T0nWlKoRNeRG9L7QsMSW
d6c4750b-6aa3-4331-b2fd-e91fb42fe3e6	\N	Dan	Malka	\N	2026-02-15 12:57:42.989089	2026-02-15 12:57:42.989089	danmalka	$2b$10$706UYrAYC1MxAVIoc9jKTeUzU2wdVxfgyeMujWebdFRkWMljSQJza
test-customer-e2e-001	customer1@tourops.test	Jane	Customer	\N	2026-02-13 19:18:41.352	2026-02-15 13:05:47.559	\N	$2b$10$y6BxN2USYRU86Pz/Z9nf7uIOhML4RD3KVRTkUjiCDGFhrWBNekPKC
04ac7775-b144-4889-a731-150b65b3ca27	tourleader1@gmsail.com	tour1	leader	\N	2026-02-15 13:11:23.930401	2026-02-15 13:11:23.930401	tourleader1	$2b$10$S5axjhCXP5F05EgBR.X36.i04o3d83a7PvfYRdJXTGsR48s2D0rEq
b8a611a6-97b9-474a-a5e8-b8d5e46577c3	tourleader1@gmail.com	tour2	leader2	\N	2026-02-15 13:14:05.084178	2026-02-15 13:14:05.084178	tourleader2	$2b$10$TLFVTcazYsAoNZOSgn2YMeVWN3RC8IeE8w.AY4NZ5jlzKfo7ER/IS
ef4bcc99-2609-4d0d-944d-e7587c0b1f67	testcust_JZMK1x@test.com	Test	Customer	\N	2026-02-15 14:10:47.045045	2026-02-15 14:10:47.045045	testcust_JZMK1x	$2b$10$yIN2NRRae7gx8S9JFlUUDO71hqZWrAcJmdw3SMq3u1LocxWHyuSNi
a8bb3d8d-6ecd-4ae4-acc6-8064bd37805e	passtest_JUwsj_@test.com	Pass	Tester	\N	2026-02-15 14:16:17.326912	2026-02-15 14:16:17.326912	passtest_JUwsj_	$2b$10$uf8/Vjmr0BvktArF2coI5etF6M4iEZ.G.04OfXjNGGjV7PPBc50ce
\.


--
-- Data for Name: workflow_steps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.workflow_steps (id, workflow_id, step_order, step_code, step_name, step_status, updated_by, notes, updated_at) FROM stdin;
\.


--
-- Name: airline_agencies airline_agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airline_agencies
    ADD CONSTRAINT airline_agencies_pkey PRIMARY KEY (id);


--
-- Name: airports airports_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airports
    ADD CONSTRAINT airports_code_unique UNIQUE (code);


--
-- Name: airports airports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.airports
    ADD CONSTRAINT airports_pkey PRIMARY KEY (id);


--
-- Name: booking_assignments booking_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_assignments
    ADD CONSTRAINT booking_assignments_pkey PRIMARY KEY (id);


--
-- Name: booking_workflows booking_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_workflows
    ADD CONSTRAINT booking_workflows_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_code_unique UNIQUE (booking_code);


--
-- Name: bookings bookings_join_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_join_code_unique UNIQUE (join_code);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bus_types bus_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bus_types
    ADD CONSTRAINT bus_types_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: countries countries_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_code_unique UNIQUE (code);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: guide_rates guide_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_rates
    ADD CONSTRAINT guide_rates_pkey PRIMARY KEY (id);


--
-- Name: hotel_rates hotel_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_rates
    ADD CONSTRAINT hotel_rates_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: sights sights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sights
    ADD CONSTRAINT sights_pkey PRIMARY KEY (id);


--
-- Name: sights_rates sights_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sights_rates
    ADD CONSTRAINT sights_rates_pkey PRIMARY KEY (id);


--
-- Name: tour_days tour_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_days
    ADD CONSTRAINT tour_days_pkey PRIMARY KEY (id);


--
-- Name: tour_departures tour_departures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tour_departures
    ADD CONSTRAINT tour_departures_pkey PRIMARY KEY (id);


--
-- Name: tours tours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tours
    ADD CONSTRAINT tours_pkey PRIMARY KEY (id);


--
-- Name: transport_bookings transport_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_bookings
    ADD CONSTRAINT transport_bookings_pkey PRIMARY KEY (id);


--
-- Name: transport_companies transport_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_companies
    ADD CONSTRAINT transport_companies_pkey PRIMARY KEY (id);


--
-- Name: transport_invoices transport_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_invoices
    ADD CONSTRAINT transport_invoices_pkey PRIMARY KEY (id);


--
-- Name: transport_payments transport_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_payments
    ADD CONSTRAINT transport_payments_pkey PRIMARY KEY (id);


--
-- Name: transport_rates transport_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_rates
    ADD CONSTRAINT transport_rates_pkey PRIMARY KEY (id);


--
-- Name: transport_route_pricing transport_route_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_route_pricing
    ADD CONSTRAINT transport_route_pricing_pkey PRIMARY KEY (id);


--
-- Name: transport_routes transport_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_routes
    ADD CONSTRAINT transport_routes_pkey PRIMARY KEY (id);


--
-- Name: travelers travelers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travelers
    ADD CONSTRAINT travelers_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- PostgreSQL database dump complete
--

\unrestrict qJevmHAGrGUcYON5xi2tgEVdsofbRyc2REIcmSlTReSjvOZ4TlIJrxW86Y0mfGg

