import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  nome: string;
  roles: string[];
  tenantId: string;
  tenantSubdomain: string;
  plan: string;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface Endereco {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
}

export interface Client {
  id: number;
  uuid: string;
  tenant_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Endereco | null;
  observacoes: string | null;
  is_active: boolean;
  limite_credito: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'RASCUNHO'
  | 'ENVIADO'
  | 'CONFIRMADO'
  | 'FATURADO'
  | 'CANCELADO';

export interface OrderItem {
  uuid: string;
  produto: Product;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  valor_total: number;
}

export interface Order {
  uuid: string;
  numero_pedido: number;
  cliente: Client;
  status: OrderStatus;
  data_pedido: string;
  data_entrega_prevista: string | null;
  valor_total: number;
  desconto_total: number;
  itens: OrderItem[];
  created_at: string;
  updated_at: string;
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export interface Product {
  uuid: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
  preco_venda: number;
  preco_custo: number | null;
  estoque_atual: number;
  estoque_minimo: number | null;
  is_active: boolean;
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

export type MovimentacaoTipo = 'RECEITA' | 'DESPESA';
export type MovimentacaoStatus = 'PENDENTE' | 'PAGO' | 'CANCELADO' | 'ATRASADO';

export interface FinanceMovement {
  uuid: string;
  tipo: MovimentacaoTipo;
  status: MovimentacaoStatus;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente: Client | null;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  data: T;
}

// ─── Zod schemas para formulários ────────────────────────────────────────────

export const clientSchema = z.object({
  razao_social: z.string().min(1, 'Campo obrigatório').max(255),
  nome_fantasia: z.string().max(255).optional(),
  cnpj_cpf: z.string().max(20).optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().max(30).optional(),
  limite_credito: z.number().min(0).optional(),
  observacoes: z.string().optional(),
});

export type ClientFormData = z.infer<typeof clientSchema>;
