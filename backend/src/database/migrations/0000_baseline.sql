--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

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
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    razao_social character varying NOT NULL,
    cnpj character varying,
    email character varying,
    tel character varying,
    endereco character varying,
    bairro character varying,
    cidade character varying,
    uf character varying(2),
    cep character varying,
    contato character varying,
    inscricao_estadual character varying,
    suframa character varying,
    pgt_padrao character varying,
    prazo character varying,
    local_entrega character varying,
    observacao text,
    transportadora_id integer
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: comissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comissoes (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    cliente_id integer,
    fornecedor_id integer,
    numero_pedido character varying,
    numero_nfe character varying,
    data_pedido date,
    data_faturamento date,
    valor_pedido numeric(12,2),
    valor_faturado numeric(12,2),
    perc_comissao numeric(5,2),
    valor_comissao numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    status character varying DEFAULT 'pendente'::character varying NOT NULL
);


--
-- Name: comissoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comissoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comissoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comissoes_id_seq OWNED BY public.comissoes.id;


--
-- Name: financeiro_movimentacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_movimentacao (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    tipo character varying NOT NULL,
    valor numeric(10,2) NOT NULL,
    data date,
    descricao character varying
);


--
-- Name: financeiro_movimentacao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financeiro_movimentacao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financeiro_movimentacao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financeiro_movimentacao_id_seq OWNED BY public.financeiro_movimentacao.id;


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fornecedores (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    razao_social character varying NOT NULL,
    cnpj character varying
);


--
-- Name: fornecedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fornecedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fornecedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fornecedores_id_seq OWNED BY public.fornecedores.id;


--
-- Name: inadimplencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inadimplencia (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    cliente_id integer,
    empresa_devedora character varying,
    valor_aberto numeric(10,2),
    observacao text
);


--
-- Name: inadimplencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inadimplencia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inadimplencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inadimplencia_id_seq OWNED BY public.inadimplencia.id;


--
-- Name: itens_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itens_pedido (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    pedido_id integer NOT NULL,
    produto_id integer,
    codigo_manual character varying,
    descricao_manual character varying,
    qtd_caixas numeric(10,3),
    qtd_unitaria numeric(10,3),
    preco_unitario numeric(10,2),
    desconto_perc numeric(5,2),
    total_item numeric(10,2)
);


--
-- Name: itens_pedido_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.itens_pedido_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: itens_pedido_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.itens_pedido_id_seq OWNED BY public.itens_pedido.id;


--
-- Name: local_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_users (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    role_id integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: local_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.local_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: local_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.local_users_id_seq OWNED BY public.local_users.id;


--
-- Name: mobile_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_sessions (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    user_uuid uuid NOT NULL,
    token_version integer DEFAULT 1 NOT NULL,
    device_info character varying(255),
    last_seen_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: mobile_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mobile_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mobile_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mobile_sessions_id_seq OWNED BY public.mobile_sessions.id;


--
-- Name: parceiros_comerciais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_comerciais (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    nome_parceiro character varying NOT NULL,
    empresa_parceiro character varying,
    cliente_id integer,
    fornecedor_id integer,
    numero_pedido character varying,
    numero_nfe character varying,
    data_pedido date NOT NULL,
    data_faturamento date,
    valor_pedido numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    valor_faturado numeric(12,2),
    percentual_comissao numeric(5,2) DEFAULT '50'::numeric NOT NULL,
    valor_comissao numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    status character varying DEFAULT 'pendente'::character varying NOT NULL
);


--
-- Name: parceiros_comerciais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parceiros_comerciais_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parceiros_comerciais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parceiros_comerciais_id_seq OWNED BY public.parceiros_comerciais.id;


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    numero_pedido integer,
    cliente_id integer,
    vendedor_id integer,
    fornecedor_id integer,
    transportadora_id integer,
    data date,
    status character varying DEFAULT 'em_aberto'::character varying NOT NULL,
    total_sem_imposto numeric(10,2),
    total_com_imposto numeric(10,2),
    pgt character varying,
    prazo character varying,
    local_entrega character varying,
    observacao text
);


--
-- Name: pedidos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_id_seq OWNED BY public.pedidos.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    module character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    fornecedor_id integer,
    codigo character varying,
    descricao character varying NOT NULL,
    preco_base numeric(10,2)
);


