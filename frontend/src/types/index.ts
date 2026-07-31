import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  nome?: string;
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

// ─── SAC ─────────────────────────────────────────────────────────────────────

export type SacStatus = 'aberto' | 'em_andamento' | 'resolvido' | 'cancelado';

/** Linha do chamado: COD · QUANT · MOTIVO · VL UNI. (NF) · VL. TOTAL NF. */
export interface SacTicketItem {
  uuid: string;
  version: number;
  produto_id: number | null;
  produto?: Product | null;
  codigo: string;
  quantidade: string;
  motivo: string;
  valor_unitario: string;
  valor_total: string;
}

export interface SacTicket {
  uuid: string;
  version: number;
  numero_chamado: number;
  cliente_id: number;
  fornecedor_id: number;
  /** Presente quando a API resolve o join (listagem e GET /sac/:uuid). */
  cliente?: Client | null;
  fornecedor?: Supplier | null;
  numero_nfe: string | null;
  data: string | null;
  total: string | null;
  status: SacStatus;
  observacao: string | null;
  itens: SacTicketItem[];
  created_at: string;
  updated_at: string;
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type OrderStatus = 'em_aberto' | 'liberado' | 'parcialmente_faturado' | 'faturado' | 'cancelado';

/**
 * 'interno' = pedido digitado aqui, com itens.
 * 'externo' = pedido digitado em sistema de terceiro; sem itens, só número de
 * origem, sistema e valor. O ciclo de vida (liberar/faturar/cancelar) é o mesmo.
 */
export type OrderOrigem = 'interno' | 'externo';

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

/** Nota fiscal emitida contra um pedido — registrada em Faturamento, exibida também no detalhe do pedido. */
export interface NotaFiscal {
  uuid: string;
  version: number;
  pedido_id: number;
  numero_nota: string;
  serie: string | null;
  valor: string;
  data_emissao: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Metadados da foto do produto no catálogo — uma por produto. Os bytes vêm por
 * endpoint separado (`/produtos/:uuid/foto/conteudo`), nunca aqui.
 *
 * `Product` não carrega este campo de propósito: a presença da foto é
 * descoberta por `GET /produtos/:uuid/foto`, e o payload de `GET /produtos`
 * continua leve.
 */
export interface ProductPhoto {
  uuid: string;
  version: number;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  created_at: string;
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
  /** 'externo' = pedido digitado em sistema de terceiro, sem itens. */
  origem: OrderOrigem;
  numero_pedido_externo: string | null;
  sistema_origem: string | null;
  total_sem_imposto: string | null;
  total_com_imposto: string | null;
  pgt: string | null;
  prazo: string | null;
  local_entrega: string | null;
  observacao: string | null;
  tipo_faturamento: string | null;
  itens: OrderItem[];
  /** Notas fiscais e totais de faturamento — presentes somente no GET /pedidos/:uuid. */
  notas?: NotaFiscal[];
  total_faturado?: string;
  divergencia?: string;
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
  ipi_perc: string | null;
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

export const sacStatusLabel: Record<SacStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em Andamento',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};

export const sacStatusColor: Record<SacStatus, string> = {
  aberto: 'bg-blue-100 text-blue-700',
  em_andamento: 'bg-orange-100 text-orange-700',
  resolvido: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};

/**
 * Transições permitidas — espelha `TRANSICOES` em `backend/src/sac/
 * sac.service.ts`. Resolvido e cancelado são terminais.
 */
export const sacStatusTransitions: Record<SacStatus, SacStatus[]> = {
  aberto: ['em_andamento', 'resolvido', 'cancelado'],
  em_andamento: ['resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

export const orderOrigemLabel: Record<OrderOrigem, string> = {
  interno: 'Interno',
  externo: 'Externo',
};

export const orderOrigemColor: Record<OrderOrigem, string> = {
  interno: 'bg-slate-100 text-slate-700',
  externo: 'bg-violet-100 text-violet-700',
};

/** Cores de badge por status — usado em Pedidos, PedidoDetalhe e PedidoForm (fonte única, sem duplicação). */
export const orderStatusColor: Record<OrderStatus, string> = {
  em_aberto: 'bg-blue-100 text-blue-700',
  liberado: 'bg-teal-100 text-teal-700',
  parcialmente_faturado: 'bg-orange-100 text-orange-700',
  faturado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
};
