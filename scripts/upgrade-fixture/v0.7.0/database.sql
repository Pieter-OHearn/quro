--
-- PostgreSQL database dump
--

\restrict quroUpgradeFixture070

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

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
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: quro_admin
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO quro_admin;

--
-- Name: bunq_sync_status; Type: TYPE; Schema: public; Owner: quro_admin
--

CREATE TYPE public.bunq_sync_status AS ENUM (
    'idle',
    'syncing',
    'error'
);


ALTER TYPE public.bunq_sync_status OWNER TO quro_admin;

--
-- Name: currency_code; Type: TYPE; Schema: public; Owner: quro_admin
--

CREATE TYPE public.currency_code AS ENUM (
    'EUR',
    'GBP',
    'USD',
    'AUD',
    'NZD',
    'CAD',
    'CHF',
    'SGD'
);


ALTER TYPE public.currency_code OWNER TO quro_admin;

--
-- Name: partner_link_status; Type: TYPE; Schema: public; Owner: quro_admin
--

CREATE TYPE public.partner_link_status AS ENUM (
    'pending',
    'accepted'
);


ALTER TYPE public.partner_link_status OWNER TO quro_admin;

--
-- Name: pension_import_confidence_label; Type: TYPE; Schema: public; Owner: quro_admin
--

CREATE TYPE public.pension_import_confidence_label AS ENUM (
    'high',
    'medium',
    'low'
);


ALTER TYPE public.pension_import_confidence_label OWNER TO quro_admin;

--
-- Name: pension_import_status; Type: TYPE; Schema: public; Owner: quro_admin
--

CREATE TYPE public.pension_import_status AS ENUM (
    'queued',
    'processing',
    'ready_for_review',
    'failed',
    'committed',
    'expired',
    'cancelled'
);


ALTER TYPE public.pension_import_status OWNER TO quro_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: quro_admin
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO quro_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: quro_admin
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO quro_admin;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: quro_admin
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: budget_categories; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.budget_categories (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    emoji text,
    budgeted numeric(19,2) NOT NULL,
    spent numeric(19,2) NOT NULL,
    color text,
    month text NOT NULL,
    year integer NOT NULL,
    expense_class text DEFAULT 'essential'::text NOT NULL,
    expense_class_confirmed boolean DEFAULT false NOT NULL,
    currency public.currency_code DEFAULT 'EUR'::public.currency_code NOT NULL,
    currency_needs_review boolean DEFAULT false NOT NULL,
    CONSTRAINT budget_categories_currency_eur CHECK ((currency = 'EUR'::public.currency_code)),
    CONSTRAINT budget_categories_expense_class_check CHECK ((expense_class = ANY (ARRAY['essential'::text, 'discretionary'::text, 'employment_linked'::text])))
);


ALTER TABLE public.budget_categories OWNER TO quro_admin;

--
-- Name: budget_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.budget_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budget_categories_id_seq OWNER TO quro_admin;

--
-- Name: budget_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.budget_categories_id_seq OWNED BY public.budget_categories.id;


--
-- Name: budget_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.budget_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    category_id integer NOT NULL,
    description text NOT NULL,
    amount numeric(19,2) NOT NULL,
    date date NOT NULL,
    merchant text NOT NULL,
    bunq_transaction_id text,
    bunq_mcc text,
    bunq_payment_type text,
    counterparty_iban text,
    source_provider text,
    source_account_id text,
    source_account_name text,
    source_account_type text,
    currency public.currency_code DEFAULT 'EUR'::public.currency_code NOT NULL,
    currency_needs_review boolean DEFAULT false NOT NULL,
    source_amount numeric(19,2),
    source_currency public.currency_code,
    CONSTRAINT budget_transactions_currency_eur CHECK ((currency = 'EUR'::public.currency_code))
);


ALTER TABLE public.budget_transactions OWNER TO quro_admin;

--
-- Name: budget_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.budget_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budget_transactions_id_seq OWNER TO quro_admin;

--
-- Name: budget_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.budget_transactions_id_seq OWNED BY public.budget_transactions.id;


--
-- Name: bunq_connections; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.bunq_connections (
    id integer NOT NULL,
    user_id integer NOT NULL,
    access_token text NOT NULL,
    bunq_user_id text,
    last_sync_at timestamp without time zone,
    sync_status public.bunq_sync_status DEFAULT 'idle'::public.bunq_sync_status NOT NULL,
    sync_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    private_key text,
    installation_token text,
    server_public_key text,
    session_token text,
    session_expires_at timestamp without time zone,
    session_id integer
);


ALTER TABLE public.bunq_connections OWNER TO quro_admin;

--
-- Name: bunq_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.bunq_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bunq_connections_id_seq OWNER TO quro_admin;

--
-- Name: bunq_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.bunq_connections_id_seq OWNED BY public.bunq_connections.id;


--
-- Name: bunq_oauth_attempts; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.bunq_oauth_attempts (
    id integer NOT NULL,
    state_hash text NOT NULL,
    user_id integer NOT NULL,
    destination text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT bunq_oauth_attempts_destination_check CHECK ((destination = ANY (ARRAY['savings'::text, 'settings'::text])))
);


ALTER TABLE public.bunq_oauth_attempts OWNER TO quro_admin;

--
-- Name: bunq_oauth_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.bunq_oauth_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bunq_oauth_attempts_id_seq OWNER TO quro_admin;

--
-- Name: bunq_oauth_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.bunq_oauth_attempts_id_seq OWNED BY public.bunq_oauth_attempts.id;


--
-- Name: bunq_payment_progress; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.bunq_payment_progress (
    id integer NOT NULL,
    user_id integer NOT NULL,
    account_id integer NOT NULL,
    kind text NOT NULL,
    newer_than text,
    next_page_url text,
    complete boolean DEFAULT false NOT NULL,
    started_at timestamp without time zone NOT NULL
);


ALTER TABLE public.bunq_payment_progress OWNER TO quro_admin;

--
-- Name: bunq_payment_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.bunq_payment_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bunq_payment_progress_id_seq OWNER TO quro_admin;

--
-- Name: bunq_payment_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.bunq_payment_progress_id_seq OWNED BY public.bunq_payment_progress.id;


--
-- Name: category_mappings; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.category_mappings (
    id integer NOT NULL,
    user_id integer NOT NULL,
    source text NOT NULL,
    source_key text NOT NULL,
    category_name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.category_mappings OWNER TO quro_admin;

--
-- Name: category_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.category_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.category_mappings_id_seq OWNER TO quro_admin;

--
-- Name: category_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.category_mappings_id_seq OWNED BY public.category_mappings.id;


--
-- Name: currency_rate_history; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.currency_rate_history (
    id integer NOT NULL,
    from_currency public.currency_code NOT NULL,
    to_currency public.currency_code NOT NULL,
    rate numeric(12,6) NOT NULL,
    provider text NOT NULL,
    source_date date NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.currency_rate_history OWNER TO quro_admin;

--
-- Name: currency_rate_history_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.currency_rate_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.currency_rate_history_id_seq OWNER TO quro_admin;

--
-- Name: currency_rate_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.currency_rate_history_id_seq OWNED BY public.currency_rate_history.id;


--
-- Name: currency_rates; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.currency_rates (
    id integer NOT NULL,
    from_currency public.currency_code NOT NULL,
    to_currency public.currency_code NOT NULL,
    rate numeric(12,6) NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    provider text NOT NULL,
    source_date date NOT NULL
);


ALTER TABLE public.currency_rates OWNER TO quro_admin;

--
-- Name: currency_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.currency_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.currency_rates_id_seq OWNER TO quro_admin;

--
-- Name: currency_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.currency_rates_id_seq OWNED BY public.currency_rates.id;


--
-- Name: debt_payments; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.debt_payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    debt_id integer NOT NULL,
    date date NOT NULL,
    amount numeric(19,2) NOT NULL,
    principal numeric(19,2) NOT NULL,
    interest numeric(19,2) NOT NULL,
    note text
);


ALTER TABLE public.debt_payments OWNER TO quro_admin;

--
-- Name: debt_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.debt_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.debt_payments_id_seq OWNER TO quro_admin;

--
-- Name: debt_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.debt_payments_id_seq OWNED BY public.debt_payments.id;


--
-- Name: debts; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.debts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    lender text NOT NULL,
    original_amount numeric(19,2) NOT NULL,
    remaining_balance numeric(19,2) NOT NULL,
    currency public.currency_code NOT NULL,
    interest_rate numeric(7,4) NOT NULL,
    monthly_payment numeric(19,2) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    color text NOT NULL,
    emoji text NOT NULL,
    notes text,
    archived_at timestamp without time zone
);


ALTER TABLE public.debts OWNER TO quro_admin;

--
-- Name: debts_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.debts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.debts_id_seq OWNER TO quro_admin;

--
-- Name: debts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.debts_id_seq OWNED BY public.debts.id;


--
-- Name: employments; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.employments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    employer_name text,
    employment_type text NOT NULL,
    service_start_date date,
    end_date date,
    notice_period_months integer,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT employments_date_order_check CHECK (((end_date IS NULL) OR (service_start_date IS NULL) OR (end_date >= service_start_date))),
    CONSTRAINT employments_notice_period_months_check CHECK (((notice_period_months IS NULL) OR ((notice_period_months >= 0) AND (notice_period_months <= 24)))),
    CONSTRAINT employments_type_check CHECK ((employment_type = ANY (ARRAY['employed'::text, 'self_employed'::text, 'other'::text])))
);


ALTER TABLE public.employments OWNER TO quro_admin;

--
-- Name: employments_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.employments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employments_id_seq OWNER TO quro_admin;

--
-- Name: employments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.employments_id_seq OWNED BY public.employments.id;


--
-- Name: goals; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.goals (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text,
    name text NOT NULL,
    emoji text,
    current_amount numeric(19,2) NOT NULL,
    target_amount numeric(19,2) NOT NULL,
    deadline text NOT NULL,
    year integer,
    category text NOT NULL,
    monthly_contribution numeric(19,2) NOT NULL,
    monthly_target numeric(19,2),
    months_completed integer,
    total_months integer,
    unit text,
    color text,
    notes text,
    currency public.currency_code DEFAULT 'EUR'::public.currency_code NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_id integer,
    start_month text,
    missed_months jsonb,
    CONSTRAINT goals_source_id_check CHECK ((((source_type = 'savings_account'::text) AND (source_id IS NOT NULL) AND (source_id > 0)) OR ((source_type <> 'savings_account'::text) AND (source_id IS NULL)))),
    CONSTRAINT goals_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'salary_latest_gross'::text, 'savings_account'::text, 'portfolio_total'::text, 'net_worth_total'::text, 'invest_habit_buys'::text])))
);


ALTER TABLE public.goals OWNER TO quro_admin;