--
-- Name: produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.produtos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: produtos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.produtos_id_seq OWNED BY public.produtos.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    token_hash text NOT NULL,
    user_id bigint NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_id bigint,
    user_agent text,
    ip inet
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: tenant_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_role_permissions (
    id integer NOT NULL,
    role_id integer NOT NULL,
    permission_slug character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_role_permissions_id_seq OWNED BY public.tenant_role_permissions.id;


--
-- Name: tenant_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_roles (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone
);


--
-- Name: tenant_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_roles_id_seq OWNED BY public.tenant_roles.id;


--
-- Name: transportadoras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportadoras (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    razao_social character varying NOT NULL,
    cnpj character varying,
    telefone character varying,
    endereco_completo text
);


--
-- Name: transportadoras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transportadoras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transportadoras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transportadoras_id_seq OWNED BY public.transportadoras.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    email character varying(255) NOT NULL,
    nome character varying(255) NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    senha_hash text,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: comissoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes ALTER COLUMN id SET DEFAULT nextval('public.comissoes_id_seq'::regclass);


--
-- Name: financeiro_movimentacao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_movimentacao ALTER COLUMN id SET DEFAULT nextval('public.financeiro_movimentacao_id_seq'::regclass);


--
-- Name: fornecedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores ALTER COLUMN id SET DEFAULT nextval('public.fornecedores_id_seq'::regclass);


--
-- Name: inadimplencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inadimplencia ALTER COLUMN id SET DEFAULT nextval('public.inadimplencia_id_seq'::regclass);


--
-- Name: itens_pedido id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido ALTER COLUMN id SET DEFAULT nextval('public.itens_pedido_id_seq'::regclass);


--
-- Name: local_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users ALTER COLUMN id SET DEFAULT nextval('public.local_users_id_seq'::regclass);


--
-- Name: mobile_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_sessions ALTER COLUMN id SET DEFAULT nextval('public.mobile_sessions_id_seq'::regclass);


--
-- Name: parceiros_comerciais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_comerciais ALTER COLUMN id SET DEFAULT nextval('public.parceiros_comerciais_id_seq'::regclass);


--
-- Name: pedidos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN id SET DEFAULT nextval('public.pedidos_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: produtos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos ALTER COLUMN id SET DEFAULT nextval('public.produtos_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: tenant_role_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_role_permissions ALTER COLUMN id SET DEFAULT nextval('public.tenant_role_permissions_id_seq'::regclass);


--
-- Name: tenant_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles ALTER COLUMN id SET DEFAULT nextval('public.tenant_roles_id_seq'::regclass);


--
-- Name: transportadoras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportadoras ALTER COLUMN id SET DEFAULT nextval('public.transportadoras_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: transportadoras PK_2f7deb20d07520bf7182d06d519; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportadoras
    ADD CONSTRAINT "PK_2f7deb20d07520bf7182d06d519" PRIMARY KEY (id);


--
-- Name: itens_pedido PK_34ba752329a604381e367c431ff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT "PK_34ba752329a604381e367c431ff" PRIMARY KEY (id);


--
-- Name: mobile_sessions PK_537a7a1184c701135569a9635b6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_sessions
    ADD CONSTRAINT "PK_537a7a1184c701135569a9635b6" PRIMARY KEY (id);


--
-- Name: tenant_role_permissions PK_682ea931a4019338c82323599a9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_role_permissions
    ADD CONSTRAINT "PK_682ea931a4019338c82323599a9" PRIMARY KEY (id);


--
-- Name: fornecedores PK_6ba3f90e4a18a597d11b763fc02; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT "PK_6ba3f90e4a18a597d11b763fc02" PRIMARY KEY (id);


--
-- Name: local_users PK_74915811a47fe9b3d4b6eaa0874; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT "PK_74915811a47fe9b3d4b6eaa0874" PRIMARY KEY (id);


--
-- Name: refresh_tokens PK_7d8bee0204106019488c4c50ffa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id);


--
-- Name: comissoes PK_84e366b43e8a1cb12958fe8ce0b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT "PK_84e366b43e8a1cb12958fe8ce0b" PRIMARY KEY (id);


--
-- Name: permissions PK_920331560282b8bd21bb02290df; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY (id);


--
-- Name: tenant_roles PK_98d05ed42de335d3521c86e6569; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT "PK_98d05ed42de335d3521c86e6569" PRIMARY KEY (id);


--
-- Name: produtos PK_a5d976312809192261ed96174f3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT "PK_a5d976312809192261ed96174f3" PRIMARY KEY (id);


--
-- Name: financeiro_movimentacao PK_a6176d2de5d3788f8f9e85d891b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_movimentacao
    ADD CONSTRAINT "PK_a6176d2de5d3788f8f9e85d891b" PRIMARY KEY (id);


--
-- Name: parceiros_comerciais PK_b1b26eab806edcba9feb62e010d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_comerciais
    ADD CONSTRAINT "PK_b1b26eab806edcba9feb62e010d" PRIMARY KEY (id);


--
-- Name: inadimplencia PK_d60bb9f7613f1bf0c59f45e471a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inadimplencia
    ADD CONSTRAINT "PK_d60bb9f7613f1bf0c59f45e471a" PRIMARY KEY (id);


--
-- Name: usuarios PK_d7281c63c176e152e4c531594a8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY (id);


--
-- Name: clientes PK_d76bf3571d906e4e86470482c08; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY (id);


--
-- Name: pedidos PK_ebb5680ed29a24efdc586846725; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "PK_ebb5680ed29a24efdc586846725" PRIMARY KEY (id);


--
-- Name: local_users UQ_0110516512ce40844ed64414fb4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT "UQ_0110516512ce40844ed64414fb4" UNIQUE (auth_user_id, tenant_id);


--
-- Name: tenant_role_permissions UQ_46a5709120690ca37b81b877ce1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_role_permissions
    ADD CONSTRAINT "UQ_46a5709120690ca37b81b877ce1" UNIQUE (role_id, permission_slug);


--
-- Name: tenant_roles UQ_5ce9009d305dfb90272653e0b53; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT "UQ_5ce9009d305dfb90272653e0b53" UNIQUE (tenant_id, name);


--
-- Name: IDX_16297e90baab8d6a365179d083; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_16297e90baab8d6a365179d083" ON public.comissoes USING btree (tenant_id, status);


--
-- Name: IDX_1653ae6e1578e8d2563f963b60; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1653ae6e1578e8d2563f963b60" ON public.parceiros_comerciais USING btree (tenant_id, updated_at);


--
-- Name: IDX_16cc1a5063d65b527d433cb280; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_16cc1a5063d65b527d433cb280" ON public.transportadoras USING btree (tenant_id, uuid);


--
-- Name: IDX_19fc13562fb217179dc63fb4a2; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_19fc13562fb217179dc63fb4a2" ON public.pedidos USING btree (tenant_id, numero_pedido) WHERE (numero_pedido IS NOT NULL);


--
-- Name: IDX_231b87cdc9e1a0368f29730b78; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_231b87cdc9e1a0368f29730b78" ON public.produtos USING btree (tenant_id, uuid);


--
-- Name: IDX_26150ce32a6fbd3fd0ceb3fcd6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_26150ce32a6fbd3fd0ceb3fcd6" ON public.tenant_role_permissions USING btree (permission_slug);


--
-- Name: IDX_2d7c130a633ba2ce19c243c357; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_2d7c130a633ba2ce19c243c357" ON public.pedidos USING btree (tenant_id, uuid);


--
-- Name: IDX_310013e29155fd6d4fb39585f0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_310013e29155fd6d4fb39585f0" ON public.itens_pedido USING btree (tenant_id, pedido_id);


--
-- Name: IDX_3ddc983c5f7bcf132fd8732c3f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON public.refresh_tokens USING btree (user_id);


--
-- Name: IDX_41bd328ad585d73bf5d5ed7430; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_41bd328ad585d73bf5d5ed7430" ON public.tenant_roles USING btree (tenant_id);


--
-- Name: IDX_446adfc18b35418aac32ae0b7b; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_446adfc18b35418aac32ae0b7b" ON public.usuarios USING btree (email);


--
-- Name: IDX_46be52372753c99ba5f687cea9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_46be52372753c99ba5f687cea9" ON public.local_users USING btree (tenant_id);


--
-- Name: IDX_4b112ce91f3cfd9f77be5463ac; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4b112ce91f3cfd9f77be5463ac" ON public.produtos USING btree (tenant_id, deleted_at);


--
-- Name: IDX_4fd2d2e637c56044b7cf3388f4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4fd2d2e637c56044b7cf3388f4" ON public.fornecedores USING btree (tenant_id, updated_at);


--
-- Name: IDX_54302178a406ec212675494791; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_54302178a406ec212675494791" ON public.pedidos USING btree (tenant_id, data);


--
-- Name: IDX_55966e4745aa4f8609f9d70116; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_55966e4745aa4f8609f9d70116" ON public.financeiro_movimentacao USING btree (tenant_id, updated_at);


--
-- Name: IDX_575bca8859dc1fd804ee95fed6; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_575bca8859dc1fd804ee95fed6" ON public.clientes USING btree (tenant_id, uuid);


--
-- Name: IDX_5c7c16f0e25e07325a8e65fdd1; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_5c7c16f0e25e07325a8e65fdd1" ON public.parceiros_comerciais USING btree (tenant_id, uuid);


--
-- Name: IDX_68780b457b79f7fb6b14e89219; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_68780b457b79f7fb6b14e89219" ON public.comissoes USING btree (tenant_id, data_pedido);


--
-- Name: IDX_6c1045a7875f28f53bb3549f8e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6c1045a7875f28f53bb3549f8e" ON public.itens_pedido USING btree (tenant_id, deleted_at);


--
-- Name: IDX_6c7da470ee0c6104d392f524ef; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6c7da470ee0c6104d392f524ef" ON public.inadimplencia USING btree (tenant_id, cliente_id);


--
-- Name: IDX_6e1a76341f15f72376518b436d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6e1a76341f15f72376518b436d" ON public.tenant_role_permissions USING btree (role_id);


--
-- Name: IDX_6e994378364db806ff24c2b3b2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6e994378364db806ff24c2b3b2" ON public.inadimplencia USING btree (tenant_id, updated_at);


--
-- Name: IDX_7639d02ad3fe0a2afc0a499ddd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7639d02ad3fe0a2afc0a499ddd" ON public.tenant_roles USING btree (tenant_id, active);


--
-- Name: IDX_7710a6b813a193a1eeff93427c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7710a6b813a193a1eeff93427c" ON public.clientes USING btree (tenant_id, deleted_at);


--
-- Name: IDX_785419d351922b9fc3fbe2df87; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_785419d351922b9fc3fbe2df87" ON public.parceiros_comerciais USING btree (tenant_id, deleted_at);


--
-- Name: IDX_81287b262c52a4dec9bb850896; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_81287b262c52a4dec9bb850896" ON public.transportadoras USING btree (tenant_id, deleted_at);


--
-- Name: IDX_86b27e03f2c6cf37904a5d39ac; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_86b27e03f2c6cf37904a5d39ac" ON public.financeiro_movimentacao USING btree (tenant_id, deleted_at);


--
-- Name: IDX_8b0480ef5c9e6f22d79c4ea9be; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8b0480ef5c9e6f22d79c4ea9be" ON public.mobile_sessions USING btree (tenant_id, user_uuid);


--
-- Name: IDX_8e630fb186af1e34f4cb2756f3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8e630fb186af1e34f4cb2756f3" ON public.comissoes USING btree (tenant_id, deleted_at);


--
-- Name: IDX_94b8b90e379cc3e9684a856993; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_94b8b90e379cc3e9684a856993" ON public.produtos USING btree (tenant_id, updated_at);


--
-- Name: IDX_9af724b30e9545f2bfe0e68344; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9af724b30e9545f2bfe0e68344" ON public.fornecedores USING btree (tenant_id, deleted_at);


--
-- Name: IDX_a0bbf159a42db072333702b754; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a0bbf159a42db072333702b754" ON public.pedidos USING btree (tenant_id, updated_at);


--
-- Name: IDX_a49b7048731ee8aed1f2f45390; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a49b7048731ee8aed1f2f45390" ON public.local_users USING btree (tenant_id, role_id);


--
-- Name: IDX_a52a4ce5afcf29f097a2411e18; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a52a4ce5afcf29f097a2411e18" ON public.comissoes USING btree (tenant_id, updated_at);


--
-- Name: IDX_a635008331ca3edbd0660e3961; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a635008331ca3edbd0660e3961" ON public.transportadoras USING btree (tenant_id, updated_at);


--
-- Name: IDX_a7838d2ba25be1342091b6695f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a7838d2ba25be1342091b6695f" ON public.refresh_tokens USING btree (token_hash);


--
-- Name: IDX_acd60a61b365711b4c034710e3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_acd60a61b365711b4c034710e3" ON public.inadimplencia USING btree (tenant_id, deleted_at);


--
-- Name: IDX_ad3a95a4d977117b3188484662; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_ad3a95a4d977117b3188484662" ON public.usuarios USING btree (tenant_id, uuid);


--
-- Name: IDX_b9902ae131997887b62b53e3a9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b9902ae131997887b62b53e3a9" ON public.clientes USING btree (tenant_id, updated_at);


--
-- Name: IDX_c62b1ed65ef717e158c63fb6c7; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_c62b1ed65ef717e158c63fb6c7" ON public.fornecedores USING btree (tenant_id, uuid);


--
-- Name: IDX_c75272e95ec5e276f79d5a2c76; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_c75272e95ec5e276f79d5a2c76" ON public.financeiro_movimentacao USING btree (tenant_id, uuid);


--
-- Name: IDX_cc9ec95d2f21d48f32c1fcddb7; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_cc9ec95d2f21d48f32c1fcddb7" ON public.itens_pedido USING btree (tenant_id, uuid);


--
-- Name: IDX_d03520a2a9675ecc78d508c37f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d03520a2a9675ecc78d508c37f" ON public.pedidos USING btree (tenant_id, status);


--
-- Name: IDX_d090ad82a0e97ce764c06c7b31; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_d090ad82a0e97ce764c06c7b31" ON public.permissions USING btree (slug);


--
-- Name: IDX_d5e27da0cd39bc3bb2811fc8ba; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d5e27da0cd39bc3bb2811fc8ba" ON public.refresh_tokens USING btree (family_id);


--
-- Name: IDX_e32ff54d7dc7fe2269a7084216; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_e32ff54d7dc7fe2269a7084216" ON public.inadimplencia USING btree (tenant_id, uuid);


--
-- Name: IDX_eb8200583fd9d6936c43b596f3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_eb8200583fd9d6936c43b596f3" ON public.itens_pedido USING btree (tenant_id, updated_at);


--
-- Name: IDX_eedb670ebaf8bcba647b2b89c2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_eedb670ebaf8bcba647b2b89c2" ON public.local_users USING btree (tenant_id, active);


--
-- Name: IDX_f00ebf7bfbcd1b0f1352649dc8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f00ebf7bfbcd1b0f1352649dc8" ON public.comissoes USING btree (tenant_id, fornecedor_id);


--
-- Name: IDX_f607875a617f2c53df48bbda9f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f607875a617f2c53df48bbda9f" ON public.parceiros_comerciais USING btree (tenant_id, nome_parceiro);


--
-- Name: IDX_fdee84142bea932d4e6ecee061; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_fdee84142bea932d4e6ecee061" ON public.comissoes USING btree (tenant_id, uuid);


--
-- Name: pedidos FK_0d7f665cd56b2a35aa814bd52cb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "FK_0d7f665cd56b2a35aa814bd52cb" FOREIGN KEY (transportadora_id) REFERENCES public.transportadoras(id);


--
-- Name: tenant_role_permissions FK_26150ce32a6fbd3fd0ceb3fcd69; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_role_permissions
    ADD CONSTRAINT "FK_26150ce32a6fbd3fd0ceb3fcd69" FOREIGN KEY (permission_slug) REFERENCES public.permissions(slug) ON DELETE CASCADE;


--
-- Name: local_users FK_2ebf8a66a6d3a91d4746ef6faf0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT "FK_2ebf8a66a6d3a91d4746ef6faf0" FOREIGN KEY (role_id) REFERENCES public.tenant_roles(id);


--
-- Name: pedidos FK_2fc639de84f845569ac2c9f78aa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "FK_2fc639de84f845569ac2c9f78aa" FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: pedidos FK_463ae49639acff27ec8c57f5c73; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT "FK_463ae49639acff27ec8c57f5c73" FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: itens_pedido FK_4857bab44b0ffd40ac76c2d89c8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT "FK_4857bab44b0ffd40ac76c2d89c8" FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id);


--
-- Name: itens_pedido FK_62858ad64cfe45434e204e01fe6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT "FK_62858ad64cfe45434e204e01fe6" FOREIGN KEY (produto_id) REFERENCES public.produtos(id);


--
-- Name: clientes FK_690100f49091bdc480d125ae4b8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT "FK_690100f49091bdc480d125ae4b8" FOREIGN KEY (transportadora_id) REFERENCES public.transportadoras(id);


--
-- Name: tenant_role_permissions FK_6e1a76341f15f72376518b436db; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_role_permissions
    ADD CONSTRAINT "FK_6e1a76341f15f72376518b436db" FOREIGN KEY (role_id) REFERENCES public.tenant_roles(id) ON DELETE CASCADE;


--
-- Name: inadimplencia FK_811d75802dfe2c6c2b237f208c2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inadimplencia
    ADD CONSTRAINT "FK_811d75802dfe2c6c2b237f208c2" FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: comissoes FK_aee663f0595d70faffbb58b8eb8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT "FK_aee663f0595d70faffbb58b8eb8" FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: parceiros_comerciais FK_bd4a726aa379a5bd98979843a9a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_comerciais
    ADD CONSTRAINT "FK_bd4a726aa379a5bd98979843a9a" FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: produtos FK_bf02e978c9c151004dc44882eda; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT "FK_bf02e978c9c151004dc44882eda" FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- Name: comissoes FK_eba30b4bab77a13a298d8b20f4e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comissoes
    ADD CONSTRAINT "FK_eba30b4bab77a13a298d8b20f4e" FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: parceiros_comerciais FK_f5707d7cbd9e53052a56a11678d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_comerciais
    ADD CONSTRAINT "FK_f5707d7cbd9e53052a56a11678d" FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id);


