import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  roles: string[];
  tenantId: string;
  permissions: string[];
  // Campos legados opcionais; autorização usa permissions retornadas por /auth/me.
  plan?: string;
  defaultRole?: string;
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export interface Client {
  id: number;
  uuid: string;
  tenant_id: string;
  razao_social: string;
  cnpj: string | null;
  email: string | null;
  tel: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  contato: string | null;
  inscricao_estadual: string | null;
  suframa: string | null;
  pgt_padrao: string | null;
  prazo: string | null;
  local_entrega: string | null;
  observacao: string | null;
  transportadora_id: number | null;
  transportadora?: Transport | null;
  created_at: string;
  updated_at: string;
}

/** Resposta normalizada da consulta de CNPJ (BrasilAPI) — `inscricao_estadual` é sempre `null`. */
export interface CnpjLookupResult {
  razao_social: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  inscricao_estadual: null;
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type OrderStatus = 'em_aberto' | 'liberado' | 'parcialmente_faturado' | 'faturado' | 'cancelado';

export interface OrderItem {
  uuid: string;
  pedido_id: number;
  produto_id: number | null;
  /** Presente somente quando a API resolve o join (ex.: GET /pedidos/:uuid). */
  produto?: Product | null;
  codigo_manual: string | null;
  descricao_manual: string | null;
  qtd_caixas: string | null;
  qtd_unitaria: string | null;
  qtd_total: string | null;
  preco_unitario: string | null;
  desconto_perc: string | null;
  valor_com_desconto: string | null;
  ipi_perc: string | null;
  valor_com_imposto: string | null;
  total_item: string | null;
  total_com_imposto: string | null;
}

export interface Order {
  uuid: string;
  version: number;
  numero_pedido: number | null;
  cliente_id: number | null;
  vendedor_id: number | null;
  fornecedor_id: number | null;
  transportadora_id: number | null;
  /** Presente somente quando a API resolve o join (ex.: GET /pedidos/:uuid). */
  cliente?: Client | null;
  vendedor?: { uuid: string; nome: string; email: string } | null;
  fornecedor?: Supplier | null;
  transportadora?: Transport | null;
  data: string | null;
  status: OrderStatus;
  total_sem_imposto: string | null;
  total_com_imposto: string | null;
  pgt: string | null;
  prazo: string | null;
  local_entrega: string | null;
  observacao: string | null;
  tipo_faturamento: string | null;
  itens: OrderItem[];
  created_at: string;
  updated_at: string;
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export interface Product {
  uuid: string;
  fornecedor_id: number | null;
  codigo: string | null;
  descricao: string;
  preco_base: string | null;
  fornecedor?: Supplier | null;
}

export interface Transport {
  uuid: string;
  razao_social: string;
  cnpj: string | null;
  telefone: string | null;
  endereco_completo: string | null;
}

// ─── Fornecedores ────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  uuid: string;
  razao_social: string;
  cnpj: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  inscricao_estadual: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

export type MovimentacaoTipo = 'Custo Fixo' | 'Custo Rotativo' | 'Venda';

export interface FinanceMovement {
  uuid: string;
  version: number;
  tipo: MovimentacaoTipo;
  valor: number;
  data: string;
  descricao: string | null;
  created_at: string;
  updated_at: string;
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
  cnpj: z.string().max(20).optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  tel: z.string().max(30).optional(),
  endereco: z.string().max(255).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  uf: z.string().length(2, 'UF deve ter 2 caracteres').optional(),
  cep: z.string().max(10).optional(),
  contato: z.string().max(100).optional(),
  inscricao_estadual: z.string().max(50).optional(),
  suframa: z.string().max(50).optional(),
  pgt_padrao: z.string().max(100).optional(),
  prazo: z.string().max(100).optional(),
  local_entrega: z.string().max(255).optional(),
  observacao: z.string().optional(),
  transportadora_id: z.number().int().optional(),
});

export type ClientFormData = z.infer<typeof clientSchema>;

export const orderStatusLabel: Record<OrderStatus, string> = {
  em_aberto: 'Em Aberto',
  liberado: 'Liberado',
  parcialmente_faturado: 'Parcialmente Faturado',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
};

/** Cores de badge por status — usado em Pedidos, PedidoDetalhe e PedidoForm (fonte única, sem duplicação). */
export const orderStatusColor: Record<OrderStatus, string> = {
  em_aberto: 'bg-blue-100 text-blue-700',
  liberado: 'bg-teal-100 text-teal-700',
  parcialmente_faturado: 'bg-orange-100 text-orange-700',
  faturado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};
