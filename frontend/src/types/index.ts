import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  email: string;
  roles: string[];
  tenantId: string;
  // Auth nativa: /auth/me não retorna mais plan/defaultRole.
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
  created_at: string;
  updated_at: string;
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export type OrderStatus = 'em_aberto' | 'concluido' | 'cancelado';

export interface OrderItem {
  uuid: string;
  pedido_id: number;
  produto_id: number | null;
  codigo_manual: string | null;
  descricao_manual: string | null;
  qtd_caixas: number | null;
  qtd_unitaria: number | null;
  preco_unitario: number | null;
  desconto_perc: number | null;
  total_item: number | null;
}

export interface Order {
  uuid: string;
  version: number;
  numero_pedido: number | null;
  cliente_id: number | null;
  vendedor_id: number | null;
  fornecedor_id: number | null;
  transportadora_id: number | null;
  data: string | null;
  status: OrderStatus;
  total_sem_imposto: number | null;
  total_com_imposto: number | null;
  pgt: string | null;
  prazo: string | null;
  local_entrega: string | null;
  observacao: string | null;
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
  preco_base: number | null;
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
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