--
-- PostgreSQL database dump complete
--

-- Sequence de negócio usada pelo sync para números de pedido.
CREATE SEQUENCE IF NOT EXISTS public.pedidos_numero_seq START WITH 1;

-- Catálogo inicial de permissões. Papéis por tenant são cadastrados pela aplicação.
INSERT INTO public.permissions (slug, description, module) VALUES
  ('clientes.ver', 'Visualizar clientes', 'clientes'),
  ('clientes.criar', 'Criar clientes', 'clientes'),
  ('clientes.editar', 'Editar clientes', 'clientes'),
  ('clientes.deletar', 'Remover clientes', 'clientes'),
  ('pedidos.ver', 'Visualizar pedidos', 'pedidos'),
  ('pedidos.criar', 'Criar pedidos', 'pedidos'),
  ('pedidos.editar', 'Editar pedidos', 'pedidos'),
  ('pedidos.deletar', 'Remover pedidos', 'pedidos'),
  ('produtos.ver', 'Visualizar produtos', 'produtos'),
  ('produtos.criar', 'Criar produtos', 'produtos'),
  ('produtos.editar', 'Editar produtos', 'produtos'),
  ('produtos.deletar', 'Remover produtos', 'produtos'),
  ('fornecedores.ver', 'Visualizar fornecedores', 'fornecedores'),
  ('fornecedores.criar', 'Criar fornecedores', 'fornecedores'),
  ('fornecedores.editar', 'Editar fornecedores', 'fornecedores'),
  ('fornecedores.deletar', 'Remover fornecedores', 'fornecedores'),
  ('transportadoras.ver', 'Visualizar transportadoras', 'transportadoras'),
  ('transportadoras.criar', 'Criar transportadoras', 'transportadoras'),
  ('transportadoras.editar', 'Editar transportadoras', 'transportadoras'),
  ('transportadoras.deletar', 'Remover transportadoras', 'transportadoras'),
  ('financeiro.ver', 'Visualizar dados financeiros', 'financeiro'),
  ('financeiro.editar', 'Alterar dados financeiros', 'financeiro'),
  ('usuarios.gerenciar', 'Gerenciar usuários e acessos', 'usuarios')
ON CONFLICT (slug) DO NOTHING;