--
-- Name: goals_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.goals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.goals_id_seq OWNER TO quro_admin;

--
-- Name: goals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.goals_id_seq OWNED BY public.goals.id;


--
-- Name: holding_price_history; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.holding_price_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    holding_id integer NOT NULL,
    eod_date date NOT NULL,
    close_price numeric(19,2) NOT NULL,
    price_currency text NOT NULL,
    synced_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.holding_price_history OWNER TO quro_admin;

--
-- Name: holding_price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.holding_price_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.holding_price_history_id_seq OWNER TO quro_admin;

--
-- Name: holding_price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.holding_price_history_id_seq OWNED BY public.holding_price_history.id;


--
-- Name: holding_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.holding_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    holding_id integer NOT NULL,
    type text NOT NULL,
    shares numeric(19,6),
    price numeric(19,2) NOT NULL,
    date date NOT NULL,
    note text
);


ALTER TABLE public.holding_transactions OWNER TO quro_admin;

--
-- Name: holding_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.holding_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.holding_transactions_id_seq OWNER TO quro_admin;

--
-- Name: holding_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.holding_transactions_id_seq OWNED BY public.holding_transactions.id;


--
-- Name: holdings; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.holdings (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    ticker text NOT NULL,
    current_price numeric(19,2) NOT NULL,
    currency public.currency_code NOT NULL,
    sector text NOT NULL,
    item_type text,
    exchange_mic text,
    industry text,
    price_updated_at timestamp without time zone,
    manual_price numeric(19,2),
    exclude_from_sync boolean DEFAULT false NOT NULL,
    archived_at timestamp without time zone
);


ALTER TABLE public.holdings OWNER TO quro_admin;

--
-- Name: holdings_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.holdings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.holdings_id_seq OWNER TO quro_admin;

--
-- Name: holdings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.holdings_id_seq OWNED BY public.holdings.id;


--
-- Name: mortgage_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.mortgage_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    mortgage_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(19,2) NOT NULL,
    interest numeric(19,2),
    principal numeric(19,2),
    date date NOT NULL,
    note text,
    fixed_years numeric(4,1)
);


ALTER TABLE public.mortgage_transactions OWNER TO quro_admin;

--
-- Name: mortgage_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.mortgage_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mortgage_transactions_id_seq OWNER TO quro_admin;

--
-- Name: mortgage_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.mortgage_transactions_id_seq OWNED BY public.mortgage_transactions.id;


--
-- Name: mortgages; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.mortgages (
    id integer NOT NULL,
    user_id integer NOT NULL,
    property_address text NOT NULL,
    lender text NOT NULL,
    currency public.currency_code NOT NULL,
    original_amount numeric(19,2) NOT NULL,
    outstanding_balance numeric(19,2) NOT NULL,
    property_value numeric(19,2) NOT NULL,
    monthly_payment numeric(19,2) NOT NULL,
    interest_rate numeric(7,4) NOT NULL,
    rate_type text NOT NULL,
    fixed_until text,
    term_years integer NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    overpayment_limit numeric(19,2),
    archived_at timestamp without time zone,
    is_joint boolean DEFAULT false NOT NULL,
    repayment_type text DEFAULT 'Annuity'::text NOT NULL
);


ALTER TABLE public.mortgages OWNER TO quro_admin;

--
-- Name: mortgages_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.mortgages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mortgages_id_seq OWNER TO quro_admin;

--
-- Name: mortgages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.mortgages_id_seq OWNED BY public.mortgages.id;


--
-- Name: net_worth_snapshots; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.net_worth_snapshots (
    id integer NOT NULL,
    user_id integer NOT NULL,
    snapshot_date date NOT NULL,
    base_currency public.currency_code NOT NULL,
    savings numeric(19,2) NOT NULL,
    brokerage numeric(19,2) NOT NULL,
    property_equity numeric(19,2) NOT NULL,
    pension numeric(19,2) NOT NULL,
    liabilities numeric(19,2) NOT NULL,
    total_value numeric(19,2) NOT NULL,
    is_estimated boolean DEFAULT false NOT NULL,
    computed_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.net_worth_snapshots OWNER TO quro_admin;

--
-- Name: net_worth_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.net_worth_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.net_worth_snapshots_id_seq OWNER TO quro_admin;

--
-- Name: net_worth_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.net_worth_snapshots_id_seq OWNED BY public.net_worth_snapshots.id;


--
-- Name: partner_link_members; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.partner_link_members (
    user_id integer NOT NULL,
    link_id integer NOT NULL
);


ALTER TABLE public.partner_link_members OWNER TO quro_admin;

--
-- Name: partner_links; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.partner_links (
    id integer NOT NULL,
    requester_id integer NOT NULL,
    addressee_id integer NOT NULL,
    status public.partner_link_status DEFAULT 'pending'::public.partner_link_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    responded_at timestamp without time zone,
    CONSTRAINT partner_links_no_self_link_check CHECK ((requester_id <> addressee_id))
);


ALTER TABLE public.partner_links OWNER TO quro_admin;

--
-- Name: partner_links_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.partner_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.partner_links_id_seq OWNER TO quro_admin;

--
-- Name: partner_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.partner_links_id_seq OWNED BY public.partner_links.id;


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.payslips (
    id integer NOT NULL,
    user_id integer NOT NULL,
    month text NOT NULL,
    date date NOT NULL,
    gross numeric(19,2) NOT NULL,
    tax numeric(19,2) NOT NULL,
    pension numeric(19,2) NOT NULL,
    net numeric(19,2) NOT NULL,
    bonus numeric(19,2),
    currency public.currency_code DEFAULT 'EUR'::public.currency_code NOT NULL,
    document_storage_key text,
    document_file_name text,
    document_size_bytes integer,
    document_uploaded_at timestamp without time zone,
    employment_id integer,
    CONSTRAINT payslips_document_fields_chk CHECK ((((document_storage_key IS NULL) AND (document_file_name IS NULL) AND (document_size_bytes IS NULL) AND (document_uploaded_at IS NULL)) OR ((document_storage_key IS NOT NULL) AND (document_file_name IS NOT NULL) AND (document_size_bytes IS NOT NULL) AND (document_uploaded_at IS NOT NULL)))),
    CONSTRAINT payslips_document_size_bytes_chk CHECK (((document_size_bytes IS NULL) OR (document_size_bytes > 0)))
);


ALTER TABLE public.payslips OWNER TO quro_admin;

--
-- Name: payslips_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.payslips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payslips_id_seq OWNER TO quro_admin;

--
-- Name: payslips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.payslips_id_seq OWNED BY public.payslips.id;


--
-- Name: pension_pots; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.pension_pots (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    type text NOT NULL,
    balance numeric(19,2) NOT NULL,
    currency public.currency_code NOT NULL,
    employee_monthly numeric(19,2) NOT NULL,
    employer_monthly numeric(19,2) NOT NULL,
    investment_strategy text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    color text,
    emoji text,
    notes text,
    archived_at timestamp without time zone
);


ALTER TABLE public.pension_pots OWNER TO quro_admin;

--
-- Name: pension_pots_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.pension_pots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pension_pots_id_seq OWNER TO quro_admin;

--
-- Name: pension_pots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.pension_pots_id_seq OWNED BY public.pension_pots.id;


--
-- Name: pension_statement_import_rows; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.pension_statement_import_rows (
    id integer NOT NULL,
    import_id integer NOT NULL,
    row_order integer NOT NULL,
    type text NOT NULL,
    amount numeric(19,2) NOT NULL,
    tax_amount numeric(19,2) DEFAULT 0 NOT NULL,
    date date NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    is_employer boolean,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    confidence_label public.pension_import_confidence_label DEFAULT 'low'::public.pension_import_confidence_label NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_derived boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    collision_warning jsonb,
    committed_transaction_id integer,
    edited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pension_statement_import_rows OWNER TO quro_admin;

--
-- Name: pension_statement_import_rows_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.pension_statement_import_rows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pension_statement_import_rows_id_seq OWNER TO quro_admin;

--
-- Name: pension_statement_import_rows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.pension_statement_import_rows_id_seq OWNED BY public.pension_statement_import_rows.id;


--
-- Name: pension_statement_imports; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.pension_statement_imports (
    id integer NOT NULL,
    user_id integer NOT NULL,
    pot_id integer NOT NULL,
    status public.pension_import_status DEFAULT 'queued'::public.pension_import_status NOT NULL,
    storage_key text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    file_hash_sha256 text NOT NULL,
    statement_period_start date,
    statement_period_end date,
    language_hints jsonb DEFAULT '[]'::jsonb NOT NULL,
    model_name text,
    model_version text,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    committed_at timestamp without time zone,
    storage_deleted_at timestamp without time zone
);


ALTER TABLE public.pension_statement_imports OWNER TO quro_admin;

--
-- Name: pension_statement_imports_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.pension_statement_imports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pension_statement_imports_id_seq OWNER TO quro_admin;

--
-- Name: pension_statement_imports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.pension_statement_imports_id_seq OWNED BY public.pension_statement_imports.id;


--
-- Name: pension_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.pension_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    pot_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(19,2) NOT NULL,
    tax_amount numeric(19,2) DEFAULT 0 NOT NULL,
    date date NOT NULL,
    note text,
    is_employer boolean,
    document_storage_key text,
    document_file_name text,
    document_size_bytes integer,
    document_uploaded_at timestamp without time zone,
    CONSTRAINT pension_transactions_document_fields_chk CHECK ((((document_storage_key IS NULL) AND (document_file_name IS NULL) AND (document_size_bytes IS NULL) AND (document_uploaded_at IS NULL)) OR ((document_storage_key IS NOT NULL) AND (document_file_name IS NOT NULL) AND (document_size_bytes IS NOT NULL) AND (document_uploaded_at IS NOT NULL)))),
    CONSTRAINT pension_transactions_document_size_bytes_chk CHECK (((document_size_bytes IS NULL) OR (document_size_bytes > 0)))
);


ALTER TABLE public.pension_transactions OWNER TO quro_admin;

--
-- Name: pension_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.pension_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pension_transactions_id_seq OWNER TO quro_admin;

--
-- Name: pension_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.pension_transactions_id_seq OWNED BY public.pension_transactions.id;


--
-- Name: plan_assumptions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.plan_assumptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    lean_burn_override numeric(19,2),
    emergency_lifestyle_pct numeric(5,4),
    excluded_tiers jsonb,
    count_full_joint_balances boolean,
    benefit_monthly_override numeric(19,2),
    benefit_max_months_override integer,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ww_weekly_requirement text DEFAULT 'unknown'::text NOT NULL,
    ww_duration_months integer,
    ww_duration_confirmed_at date,
    severance_monthly_salary_override numeric(19,2),
    CONSTRAINT plan_assumptions_benefit_monthly_check CHECK (((benefit_monthly_override IS NULL) OR (benefit_monthly_override >= (0)::numeric))),
    CONSTRAINT plan_assumptions_benefit_months_check CHECK (((benefit_max_months_override IS NULL) OR ((benefit_max_months_override >= 0) AND (benefit_max_months_override <= 120)))),
    CONSTRAINT plan_assumptions_lean_burn_check CHECK (((lean_burn_override IS NULL) OR (lean_burn_override >= (0)::numeric))),
    CONSTRAINT plan_assumptions_lifestyle_check CHECK (((emergency_lifestyle_pct IS NULL) OR ((emergency_lifestyle_pct >= (0)::numeric) AND (emergency_lifestyle_pct <= (1)::numeric)))),
    CONSTRAINT plan_assumptions_severance_salary_check CHECK (((severance_monthly_salary_override IS NULL) OR (severance_monthly_salary_override >= (0)::numeric))),
    CONSTRAINT plan_assumptions_ww_duration_months_check CHECK (((ww_duration_months IS NULL) OR ((ww_duration_months >= 0) AND (ww_duration_months <= 24)))),
    CONSTRAINT plan_assumptions_ww_weekly_requirement_check CHECK ((ww_weekly_requirement = ANY (ARRAY['unknown'::text, 'met'::text, 'not_met'::text])))
);


ALTER TABLE public.plan_assumptions OWNER TO quro_admin;

--
-- Name: plan_assumptions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.plan_assumptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plan_assumptions_id_seq OWNER TO quro_admin;

--
-- Name: plan_assumptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.plan_assumptions_id_seq OWNED BY public.plan_assumptions.id;


--
-- Name: properties; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.properties (
    id integer NOT NULL,
    user_id integer NOT NULL,
    address text NOT NULL,
    property_type text NOT NULL,
    purchase_price numeric(19,2) NOT NULL,
    current_value numeric(19,2) NOT NULL,
    mortgage numeric(19,2) NOT NULL,
    mortgage_id integer,
    monthly_rent numeric(19,2) NOT NULL,
    currency public.currency_code NOT NULL,
    emoji text,
    is_joint boolean DEFAULT false NOT NULL,
    archived_at timestamp without time zone
);


ALTER TABLE public.properties OWNER TO quro_admin;

--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.properties_id_seq OWNER TO quro_admin;

--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.properties_id_seq OWNED BY public.properties.id;


--
-- Name: property_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.property_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    property_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(19,2) NOT NULL,
    interest numeric(19,2),
    principal numeric(19,2),
    date date NOT NULL,
    note text
);


ALTER TABLE public.property_transactions OWNER TO quro_admin;

--
-- Name: property_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.property_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.property_transactions_id_seq OWNER TO quro_admin;

--
-- Name: property_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.property_transactions_id_seq OWNED BY public.property_transactions.id;


--
-- Name: savings_accounts; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.savings_accounts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    bank text NOT NULL,
    balance numeric(19,2) NOT NULL,
    currency public.currency_code NOT NULL,
    interest_rate numeric(7,4) NOT NULL,
    account_type text NOT NULL,
    color text,
    emoji text,
    bunq_account_id text,
    archived_at timestamp without time zone,
    is_joint boolean DEFAULT false NOT NULL,
    banking_entity_id text,
    banking_entity_name text,
    deposit_guarantee_scheme text,
    banking_entity_confirmed_at timestamp without time zone,
    deposit_guarantee_cap numeric(19,2),
    deposit_guarantee_currency public.currency_code
);


ALTER TABLE public.savings_accounts OWNER TO quro_admin;

--
-- Name: savings_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.savings_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.savings_accounts_id_seq OWNER TO quro_admin;

--
-- Name: savings_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.savings_accounts_id_seq OWNED BY public.savings_accounts.id;


--
-- Name: savings_transactions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.savings_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    account_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(19,2) NOT NULL,
    date date NOT NULL,
    note text,
    bunq_transaction_id text
);


ALTER TABLE public.savings_transactions OWNER TO quro_admin;

--
-- Name: savings_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.savings_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.savings_transactions_id_seq OWNER TO quro_admin;

--
-- Name: savings_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.savings_transactions_id_seq OWNED BY public.savings_transactions.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO quro_admin;

--
-- Name: stock_exchanges; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.stock_exchanges (
    id integer NOT NULL,
    mic text NOT NULL,
    name text NOT NULL,
    acronym text,
    country text,
    country_code text,
    city text,
    website text
);


ALTER TABLE public.stock_exchanges OWNER TO quro_admin;

--
-- Name: stock_exchanges_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.stock_exchanges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_exchanges_id_seq OWNER TO quro_admin;

--
-- Name: stock_exchanges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.stock_exchanges_id_seq OWNED BY public.stock_exchanges.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    age integer DEFAULT 35 NOT NULL,
    retirement_age integer DEFAULT 67 NOT NULL,
    base_currency public.currency_code DEFAULT 'EUR'::public.currency_code NOT NULL,
    number_format text DEFAULT 'en-US'::text NOT NULL,
    password_hash text NOT NULL,
    password_updated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    jurisdiction text DEFAULT 'GENERIC'::text NOT NULL,
    CONSTRAINT users_age_range_check CHECK (((age >= 16) AND (age <= 100))),
    CONSTRAINT users_jurisdiction_check CHECK ((jurisdiction = ANY (ARRAY['NL'::text, 'AU'::text, 'GENERIC'::text]))),
    CONSTRAINT users_number_format_check CHECK ((number_format = ANY (ARRAY['en-US'::text, 'de-DE'::text]))),
    CONSTRAINT users_retirement_after_age_check CHECK ((retirement_age > age)),
    CONSTRAINT users_retirement_age_range_check CHECK (((retirement_age >= 17) AND (retirement_age <= 80)))
);


ALTER TABLE public.users OWNER TO quro_admin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: quro_admin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO quro_admin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: quro_admin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: worker_heartbeats; Type: TABLE; Schema: public; Owner: quro_admin
--

CREATE TABLE public.worker_heartbeats (
    worker_name text NOT NULL,
    status text NOT NULL,
    last_heartbeat_at timestamp without time zone NOT NULL,
    parser_healthy boolean DEFAULT false NOT NULL,
    parser_checked_at timestamp without time zone,
    parser_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.worker_heartbeats OWNER TO quro_admin;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: quro_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: budget_categories id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_categories ALTER COLUMN id SET DEFAULT nextval('public.budget_categories_id_seq'::regclass);


--
-- Name: budget_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_transactions ALTER COLUMN id SET DEFAULT nextval('public.budget_transactions_id_seq'::regclass);


--
-- Name: bunq_connections id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_connections ALTER COLUMN id SET DEFAULT nextval('public.bunq_connections_id_seq'::regclass);


--
-- Name: bunq_oauth_attempts id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_oauth_attempts ALTER COLUMN id SET DEFAULT nextval('public.bunq_oauth_attempts_id_seq'::regclass);


--
-- Name: bunq_payment_progress id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_payment_progress ALTER COLUMN id SET DEFAULT nextval('public.bunq_payment_progress_id_seq'::regclass);


--
-- Name: category_mappings id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.category_mappings ALTER COLUMN id SET DEFAULT nextval('public.category_mappings_id_seq'::regclass);


--
-- Name: currency_rate_history id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.currency_rate_history ALTER COLUMN id SET DEFAULT nextval('public.currency_rate_history_id_seq'::regclass);


--
-- Name: currency_rates id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.currency_rates ALTER COLUMN id SET DEFAULT nextval('public.currency_rates_id_seq'::regclass);


--
-- Name: debt_payments id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debt_payments ALTER COLUMN id SET DEFAULT nextval('public.debt_payments_id_seq'::regclass);


--
-- Name: debts id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debts ALTER COLUMN id SET DEFAULT nextval('public.debts_id_seq'::regclass);


--
-- Name: employments id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.employments ALTER COLUMN id SET DEFAULT nextval('public.employments_id_seq'::regclass);


--
-- Name: goals id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.goals ALTER COLUMN id SET DEFAULT nextval('public.goals_id_seq'::regclass);


--
-- Name: holding_price_history id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_price_history ALTER COLUMN id SET DEFAULT nextval('public.holding_price_history_id_seq'::regclass);


--
-- Name: holding_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_transactions ALTER COLUMN id SET DEFAULT nextval('public.holding_transactions_id_seq'::regclass);


--
-- Name: holdings id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holdings ALTER COLUMN id SET DEFAULT nextval('public.holdings_id_seq'::regclass);


--
-- Name: mortgage_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgage_transactions ALTER COLUMN id SET DEFAULT nextval('public.mortgage_transactions_id_seq'::regclass);


--
-- Name: mortgages id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgages ALTER COLUMN id SET DEFAULT nextval('public.mortgages_id_seq'::regclass);


--
-- Name: net_worth_snapshots id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.net_worth_snapshots ALTER COLUMN id SET DEFAULT nextval('public.net_worth_snapshots_id_seq'::regclass);


--
-- Name: partner_links id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_links ALTER COLUMN id SET DEFAULT nextval('public.partner_links_id_seq'::regclass);


--
-- Name: payslips id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.payslips ALTER COLUMN id SET DEFAULT nextval('public.payslips_id_seq'::regclass);


--
-- Name: pension_pots id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_pots ALTER COLUMN id SET DEFAULT nextval('public.pension_pots_id_seq'::regclass);


--
-- Name: pension_statement_import_rows id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_import_rows ALTER COLUMN id SET DEFAULT nextval('public.pension_statement_import_rows_id_seq'::regclass);


--
-- Name: pension_statement_imports id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_imports ALTER COLUMN id SET DEFAULT nextval('public.pension_statement_imports_id_seq'::regclass);


--
-- Name: pension_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_transactions ALTER COLUMN id SET DEFAULT nextval('public.pension_transactions_id_seq'::regclass);


--
-- Name: plan_assumptions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.plan_assumptions ALTER COLUMN id SET DEFAULT nextval('public.plan_assumptions_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.properties ALTER COLUMN id SET DEFAULT nextval('public.properties_id_seq'::regclass);


--
-- Name: property_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.property_transactions ALTER COLUMN id SET DEFAULT nextval('public.property_transactions_id_seq'::regclass);


--
-- Name: savings_accounts id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_accounts ALTER COLUMN id SET DEFAULT nextval('public.savings_accounts_id_seq'::regclass);


--
-- Name: savings_transactions id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_transactions ALTER COLUMN id SET DEFAULT nextval('public.savings_transactions_id_seq'::regclass);


--
-- Name: stock_exchanges id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.stock_exchanges ALTER COLUMN id SET DEFAULT nextval('public.stock_exchanges_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: quro_admin
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	9c741faf3343738057dde0e9fe7a1bdcdafeaa543ab6be66fe794b47de55a584	1773599989735
2	eb761887138c1be0881329b455f36adfde078154dc01167ed4d54f25adb935cc	1776008353294
3	5ab6cc6b4daf83a047916b8a19a67adea9d899f0237cb2acb64648b08c655552	1776513398440
4	362fe6e29e9f2d024d6220082ae54b37804c2dfc5d9207e18b1cbe6a22355772	1777720517652
5	91185597aae9d4e4615728aac8bfbcd14c285f9694a5260d10c7441d2eaf53da	1777723817636
6	995a1d794da91a2f86957aecb1724a470d28fd0562d1cc07b7fa7aca6d022773	1777728826632
7	adf539165a43f1848c25eb11a0c2f6181a54a02be06286ffd14fe3b5e8576800	1777730000000
8	e37d28fd6cd96e581e26b37323f6a06b386c316a2e171cc5b24268e46ef4c10e	1777730100000
9	d4210aaf408e0065fb8e2ee63e01c7a608fe8faffad52a0085bd40093fc63678	1777730200000
10	b6bf7f836e9f32d1bedacc4032b5a9901adf356ac28d459701bf254eb9165793	1777730300000
11	3eb45ecf76186bfee2eddb60d862c75f0040d2122dadfb49ef6e3a6a3bfc9b96	1777909802049
12	a2434c101877ffb581e2d8d2b50818c596524e847d03b8fc8e9ccf516b48e0b8	1778006908876
13	d0ac32d36c19b2e9167f6a57604658967dd3e8cc2f3725a85ad41ac5cce1c4d1	1778055650816
14	9031adef6bb289f4137656fdf0b4acf9b45a330442641e314e5a571513d297a0	1778145038929
15	6caff65e47790c98d1c18b2dc74c951d3ca9ddc7bd215ba8cce1b353e4d65a2b	1778257117899
16	84a3e236f66d91aac82627a7ba641b4eac6b5c18c806b4f12dbf5d32cf052c0c	1778259316622
17	3f594730d63dd0459dce0f92b6afc35b4325e2186c115fcf4c7a955159dcff86	1778768294138
18	8131cbdd33abf30641eb33a8c62872430da72e287e2537ad4df688057a7c235e	1781269781667
19	d2ad6784b1a4de3852b795daba9b99fb7c2fddde5bc70c3c13876dbd750cc5dd	1781300474175
20	546d4cb332abd59a5642dcefa0b38355d679a5027e1ab151122de1c227f1a982	1781339672978
21	4b1db14a5e24c56855dbe37340c4c0a828541aeb0f4e6ce1093aa86e09f6fc7e	1781340914675
22	e1aeb69753c2e05e2ba8d27e158d92ed5ab5c4a969f05e306eb508580650328d	1782121341796
23	9c2109466450bfe6c7efd21d5833616f39931e597b7eff0667e993f83324c1b8	1785850859245
24	dee17a8a5c6e920aa9ebdaf758e7ac05e4780203515a158e62da5733886be968	1785936114419
25	d4d2ff5c568dd59b8237645b072247d9cd46548c54f17e56b6f8b8adf8988d5e	1785939498876
26	06cd385129088e81ac181812037f1fd8394ae74ae4f3e19ce6e602168a954a08	1786391941529
27	34b482a05bff8bfd42e7a057f4d821daca561069022ff7712f9c4889f3b753e3	1786465979873
28	2bd37abd7826f787d4ceacbf0e8faaaeaa2f47e4af701b037599e0462c26ed0f	1786472669501
29	96b91e7c996588f42ed911a7ee1dfcfb33da7eec43047e0818e8fbf3623f37c5	1786474185102
30	78f1460483ed741a19c5ea11dd39c7be7785ee6c896dab44cf51490b1d8565e7	1786531731552
31	9ea8b94b8811d449a4b85df690ace32ae8935e63fda1b69fd98046b1416d6301	1790703916622
32	1b6696f78d6991b42d6a0815b4405ae752b2cf177dbdfa3ca9b874987a7ff753	1790934249826
33	69b1731c5371d5f37343dd844d64860a43fff8a81067af581f20bcdfcd859a5d	1790954402088
34	85873b97dae1194f54db21b97e563d109c0cfd99bc66d9291ea5b5015f922295	1790956513644
35	59ccd7432d7ba11f615ae7a05e5fd8ea6f96c79ea5c6c8a20d3f972c5f60806c	1791113527459
36	87477eabbb2013e2dbaeeeaf6fc3a907bb385dbea3b7e9668da8f015608f4183	1791114342964
37	3fad6edfee37d9e6fd562afac08b014edf14ea77d62084eb23a81f4a0e26c5db	1791114700674
38	f85b6f434c7aca69bae55e87d2c4204e95cd2a7e4ca28ab6cdce6aeca7c8389b	1791115215007
\.


--
-- Data for Name: budget_categories; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.budget_categories (id, user_id, name, emoji, budgeted, spent, color, month, year, expense_class, expense_class_confirmed, currency, currency_needs_review) FROM stdin;
1	1	Fun	\N	0.00	0.00	\N	Mar	2026	discretionary	f	EUR	t
2	1	Groceries	🛒	600.00	612.35	#22aa55	Mar	2026	essential	t	EUR	f
3	2	Commute	🚲	120.00	119.99	\N	Feb	2026	employment_linked	t	EUR	f
\.


--
-- Data for Name: budget_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.budget_transactions (id, user_id, category_id, description, amount, date, merchant, bunq_transaction_id, bunq_mcc, bunq_payment_type, counterparty_iban, source_provider, source_account_id, source_account_name, source_account_type, currency, currency_needs_review, source_amount, source_currency) FROM stdin;
1	1	1	Paid in pounds, rate unknown	42.00	2026-03-09	Café Ünïcode	\N	\N	\N	\N	\N	\N	\N	\N	EUR	t	36.00	GBP
2	1	2	Imported from the bank	0.01	2026-03-08	Example Bakery	fixture-bunq-payment-2	5411	MASTERCARD	\N	bunq	fixture-bunq-account-1	Household pot	MonetaryAccountJoint	EUR	f	0.01	USD
3	1	2	Weekly shop	612.34	2026-03-07	Example Market	\N	\N	\N	\N	\N	\N	\N	\N	EUR	f	\N	\N
4	2	3	Refund	-19.99	2026-02-10	Example Rail	\N	\N	\N	\N	\N	\N	\N	\N	EUR	f	\N	\N
\.


--
-- Data for Name: bunq_connections; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.bunq_connections (id, user_id, access_token, bunq_user_id, last_sync_at, sync_status, sync_error, created_at, private_key, installation_token, server_public_key, session_token, session_expires_at, session_id) FROM stdin;
1	1	fixture-placeholder-access-token	fixture-bunq-user	2026-03-08 06:00:00	error	Synthetic sync error ⚠	2026-01-03 12:00:00	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: bunq_oauth_attempts; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.bunq_oauth_attempts (id, state_hash, user_id, destination, expires_at, consumed_at, created_at) FROM stdin;
1	abababababababababababababababababababababababababababababababab	1	savings	2026-01-03 12:10:00	2026-01-03 12:01:00	2026-01-03 12:00:00
\.


--
-- Data for Name: bunq_payment_progress; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.bunq_payment_progress (id, user_id, account_id, kind, newer_than, next_page_url, complete, started_at) FROM stdin;
1	1	2	budget	\N	\N	t	2026-03-08 06:00:00
\.


--
-- Data for Name: category_mappings; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.category_mappings (id, user_id, source, source_key, category_name, created_at) FROM stdin;
1	1	bunq_mcc	5411	Groceries	2026-03-08 10:00:00
\.


--
-- Data for Name: currency_rate_history; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.currency_rate_history (id, from_currency, to_currency, rate, provider, source_date, updated_at) FROM stdin;
1	GBP	EUR	1.180000	seed	2026-03-01	2026-03-01 16:00:00
2	USD	EUR	0.920001	fixture-provider	2026-03-02	2026-03-02 16:00:00
3	SGD	EUR	0.000001	fixture-provider	2026-03-03	2026-03-03 16:00:00
\.


--
-- Data for Name: currency_rates; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.currency_rates (id, from_currency, to_currency, rate, updated_at, provider, source_date) FROM stdin;
1	GBP	EUR	1.180000	2026-03-01 06:00:00	seed	2026-03-01
2	USD	EUR	0.920000	2026-03-01 06:00:00	seed	2026-03-01
3	AUD	EUR	0.580000	2026-03-01 06:00:00	seed	2026-03-01
4	NZD	EUR	0.530000	2026-03-01 06:00:00	seed	2026-03-01
5	CAD	EUR	0.670000	2026-03-01 06:00:00	seed	2026-03-01
6	CHF	EUR	1.040000	2026-03-01 06:00:00	seed	2026-03-01
7	SGD	EUR	0.680000	2026-03-01 06:00:00	seed	2026-03-01
\.


--
-- Data for Name: debt_payments; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.debt_payments (id, user_id, debt_id, date, amount, principal, interest, note) FROM stdin;
1	1	2	2026-03-15	310.00	279.67	30.33	Mars 🚗
2	1	2	2026-02-15	310.00	278.45	31.55	\N
3	2	3	2020-09-01	0.01	0.01	0.00	\N
\.


--
-- Data for Name: debts; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.debts (id, user_id, name, type, lender, original_amount, remaining_balance, currency, interest_rate, monthly_payment, start_date, end_date, color, emoji, notes, archived_at) FROM stdin;
1	1	Open-ended card	credit_card	Voorbeeld Lender	2000.00	1999.99	USD	19.9900	50.00	2024-06-01	\N	#336699	💳	No end date	\N
2	1	Car loan	car_loan	Example Lender	12000.00	7400.55	EUR	5.2500	310.00	2025-01-15	2029-01-15	#336699	💳	\N	\N
3	2	Paid off	student_loan	Example Lender	0.01	0.00	GBP	0.0000	0.00	2010-09-01	2020-09-01	#336699	💳	Archivé	2021-01-01 00:00:00
\.


--
-- Data for Name: employments; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.employments (id, user_id, employer_name, employment_type, service_start_date, end_date, notice_period_months, is_primary, created_at, updated_at) FROM stdin;
1	1	Example Employer B.V.	employed	2020-04-01	\N	1	t	2026-01-01 00:00:00	2026-01-02 00:00:00
2	2	Former Employer Ltd	employed	2015-01-01	2019-12-31	24	f	2026-01-01 00:00:00	2026-01-02 00:00:00
3	2	\N	self_employed	\N	\N	\N	t	2026-01-01 00:00:00	2026-01-02 00:00:00
\.


--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.goals (id, user_id, type, name, emoji, current_amount, target_amount, deadline, year, category, monthly_contribution, monthly_target, months_completed, total_months, unit, color, notes, currency, source_type, source_id, start_month, missed_months) FROM stdin;
1	1	net_worth	Above water	\N	-39999.99	0.00	Dec 2027	\N	Wealth	0.00	\N	\N	\N	\N	\N	Ünïcode goal	EUR	net_worth_total	\N	\N	\N
2	1	savings	Emergency fund	\N	12345.67	20000.00	Dec 2026	2026	Safety	500.00	\N	\N	\N	\N	\N	\N	EUR	savings_account	6	2026-01	["2026-02"]
3	2	annual	Invest monthly	\N	3.00	12.00	Dec 2026	2026	Habit	0.00	100.00	3	12	months	\N	\N	GBP	manual	\N	2026-01	[]
\.


--
-- Data for Name: holding_price_history; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.holding_price_history (id, user_id, holding_id, eod_date, close_price, price_currency, synced_at) FROM stdin;
1	1	2	2026-03-06	101.23	USD	2026-03-06 22:00:00
2	1	2	2026-03-05	100.99	USD	2026-03-05 22:00:00
3	2	3	2026-03-06	99999999.99	GBX	2026-03-06 18:00:00
\.


--
-- Data for Name: holding_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.holding_transactions (id, user_id, holding_id, type, shares, price, date, note) FROM stdin;
1	1	2	dividend	\N	3.21	2026-03-02	\N
2	1	2	sell	0.000001	101.00	2026-02-02	Smallest unit
3	1	2	buy	10.123456	99.10	2026-01-02	\N
4	2	3	buy	1.000000	99999999.99	2026-01-05	\N
\.


--
-- Data for Name: holdings; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.holdings (id, user_id, name, ticker, current_price, currency, sector, item_type, exchange_mic, industry, price_updated_at, manual_price, exclude_from_sync, archived_at) FROM stdin;
1	1	Hand-priced fund	FIXH	0.01	EUR	Other	fund	\N	Ünïndustry	\N	0.01	t	\N
2	1	Example World ETF	FIXW	101.23	USD	Diversified	etf	XFIX	\N	2026-03-06 21:00:00	\N	f	\N
3	2	Pound stock	FIXP	99999999.99	GBP	Financials	equity	XFIX	Banks	2026-03-06 17:30:00	\N	f	\N
\.


--
-- Data for Name: mortgage_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.mortgage_transactions (id, user_id, mortgage_id, type, amount, interest, principal, date, note, fixed_years) FROM stdin;
1	1	1	rate_change	3.95	\N	\N	2026-01-01	\N	5.5
2	1	1	valuation	350000.00	\N	\N	2026-01-01	Market fell	\N
3	1	1	repayment	1850.25	1283.33	566.92	2026-03-01	\N	\N
\.


--
-- Data for Name: mortgages; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.mortgages (id, user_id, property_address, lender, currency, original_amount, outstanding_balance, property_value, monthly_payment, interest_rate, rate_type, fixed_until, term_years, start_date, end_date, overpayment_limit, archived_at, is_joint, repayment_type) FROM stdin;
1	1	1 Example Street, Exampleville	Example Mortgages	EUR	400000.00	389999.99	350000.00	1850.25	3.9500	Fixed	2031-06	30	2021-06	2051-06	0.10	\N	t	Annuity
2	3	Unit 2, 例え通り	Example Mortgages	AUD	500000.00	120000.00	900000.00	2100.00	6.1000	Variable	\N	25	2015-01	2040-01	\N	\N	f	Linear
\.


--
-- Data for Name: net_worth_snapshots; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.net_worth_snapshots (id, user_id, snapshot_date, base_currency, savings, brokerage, property_equity, pension, liabilities, total_value, is_estimated, computed_at) FROM stdin;
1	1	2026-03-31	EUR	9999999999999.99	0.00	0.00	0.00	0.00	9999999999999.99	t	2026-04-01 00:05:00
2	1	2026-02-28	EUR	10000.00	1000.00	-39999.99	54321.09	9400.54	15920.56	f	2026-03-01 00:05:00
3	2	2026-03-31	GBP	-0.01	0.00	0.00	0.00	0.00	-0.01	t	2026-04-01 00:05:00
\.


--
-- Data for Name: partner_link_members; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.partner_link_members (user_id, link_id) FROM stdin;
1	1
3	2
2	1
4	2
\.


--
-- Data for Name: partner_links; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.partner_links (id, requester_id, addressee_id, status, created_at, responded_at) FROM stdin;
1	1	2	accepted	2026-01-10 10:00:00	2026-01-11 11:00:00
2	3	4	pending	2026-02-02 12:00:00	\N
\.


--
-- Data for Name: payslips; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.payslips (id, user_id, month, date, gross, tax, pension, net, bonus, currency, document_storage_key, document_file_name, document_size_bytes, document_uploaded_at, employment_id) FROM stdin;
1	1	Feb 2026	2026-02-25	4200.00	1260.00	210.00	3729.99	999.99	EUR	\N	\N	\N	\N	1
4	3	Mar 2026	2026-03-31	0.01	0.00	0.00	0.01	\N	AUD	\N	\N	\N	\N	\N
2	1	Mar 2026	2026-03-25	4200.00	1260.00	210.00	2730.00	\N	EUR	users/1/salary/payslips/2/00000000-0000-4000-8000-00000000f001.pdf	payslip_2026-03.pdf	730	2026-03-26 07:00:00	1
3	2	Feb 2026	2026-02-28	3100.55	620.11	0.00	2480.44	0.00	GBP	users/2/salary/payslips/3/00000000-0000-4000-8000-00000000f002.pdf	Gehaltsabrechnung_M_rz_2026.pdf	733	2026-03-01 07:00:00	3
\.


--
-- Data for Name: pension_pots; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.pension_pots (id, user_id, name, provider, type, balance, currency, employee_monthly, employer_monthly, investment_strategy, metadata, color, emoji, notes, archived_at) FROM stdin;
1	1	Workplace pot	Example Pensions	Workplace Pension	54321.09	EUR	250.00	250.00	Lifecycle	{"plan": "A-1", "tags": ["x", "ü"], "nested": {"n": 1.50, "ok": true, "none": null}}	\N	\N	\N	\N
2	2	Empty pot	Example Pensions	Personal Pension	0.00	GBP	0.00	0.00	\N	{}	\N	\N	Leer – vide – 空	\N
3	3	Super	Example Super	Other	-1.00	AUD	0.00	0.00	\N	{"note": "negative after fees"}	\N	\N	\N	\N
\.


--
-- Data for Name: pension_statement_import_rows; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.pension_statement_import_rows (id, import_id, row_order, type, amount, tax_amount, date, note, is_employer, confidence, confidence_label, evidence, is_derived, is_deleted, collision_warning, committed_transaction_id, edited_at, created_at, updated_at) FROM stdin;
1	1	1	contribution	100.00	0.00	2024-06-30	Dropped duplicate	t	0.4000	low	{}	t	t	{"reason": "duplicate of an existing row"}	\N	2025-02-01 10:04:00	2025-02-01 10:00:00	2025-02-01 10:05:00
2	1	0	annual_statement	48210.77	0.00	2024-12-31	Statement 2024 (imported)	\N	0.9876	high	{"page": 1, "text": "Saldo per 31-12-2024"}	f	f	\N	5	\N	2025-02-01 10:00:00	2025-02-01 10:05:00
3	2	0	annual_statement	56000.00	0.00	2025-12-31	Pending review ✓	\N	0.7500	medium	{"page": 2}	f	f	\N	\N	\N	2026-03-30 10:00:00	2026-03-30 10:02:00
\.


--
-- Data for Name: pension_statement_imports; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.pension_statement_imports (id, user_id, pot_id, status, storage_key, file_name, mime_type, size_bytes, file_hash_sha256, statement_period_start, statement_period_end, language_hints, model_name, model_version, error_message, created_at, updated_at, expires_at, committed_at, storage_deleted_at) FROM stdin;
1	1	1	committed	users/1/pensions/1/imports/00000000-0000-4000-8000-00000000f004.pdf	statement_2024.pdf	application/pdf	722	e0050475a038ed1e825eecf71cb113b5a65db9055f708056bac524b0c4bceb78	2024-01-01	2024-12-31	["nl", "en"]	fixture-model	1.0	\N	2025-02-01 10:00:00	2025-02-01 10:05:00	2025-02-08 10:00:00	2025-02-01 10:05:00	\N
2	1	1	ready_for_review	users/1/pensions/1/imports/00000000-0000-4000-8000-00000000f005.pdf	statement_2026.pdf	application/pdf	725	6b63d0646e27af5057262d64012c76570a660e319215fb54f8dfed39fe3e3b5b	\N	\N	[]	fixture-model	\N	\N	2026-03-30 10:00:00	2026-03-30 10:02:00	2099-04-06 10:00:00	\N	\N
3	1	1	expired	users/1/pensions/1/imports/00000000-0000-4000-8000-00000000f006.pdf	statement_2023.pdf	application/pdf	726	2cb0154cda4c449f9d1d734dfa8f30a8bcd475f2ca1288fea913f82735cee6fb	\N	\N	["de"]	\N	\N	Draft expired after retention period	2025-01-01 10:00:00	2025-01-08 03:00:00	2025-01-08 10:00:00	\N	2025-01-08 03:00:00
\.


--
-- Data for Name: pension_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.pension_transactions (id, user_id, pot_id, type, amount, tax_amount, date, note, is_employer, document_storage_key, document_file_name, document_size_bytes, document_uploaded_at) FROM stdin;
2	1	1	fee	-12.50	0.00	2026-03-31	Platform fee	\N	\N	\N	\N	\N
3	1	1	contribution	250.00	0.00	2026-03-25	\N	t	\N	\N	\N	\N
4	1	1	contribution	250.00	0.00	2026-03-25	\N	f	\N	\N	\N	\N
1	1	1	annual_statement	53833.59	0.00	2025-12-31	Statement 2025 uploaded by hand	\N	users/1/pensions/1/annual-statements/1/00000000-0000-4000-8000-00000000f003.pdf	annual-statement_2025.pdf	716	2026-01-20 18:45:00
5	1	1	annual_statement	48210.77	0.00	2024-12-31	Statement 2024 (imported)	\N	users/1/pensions/1/imports/00000000-0000-4000-8000-00000000f004.pdf	statement_2024.pdf	722	2025-02-01 10:05:00
\.


--
-- Data for Name: plan_assumptions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.plan_assumptions (id, user_id, lean_burn_override, emergency_lifestyle_pct, excluded_tiers, count_full_joint_balances, benefit_monthly_override, benefit_max_months_override, updated_at, ww_weekly_requirement, ww_duration_months, ww_duration_confirmed_at, severance_monthly_salary_override) FROM stdin;
1	1	1999.99	0.7500	["pension"]	t	0.00	0	2026-03-01 00:00:00	met	24	2026-02-01	4200.00
2	2	\N	\N	\N	\N	\N	\N	2026-03-01 00:00:00	unknown	\N	\N	\N
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.properties (id, user_id, address, property_type, purchase_price, current_value, mortgage, mortgage_id, monthly_rent, currency, emoji, is_joint, archived_at) FROM stdin;
1	1	1 Example Street, Exampleville	Apartment	420000.00	350000.00	389999.99	1	0.00	EUR	🏢	t	\N
2	3	Unit 2, 例え通り	House	600000.00	900000.00	120000.00	2	1500.00	AUD	\N	f	\N
\.


--
-- Data for Name: property_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.property_transactions (id, user_id, property_id, type, amount, interest, principal, date, note) FROM stdin;
1	1	1	valuation	350000.00	\N	\N	2026-01-01	\N
2	3	2	expense	-320.50	\N	\N	2026-03-05	Repairs 🔧
3	3	2	rent_income	1500.00	\N	\N	2026-03-01	\N
\.


--
-- Data for Name: savings_accounts; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.savings_accounts (id, user_id, name, bank, balance, currency, interest_rate, account_type, color, emoji, bunq_account_id, archived_at, is_joint, banking_entity_id, banking_entity_name, deposit_guarantee_scheme, banking_entity_confirmed_at, deposit_guarantee_cap, deposit_guarantee_currency) FROM stdin;
1	1	Gamma ☂ élan	Example Bank	0.00	CHF	0.0100	Term Deposit	#aa0000	\N	\N	2026-01-02 03:04:05	f	\N	\N	\N	\N	\N	\N
2	1	Household pot	Voorbeeld Bank	0.01	USD	4.5000	Easy Access	\N	🏠	fixture-bunq-account-1	\N	t	\N	\N	\N	\N	\N	\N
3	1	Overdrawn	Example Bank	-250.10	GBP	0.0000	Easy Access	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
4	1	Everyday	Example Bank	9999999999999.99	EUR	0.0125	Easy Access	#336699	🏦	\N	\N	f	example-bank-eu	Example Bank N.V.	Example DGS	2026-01-15 12:00:00	100000.00	EUR
5	2	Private stash	Example Bank	500.00	NZD	3.2500	Term Deposit	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
6	2	Joint rainy day	Example Bank	12345.67	EUR	2.0000	Easy Access	\N	\N	\N	\N	t	\N	\N	\N	\N	\N	\N
7	3	Loonie	Example Bank	-0.01	CAD	0.0000	Easy Access	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
8	3	Только тест	Example Bank	777.70	AUD	0.0001	Easy Access	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
9	4	Singapore	Example Bank	1000000.00	SGD	1.0000	Easy Access	\N	\N	\N	\N	f	\N	\N	\N	\N	75000.00	SGD
\.


--
-- Data for Name: savings_transactions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.savings_transactions (id, user_id, account_id, type, amount, date, note, bunq_transaction_id) FROM stdin;
1	1	2	interest	0.00	2026-03-31		\N
2	1	2	deposit	0.01	2026-03-31	\N	fixture-bunq-payment-1
3	1	3	withdrawal	-250.10	2026-03-03	Fees	\N
4	1	4	withdrawal	-12.34	2026-03-02	\N	\N
5	1	4	deposit	1000.00	2026-03-01	Opening ☕	\N
6	2	6	deposit	12345.67	2024-02-29	Leap day 🐸	\N
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.sessions (id, user_id, expires_at, created_at) FROM stdin;
fixture-session-token-demo-0002-expired	1	2026-01-01 00:00:00	2025-12-01 08:00:00
fixture-session-token-demo-0001	1	2099-01-01 00:00:00	2026-03-01 08:00:00
fixture-session-token-partner-0001	2	2099-01-01 00:00:00	2026-03-02 09:15:30.123456
\.


--
-- Data for Name: stock_exchanges; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.stock_exchanges (id, mic, name, acronym, country, country_code, city, website) FROM stdin;
1	XFIX	Fixture Exchange	\N	Nowhere	ZZ	\N	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.users (id, first_name, last_name, email, location, age, retirement_age, base_currency, number_format, password_hash, password_updated_at, created_at, jurisdiction) FROM stdin;
1	Demo	User	demo@quro.local		35	67	EUR	en-US	$2b$10$c/d6grWjZeBHKgZrGnq7VOGynq4687CiDZBBbFEVUoennbkqNBlXm	\N	2025-10-01 08:00:00	GENERIC
2	Partner	Fixture	partner@example.invalid	Zürich ☃	41	66	GBP	de-DE	$2b$10$c/d6grWjZeBHKgZrGnq7VOGynq4687CiDZBBbFEVUoennbkqNBlXm	2026-01-05 08:00:00	2025-11-01 09:30:00	NL
3	Solo	Fixture-Ñandú 測試	solo@example.invalid		16	17	AUD	en-US	$2b$10$c/d6grWjZeBHKgZrGnq7VOGynq4687CiDZBBbFEVUoennbkqNBlXm	\N	2025-12-24 23:59:59.999999	AU
4	Invitee	Fixture	invitee@example.invalid	Example Town	79	80	CHF	en-US	$2b$10$c/d6grWjZeBHKgZrGnq7VOGynq4687CiDZBBbFEVUoennbkqNBlXm	\N	2026-02-01 00:00:00	GENERIC
\.


--
-- Data for Name: worker_heartbeats; Type: TABLE DATA; Schema: public; Owner: quro_admin
--

COPY public.worker_heartbeats (worker_name, status, last_heartbeat_at, parser_healthy, parser_checked_at, parser_error, created_at, updated_at) FROM stdin;
pension-import-worker	idle	2026-03-30 10:02:00	f	2026-03-30 10:01:00	Synthetic parser error	2026-01-01 00:00:00	2026-03-30 10:02:00
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: quro_admin
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 38, true);


--
-- Name: budget_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.budget_categories_id_seq', 3, true);


--
-- Name: budget_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.budget_transactions_id_seq', 4, true);


--
-- Name: bunq_connections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.bunq_connections_id_seq', 1, true);


--
-- Name: bunq_oauth_attempts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.bunq_oauth_attempts_id_seq', 1, true);


--
-- Name: bunq_payment_progress_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.bunq_payment_progress_id_seq', 1, true);


--
-- Name: category_mappings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.category_mappings_id_seq', 1, true);


--
-- Name: currency_rate_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.currency_rate_history_id_seq', 3, true);


--
-- Name: currency_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.currency_rates_id_seq', 7, true);


--
-- Name: debt_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.debt_payments_id_seq', 3, true);


--
-- Name: debts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.debts_id_seq', 3, true);


--
-- Name: employments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.employments_id_seq', 3, true);


--
-- Name: goals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.goals_id_seq', 3, true);


--
-- Name: holding_price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.holding_price_history_id_seq', 3, true);


--
-- Name: holding_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.holding_transactions_id_seq', 4, true);


--
-- Name: holdings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.holdings_id_seq', 3, true);


--
-- Name: mortgage_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.mortgage_transactions_id_seq', 3, true);


--
-- Name: mortgages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.mortgages_id_seq', 2, true);


--
-- Name: net_worth_snapshots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.net_worth_snapshots_id_seq', 3, true);


--
-- Name: partner_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.partner_links_id_seq', 2, true);


--
-- Name: payslips_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.payslips_id_seq', 4, true);


--
-- Name: pension_pots_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.pension_pots_id_seq', 3, true);


--
-- Name: pension_statement_import_rows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.pension_statement_import_rows_id_seq', 3, true);


--
-- Name: pension_statement_imports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.pension_statement_imports_id_seq', 3, true);


--
-- Name: pension_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.pension_transactions_id_seq', 5, true);


--
-- Name: plan_assumptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.plan_assumptions_id_seq', 2, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.properties_id_seq', 2, true);


--
-- Name: property_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.property_transactions_id_seq', 3, true);


--
-- Name: savings_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.savings_accounts_id_seq', 9, true);


--
-- Name: savings_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.savings_transactions_id_seq', 6, true);


--
-- Name: stock_exchanges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.stock_exchanges_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: quro_admin
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: quro_admin
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: budget_categories budget_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_categories
    ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id);


--
-- Name: budget_transactions budget_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_transactions
    ADD CONSTRAINT budget_transactions_pkey PRIMARY KEY (id);


--
-- Name: bunq_connections bunq_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_connections
    ADD CONSTRAINT bunq_connections_pkey PRIMARY KEY (id);


--
-- Name: bunq_oauth_attempts bunq_oauth_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_oauth_attempts
    ADD CONSTRAINT bunq_oauth_attempts_pkey PRIMARY KEY (id);


--
-- Name: bunq_payment_progress bunq_payment_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_payment_progress
    ADD CONSTRAINT bunq_payment_progress_pkey PRIMARY KEY (id);


--
-- Name: category_mappings category_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.category_mappings
    ADD CONSTRAINT category_mappings_pkey PRIMARY KEY (id);


--
-- Name: currency_rate_history currency_rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.currency_rate_history
    ADD CONSTRAINT currency_rate_history_pkey PRIMARY KEY (id);


--
-- Name: currency_rates currency_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_pkey PRIMARY KEY (id);


--
-- Name: debt_payments debt_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_pkey PRIMARY KEY (id);


--
-- Name: debts debts_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);


--
-- Name: employments employments_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.employments
    ADD CONSTRAINT employments_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: holding_price_history holding_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_price_history
    ADD CONSTRAINT holding_price_history_pkey PRIMARY KEY (id);


--
-- Name: holding_transactions holding_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_transactions
    ADD CONSTRAINT holding_transactions_pkey PRIMARY KEY (id);


--
-- Name: holdings holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holdings
    ADD CONSTRAINT holdings_pkey PRIMARY KEY (id);


--
-- Name: mortgage_transactions mortgage_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgage_transactions
    ADD CONSTRAINT mortgage_transactions_pkey PRIMARY KEY (id);


--
-- Name: mortgages mortgages_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgages
    ADD CONSTRAINT mortgages_pkey PRIMARY KEY (id);


--
-- Name: net_worth_snapshots net_worth_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.net_worth_snapshots
    ADD CONSTRAINT net_worth_snapshots_pkey PRIMARY KEY (id);


--
-- Name: partner_link_members partner_link_members_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_link_members
    ADD CONSTRAINT partner_link_members_pkey PRIMARY KEY (user_id);


--
-- Name: partner_links partner_links_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_links
    ADD CONSTRAINT partner_links_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: pension_pots pension_pots_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_pots
    ADD CONSTRAINT pension_pots_pkey PRIMARY KEY (id);


--
-- Name: pension_statement_import_rows pension_statement_import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_import_rows
    ADD CONSTRAINT pension_statement_import_rows_pkey PRIMARY KEY (id);


--
-- Name: pension_statement_imports pension_statement_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_imports
    ADD CONSTRAINT pension_statement_imports_pkey PRIMARY KEY (id);


--
-- Name: pension_transactions pension_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_transactions
    ADD CONSTRAINT pension_transactions_pkey PRIMARY KEY (id);


--
-- Name: plan_assumptions plan_assumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.plan_assumptions
    ADD CONSTRAINT plan_assumptions_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_transactions property_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.property_transactions
    ADD CONSTRAINT property_transactions_pkey PRIMARY KEY (id);


--
-- Name: savings_accounts savings_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_accounts
    ADD CONSTRAINT savings_accounts_pkey PRIMARY KEY (id);


--
-- Name: savings_transactions savings_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: stock_exchanges stock_exchanges_mic_unique; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.stock_exchanges
    ADD CONSTRAINT stock_exchanges_mic_unique UNIQUE (mic);


--
-- Name: stock_exchanges stock_exchanges_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.stock_exchanges
    ADD CONSTRAINT stock_exchanges_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worker_heartbeats worker_heartbeats_pkey; Type: CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.worker_heartbeats
    ADD CONSTRAINT worker_heartbeats_pkey PRIMARY KEY (worker_name);


--
-- Name: budget_categories_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX budget_categories_user_id_idx ON public.budget_categories USING btree (user_id);


--
-- Name: budget_categories_user_month_name_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX budget_categories_user_month_name_unique ON public.budget_categories USING btree (user_id, month, year, name);


--
-- Name: budget_transactions_user_bunq_transaction_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX budget_transactions_user_bunq_transaction_id_unique ON public.budget_transactions USING btree (user_id, bunq_transaction_id);


--
-- Name: budget_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX budget_transactions_user_date_idx ON public.budget_transactions USING btree (user_id, date);


--
-- Name: budget_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX budget_transactions_user_id_idx ON public.budget_transactions USING btree (user_id);


--
-- Name: bunq_connections_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX bunq_connections_user_id_idx ON public.bunq_connections USING btree (user_id);


--
-- Name: bunq_oauth_attempts_expires_at_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX bunq_oauth_attempts_expires_at_idx ON public.bunq_oauth_attempts USING btree (expires_at);


--
-- Name: bunq_oauth_attempts_state_hash_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX bunq_oauth_attempts_state_hash_idx ON public.bunq_oauth_attempts USING btree (state_hash);


--
-- Name: bunq_payment_progress_account_kind_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX bunq_payment_progress_account_kind_unique ON public.bunq_payment_progress USING btree (user_id, account_id, kind);


--
-- Name: category_mappings_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX category_mappings_user_id_idx ON public.category_mappings USING btree (user_id);


--
-- Name: category_mappings_user_source_key_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX category_mappings_user_source_key_unique ON public.category_mappings USING btree (user_id, source, source_key);


--
-- Name: currency_rate_history_from_to_date_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX currency_rate_history_from_to_date_unique ON public.currency_rate_history USING btree (from_currency, to_currency, source_date);


--
-- Name: currency_rate_history_source_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX currency_rate_history_source_date_idx ON public.currency_rate_history USING btree (source_date);


--
-- Name: currency_rates_from_to_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX currency_rates_from_to_unique ON public.currency_rates USING btree (from_currency, to_currency);


--
-- Name: debt_payments_debt_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX debt_payments_debt_id_idx ON public.debt_payments USING btree (debt_id);


--
-- Name: debt_payments_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX debt_payments_user_date_idx ON public.debt_payments USING btree (user_id, date);


--
-- Name: debt_payments_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX debt_payments_user_id_idx ON public.debt_payments USING btree (user_id);


--
-- Name: debts_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX debts_user_id_idx ON public.debts USING btree (user_id);


--
-- Name: employments_primary_user_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX employments_primary_user_unique ON public.employments USING btree (user_id) WHERE (is_primary = true);


--
-- Name: employments_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX employments_user_id_idx ON public.employments USING btree (user_id);


--
-- Name: goals_source_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX goals_source_idx ON public.goals USING btree (source_type, source_id);


--
-- Name: goals_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX goals_user_id_idx ON public.goals USING btree (user_id);


--
-- Name: holding_price_history_holding_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holding_price_history_holding_date_idx ON public.holding_price_history USING btree (holding_id, eod_date);


--
-- Name: holding_price_history_holding_date_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX holding_price_history_holding_date_unique ON public.holding_price_history USING btree (holding_id, eod_date);


--
-- Name: holding_price_history_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holding_price_history_user_date_idx ON public.holding_price_history USING btree (user_id, eod_date);


--
-- Name: holding_transactions_holding_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holding_transactions_holding_date_idx ON public.holding_transactions USING btree (holding_id, date);


--
-- Name: holding_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holding_transactions_user_date_idx ON public.holding_transactions USING btree (user_id, date);


--
-- Name: holding_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holding_transactions_user_id_idx ON public.holding_transactions USING btree (user_id);


--
-- Name: holdings_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX holdings_user_id_idx ON public.holdings USING btree (user_id);


--
-- Name: mortgage_transactions_mortgage_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX mortgage_transactions_mortgage_id_idx ON public.mortgage_transactions USING btree (mortgage_id);


--
-- Name: mortgage_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX mortgage_transactions_user_date_idx ON public.mortgage_transactions USING btree (user_id, date);


--
-- Name: mortgage_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX mortgage_transactions_user_id_idx ON public.mortgage_transactions USING btree (user_id);


--
-- Name: mortgages_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX mortgages_user_id_idx ON public.mortgages USING btree (user_id);


--
-- Name: net_worth_snapshots_user_date_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX net_worth_snapshots_user_date_unique ON public.net_worth_snapshots USING btree (user_id, snapshot_date);


--
-- Name: net_worth_snapshots_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX net_worth_snapshots_user_id_idx ON public.net_worth_snapshots USING btree (user_id);


--
-- Name: partner_links_addressee_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX partner_links_addressee_id_unique ON public.partner_links USING btree (addressee_id);


--
-- Name: partner_links_pair_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX partner_links_pair_unique ON public.partner_links USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));


--
-- Name: partner_links_requester_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX partner_links_requester_id_unique ON public.partner_links USING btree (requester_id);


--
-- Name: payslips_employment_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX payslips_employment_id_idx ON public.payslips USING btree (employment_id);


--
-- Name: payslips_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX payslips_user_date_idx ON public.payslips USING btree (user_id, date);


--
-- Name: payslips_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX payslips_user_id_idx ON public.payslips USING btree (user_id);


--
-- Name: pension_pots_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_pots_user_id_idx ON public.pension_pots USING btree (user_id);


--
-- Name: pension_statement_import_rows_committed_txn_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_import_rows_committed_txn_idx ON public.pension_statement_import_rows USING btree (committed_transaction_id);


--
-- Name: pension_statement_import_rows_import_deleted_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_import_rows_import_deleted_idx ON public.pension_statement_import_rows USING btree (import_id, is_deleted);


--
-- Name: pension_statement_import_rows_import_order_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_import_rows_import_order_idx ON public.pension_statement_import_rows USING btree (import_id, row_order);


--
-- Name: pension_statement_imports_expiry_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_imports_expiry_idx ON public.pension_statement_imports USING btree (expires_at) WHERE ((status = ANY (ARRAY['queued'::public.pension_import_status, 'processing'::public.pension_import_status, 'ready_for_review'::public.pension_import_status, 'expired'::public.pension_import_status])) AND (storage_deleted_at IS NULL));


--
-- Name: pension_statement_imports_hash_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_imports_hash_idx ON public.pension_statement_imports USING btree (file_hash_sha256);


--
-- Name: pension_statement_imports_pot_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_imports_pot_id_idx ON public.pension_statement_imports USING btree (pot_id);


--
-- Name: pension_statement_imports_queued_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_imports_queued_idx ON public.pension_statement_imports USING btree (created_at, id) WHERE (status = 'queued'::public.pension_import_status);


--
-- Name: pension_statement_imports_user_status_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_statement_imports_user_status_idx ON public.pension_statement_imports USING btree (user_id, status, created_at);


--
-- Name: pension_transactions_pot_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_transactions_pot_date_idx ON public.pension_transactions USING btree (pot_id, date);


--
-- Name: pension_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_transactions_user_date_idx ON public.pension_transactions USING btree (user_id, date);


--
-- Name: pension_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX pension_transactions_user_id_idx ON public.pension_transactions USING btree (user_id);


--
-- Name: plan_assumptions_user_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX plan_assumptions_user_id_unique ON public.plan_assumptions USING btree (user_id);


--
-- Name: properties_mortgage_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX properties_mortgage_id_idx ON public.properties USING btree (mortgage_id);


--
-- Name: properties_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX properties_user_id_idx ON public.properties USING btree (user_id);


--
-- Name: property_transactions_property_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX property_transactions_property_id_idx ON public.property_transactions USING btree (property_id);


--
-- Name: property_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX property_transactions_user_date_idx ON public.property_transactions USING btree (user_id, date);


--
-- Name: property_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX property_transactions_user_id_idx ON public.property_transactions USING btree (user_id);


--
-- Name: savings_accounts_user_bunq_account_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX savings_accounts_user_bunq_account_id_unique ON public.savings_accounts USING btree (user_id, bunq_account_id);


--
-- Name: savings_accounts_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX savings_accounts_user_id_idx ON public.savings_accounts USING btree (user_id);


--
-- Name: savings_transactions_account_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX savings_transactions_account_id_idx ON public.savings_transactions USING btree (account_id);


--
-- Name: savings_transactions_user_bunq_transaction_id_unique; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE UNIQUE INDEX savings_transactions_user_bunq_transaction_id_unique ON public.savings_transactions USING btree (user_id, bunq_transaction_id);


--
-- Name: savings_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX savings_transactions_user_date_idx ON public.savings_transactions USING btree (user_id, date);


--
-- Name: savings_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX savings_transactions_user_id_idx ON public.savings_transactions USING btree (user_id);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: quro_admin
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: budget_categories budget_categories_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_categories
    ADD CONSTRAINT budget_categories_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: budget_transactions budget_transactions_category_id_budget_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_transactions
    ADD CONSTRAINT budget_transactions_category_id_budget_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.budget_categories(id);


--
-- Name: budget_transactions budget_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.budget_transactions
    ADD CONSTRAINT budget_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bunq_connections bunq_connections_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_connections
    ADD CONSTRAINT bunq_connections_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bunq_oauth_attempts bunq_oauth_attempts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_oauth_attempts
    ADD CONSTRAINT bunq_oauth_attempts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bunq_payment_progress bunq_payment_progress_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.bunq_payment_progress
    ADD CONSTRAINT bunq_payment_progress_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: category_mappings category_mappings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.category_mappings
    ADD CONSTRAINT category_mappings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: debt_payments debt_payments_debt_id_debts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_debt_id_debts_id_fk FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;


--
-- Name: debt_payments debt_payments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: debts debts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: employments employments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.employments
    ADD CONSTRAINT employments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: goals goals_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: holding_price_history holding_price_history_holding_id_holdings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_price_history
    ADD CONSTRAINT holding_price_history_holding_id_holdings_id_fk FOREIGN KEY (holding_id) REFERENCES public.holdings(id) ON DELETE CASCADE;


--
-- Name: holding_price_history holding_price_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_price_history
    ADD CONSTRAINT holding_price_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: holding_transactions holding_transactions_holding_id_holdings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_transactions
    ADD CONSTRAINT holding_transactions_holding_id_holdings_id_fk FOREIGN KEY (holding_id) REFERENCES public.holdings(id) ON DELETE CASCADE;


--
-- Name: holding_transactions holding_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holding_transactions
    ADD CONSTRAINT holding_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: holdings holdings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.holdings
    ADD CONSTRAINT holdings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mortgage_transactions mortgage_transactions_mortgage_id_mortgages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgage_transactions
    ADD CONSTRAINT mortgage_transactions_mortgage_id_mortgages_id_fk FOREIGN KEY (mortgage_id) REFERENCES public.mortgages(id) ON DELETE CASCADE;


--
-- Name: mortgage_transactions mortgage_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgage_transactions
    ADD CONSTRAINT mortgage_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mortgages mortgages_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.mortgages
    ADD CONSTRAINT mortgages_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: net_worth_snapshots net_worth_snapshots_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.net_worth_snapshots
    ADD CONSTRAINT net_worth_snapshots_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: partner_link_members partner_link_members_link_id_partner_links_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_link_members
    ADD CONSTRAINT partner_link_members_link_id_partner_links_id_fk FOREIGN KEY (link_id) REFERENCES public.partner_links(id) ON DELETE CASCADE;


--
-- Name: partner_link_members partner_link_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_link_members
    ADD CONSTRAINT partner_link_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: partner_links partner_links_addressee_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_links
    ADD CONSTRAINT partner_links_addressee_id_users_id_fk FOREIGN KEY (addressee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: partner_links partner_links_requester_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.partner_links
    ADD CONSTRAINT partner_links_requester_id_users_id_fk FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payslips payslips_employment_id_employments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employment_id_employments_id_fk FOREIGN KEY (employment_id) REFERENCES public.employments(id) ON DELETE SET NULL;


--
-- Name: payslips payslips_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: pension_pots pension_pots_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_pots
    ADD CONSTRAINT pension_pots_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: pension_statement_import_rows pension_statement_import_rows_committed_transaction_id_pension_; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_import_rows
    ADD CONSTRAINT pension_statement_import_rows_committed_transaction_id_pension_ FOREIGN KEY (committed_transaction_id) REFERENCES public.pension_transactions(id) ON DELETE SET NULL;


--
-- Name: pension_statement_import_rows pension_statement_import_rows_import_id_pension_statement_impor; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_import_rows
    ADD CONSTRAINT pension_statement_import_rows_import_id_pension_statement_impor FOREIGN KEY (import_id) REFERENCES public.pension_statement_imports(id) ON DELETE CASCADE;


--
-- Name: pension_statement_imports pension_statement_imports_pot_id_pension_pots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_imports
    ADD CONSTRAINT pension_statement_imports_pot_id_pension_pots_id_fk FOREIGN KEY (pot_id) REFERENCES public.pension_pots(id) ON DELETE CASCADE;


--
-- Name: pension_statement_imports pension_statement_imports_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_statement_imports
    ADD CONSTRAINT pension_statement_imports_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pension_transactions pension_transactions_pot_id_pension_pots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_transactions
    ADD CONSTRAINT pension_transactions_pot_id_pension_pots_id_fk FOREIGN KEY (pot_id) REFERENCES public.pension_pots(id) ON DELETE CASCADE;


--
-- Name: pension_transactions pension_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.pension_transactions
    ADD CONSTRAINT pension_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: plan_assumptions plan_assumptions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.plan_assumptions
    ADD CONSTRAINT plan_assumptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: properties properties_mortgage_id_mortgages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_mortgage_id_mortgages_id_fk FOREIGN KEY (mortgage_id) REFERENCES public.mortgages(id) ON DELETE SET NULL;


--
-- Name: properties properties_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: property_transactions property_transactions_property_id_properties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.property_transactions
    ADD CONSTRAINT property_transactions_property_id_properties_id_fk FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_transactions property_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.property_transactions
    ADD CONSTRAINT property_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: savings_accounts savings_accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_accounts
    ADD CONSTRAINT savings_accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: savings_transactions savings_transactions_account_id_savings_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_account_id_savings_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.savings_accounts(id) ON DELETE CASCADE;


--
-- Name: savings_transactions savings_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: quro_admin
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO quro_app;


--
-- Name: TABLE budget_categories; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.budget_categories TO quro_app;


--
-- Name: SEQUENCE budget_categories_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.budget_categories_id_seq TO quro_app;


--
-- Name: TABLE budget_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.budget_transactions TO quro_app;


--
-- Name: SEQUENCE budget_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.budget_transactions_id_seq TO quro_app;


--
-- Name: TABLE bunq_connections; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bunq_connections TO quro_app;


--
-- Name: SEQUENCE bunq_connections_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.bunq_connections_id_seq TO quro_app;


--
-- Name: TABLE bunq_oauth_attempts; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bunq_oauth_attempts TO quro_app;


--
-- Name: SEQUENCE bunq_oauth_attempts_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.bunq_oauth_attempts_id_seq TO quro_app;


--
-- Name: TABLE bunq_payment_progress; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bunq_payment_progress TO quro_app;


--
-- Name: SEQUENCE bunq_payment_progress_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.bunq_payment_progress_id_seq TO quro_app;


--
-- Name: TABLE category_mappings; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.category_mappings TO quro_app;


--
-- Name: SEQUENCE category_mappings_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.category_mappings_id_seq TO quro_app;


--
-- Name: TABLE currency_rate_history; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.currency_rate_history TO quro_app;


--
-- Name: SEQUENCE currency_rate_history_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.currency_rate_history_id_seq TO quro_app;


--
-- Name: TABLE currency_rates; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.currency_rates TO quro_app;


--
-- Name: SEQUENCE currency_rates_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.currency_rates_id_seq TO quro_app;


--
-- Name: TABLE debt_payments; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.debt_payments TO quro_app;


--
-- Name: SEQUENCE debt_payments_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.debt_payments_id_seq TO quro_app;


--
-- Name: TABLE debts; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.debts TO quro_app;


--
-- Name: SEQUENCE debts_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.debts_id_seq TO quro_app;


--
-- Name: TABLE employments; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employments TO quro_app;


--
-- Name: SEQUENCE employments_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.employments_id_seq TO quro_app;


--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goals TO quro_app;


--
-- Name: SEQUENCE goals_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.goals_id_seq TO quro_app;


--
-- Name: TABLE holding_price_history; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holding_price_history TO quro_app;


--
-- Name: SEQUENCE holding_price_history_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.holding_price_history_id_seq TO quro_app;


--
-- Name: TABLE holding_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holding_transactions TO quro_app;


--
-- Name: SEQUENCE holding_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.holding_transactions_id_seq TO quro_app;


--
-- Name: TABLE holdings; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.holdings TO quro_app;


--
-- Name: SEQUENCE holdings_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.holdings_id_seq TO quro_app;


--
-- Name: TABLE mortgage_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mortgage_transactions TO quro_app;


--
-- Name: SEQUENCE mortgage_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.mortgage_transactions_id_seq TO quro_app;


--
-- Name: TABLE mortgages; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mortgages TO quro_app;


--
-- Name: SEQUENCE mortgages_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.mortgages_id_seq TO quro_app;


--
-- Name: TABLE net_worth_snapshots; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.net_worth_snapshots TO quro_app;


--
-- Name: SEQUENCE net_worth_snapshots_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.net_worth_snapshots_id_seq TO quro_app;


--
-- Name: TABLE partner_link_members; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.partner_link_members TO quro_app;


--
-- Name: TABLE partner_links; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.partner_links TO quro_app;


--
-- Name: SEQUENCE partner_links_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.partner_links_id_seq TO quro_app;


--
-- Name: TABLE payslips; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payslips TO quro_app;


--
-- Name: SEQUENCE payslips_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.payslips_id_seq TO quro_app;


--
-- Name: TABLE pension_pots; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pension_pots TO quro_app;


--
-- Name: SEQUENCE pension_pots_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.pension_pots_id_seq TO quro_app;


--
-- Name: TABLE pension_statement_import_rows; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pension_statement_import_rows TO quro_app;


--
-- Name: SEQUENCE pension_statement_import_rows_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.pension_statement_import_rows_id_seq TO quro_app;


--
-- Name: TABLE pension_statement_imports; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pension_statement_imports TO quro_app;


--
-- Name: SEQUENCE pension_statement_imports_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.pension_statement_imports_id_seq TO quro_app;


--
-- Name: TABLE pension_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pension_transactions TO quro_app;


--
-- Name: SEQUENCE pension_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.pension_transactions_id_seq TO quro_app;


--
-- Name: TABLE plan_assumptions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.plan_assumptions TO quro_app;


--
-- Name: SEQUENCE plan_assumptions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.plan_assumptions_id_seq TO quro_app;


--
-- Name: TABLE properties; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.properties TO quro_app;


--
-- Name: SEQUENCE properties_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.properties_id_seq TO quro_app;


--
-- Name: TABLE property_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.property_transactions TO quro_app;


--
-- Name: SEQUENCE property_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.property_transactions_id_seq TO quro_app;


--
-- Name: TABLE savings_accounts; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.savings_accounts TO quro_app;


--
-- Name: SEQUENCE savings_accounts_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.savings_accounts_id_seq TO quro_app;


--
-- Name: TABLE savings_transactions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.savings_transactions TO quro_app;


--
-- Name: SEQUENCE savings_transactions_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.savings_transactions_id_seq TO quro_app;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sessions TO quro_app;


--
-- Name: TABLE stock_exchanges; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stock_exchanges TO quro_app;


--
-- Name: SEQUENCE stock_exchanges_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.stock_exchanges_id_seq TO quro_app;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO quro_app;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,USAGE ON SEQUENCE public.users_id_seq TO quro_app;


--
-- Name: TABLE worker_heartbeats; Type: ACL; Schema: public; Owner: quro_admin
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.worker_heartbeats TO quro_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: quro_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE quro_admin IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO quro_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: quro_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE quro_admin IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO quro_app;


--
-- PostgreSQL database dump complete
--

\unrestrict quroUpgradeFixture070

