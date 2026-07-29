export enum PermissionModule {
  CLIENTES = 'clientes',
  PEDIDOS = 'pedidos',
  PRODUTOS = 'produtos',
  FORNECEDORES = 'fornecedores',
  TRANSPORTADORAS = 'transportadoras',
  FINANCEIRO = 'financeiro',
  FATURAMENTO = 'faturamento',
  USUARIOS = 'usuarios',
  AUDITORIA = 'auditoria',
  PRIVACIDADE = 'privacidade',
  SAC = 'sac',
}

export enum PermissionSlug {
  ClientesVer = 'clientes.ver',
  ClientesCriar = 'clientes.criar',
  ClientesEditar = 'clientes.editar',
  ClientesDeletar = 'clientes.deletar',

  PedidosVer = 'pedidos.ver',
  PedidosCriar = 'pedidos.criar',
  PedidosEditar = 'pedidos.editar',
  PedidosDeletar = 'pedidos.deletar',
  PedidosLiberar = 'pedidos.liberar',

  ProdutosVer = 'produtos.ver',
  ProdutosCriar = 'produtos.criar',
  ProdutosEditar = 'produtos.editar',
  ProdutosDeletar = 'produtos.deletar',

  FornecedoresVer = 'fornecedores.ver',
  FornecedoresCriar = 'fornecedores.criar',
  FornecedoresEditar = 'fornecedores.editar',
  FornecedoresDeletar = 'fornecedores.deletar',

  TransportadorasVer = 'transportadoras.ver',
  TransportadorasCriar = 'transportadoras.criar',
  TransportadorasEditar = 'transportadoras.editar',
  TransportadorasDeletar = 'transportadoras.deletar',

  FinanceiroVer = 'financeiro.ver',
  FinanceiroEditar = 'financeiro.editar',

  FaturamentoVer = 'faturamento.ver',
  FaturamentoEditar = 'faturamento.editar',

  UsuariosGerenciar = 'usuarios.gerenciar',

  AuditoriaVer = 'auditoria.ver',

  PrivacidadeGerenciar = 'privacidade.gerenciar',

  SacVer = 'sac.ver',
  SacCriar = 'sac.criar',
  SacEditar = 'sac.editar',
  SacDeletar = 'sac.deletar',
}

export interface PermissionCatalogEntry {
  readonly slug: PermissionSlug;
  readonly module: PermissionModule;
  readonly description: string;
}

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  { slug: PermissionSlug.ClientesVer, module: PermissionModule.CLIENTES, description: 'Visualizar clientes' },
  { slug: PermissionSlug.ClientesCriar, module: PermissionModule.CLIENTES, description: 'Criar clientes' },
  { slug: PermissionSlug.ClientesEditar, module: PermissionModule.CLIENTES, description: 'Editar clientes' },
  { slug: PermissionSlug.ClientesDeletar, module: PermissionModule.CLIENTES, description: 'Remover clientes' },

  { slug: PermissionSlug.PedidosVer, module: PermissionModule.PEDIDOS, description: 'Visualizar pedidos' },
  { slug: PermissionSlug.PedidosCriar, module: PermissionModule.PEDIDOS, description: 'Criar pedidos' },
  { slug: PermissionSlug.PedidosEditar, module: PermissionModule.PEDIDOS, description: 'Editar pedidos' },
  { slug: PermissionSlug.PedidosDeletar, module: PermissionModule.PEDIDOS, description: 'Remover pedidos' },
  { slug: PermissionSlug.PedidosLiberar, module: PermissionModule.PEDIDOS, description: 'Liberar pedidos para faturamento' },

  { slug: PermissionSlug.ProdutosVer, module: PermissionModule.PRODUTOS, description: 'Visualizar produtos' },
  { slug: PermissionSlug.ProdutosCriar, module: PermissionModule.PRODUTOS, description: 'Criar produtos' },
  { slug: PermissionSlug.ProdutosEditar, module: PermissionModule.PRODUTOS, description: 'Editar produtos' },
  { slug: PermissionSlug.ProdutosDeletar, module: PermissionModule.PRODUTOS, description: 'Remover produtos' },

  { slug: PermissionSlug.FornecedoresVer, module: PermissionModule.FORNECEDORES, description: 'Visualizar fornecedores' },
  { slug: PermissionSlug.FornecedoresCriar, module: PermissionModule.FORNECEDORES, description: 'Criar fornecedores' },
  { slug: PermissionSlug.FornecedoresEditar, module: PermissionModule.FORNECEDORES, description: 'Editar fornecedores' },
  { slug: PermissionSlug.FornecedoresDeletar, module: PermissionModule.FORNECEDORES, description: 'Remover fornecedores' },

  { slug: PermissionSlug.TransportadorasVer, module: PermissionModule.TRANSPORTADORAS, description: 'Visualizar transportadoras' },
  { slug: PermissionSlug.TransportadorasCriar, module: PermissionModule.TRANSPORTADORAS, description: 'Criar transportadoras' },
  { slug: PermissionSlug.TransportadorasEditar, module: PermissionModule.TRANSPORTADORAS, description: 'Editar transportadoras' },
  { slug: PermissionSlug.TransportadorasDeletar, module: PermissionModule.TRANSPORTADORAS, description: 'Remover transportadoras' },

  { slug: PermissionSlug.FinanceiroVer, module: PermissionModule.FINANCEIRO, description: 'Visualizar dados financeiros' },
  { slug: PermissionSlug.FinanceiroEditar, module: PermissionModule.FINANCEIRO, description: 'Alterar dados financeiros' },

  { slug: PermissionSlug.FaturamentoVer, module: PermissionModule.FATURAMENTO, description: 'Visualizar faturamento' },
  { slug: PermissionSlug.FaturamentoEditar, module: PermissionModule.FATURAMENTO, description: 'Registrar e editar notas fiscais de faturamento' },

  { slug: PermissionSlug.UsuariosGerenciar, module: PermissionModule.USUARIOS, description: 'Gerenciar usuários e perfis do tenant' },

  { slug: PermissionSlug.AuditoriaVer, module: PermissionModule.AUDITORIA, description: 'Visualizar trilha de auditoria' },

  { slug: PermissionSlug.PrivacidadeGerenciar, module: PermissionModule.PRIVACIDADE, description: 'Gerenciar solicitações de privacidade (LGPD)' },

  { slug: PermissionSlug.SacVer, module: PermissionModule.SAC, description: 'Visualizar chamados de SAC' },
  { slug: PermissionSlug.SacCriar, module: PermissionModule.SAC, description: 'Abrir chamados de SAC' },
  { slug: PermissionSlug.SacEditar, module: PermissionModule.SAC, description: 'Editar chamados de SAC e alterar o status' },
  { slug: PermissionSlug.SacDeletar, module: PermissionModule.SAC, description: 'Remover chamados de SAC' },
] as const;

export const PERMISSION_SLUGS: readonly PermissionSlug[] = PERMISSION_CATALOG.map((entry) => entry.slug);

/**
 * Nomes de tenant_roles que o app provisiona automaticamente (JWT
 * `defaultRole` no primeiro login, ou role digitada na criação de usuário
 * nativo) e o conjunto de permissões concedido nesse momento. Só se aplica
 * na criação — editar um perfil depois disso é livre pela tela de Perfis.
 * Qualquer nome fora deste mapa é provisionado sem nenhuma permissão
 * (fail-closed: precisa ser concedida explicitamente depois).
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionSlug[]>> = {
  admin: PERMISSION_SLUGS,
  gestao: PERMISSION_SLUGS,
  vendedor: [
    PermissionSlug.ClientesVer, PermissionSlug.ClientesCriar, PermissionSlug.ClientesEditar,
    PermissionSlug.PedidosVer, PermissionSlug.PedidosCriar, PermissionSlug.PedidosEditar,
    PermissionSlug.ProdutosVer, PermissionSlug.ProdutosCriar, PermissionSlug.ProdutosEditar,
    PermissionSlug.FornecedoresVer, PermissionSlug.FornecedoresCriar, PermissionSlug.FornecedoresEditar,
    PermissionSlug.TransportadorasVer, PermissionSlug.TransportadorasCriar, PermissionSlug.TransportadorasEditar,
  ],
  financeiro: [
    PermissionSlug.FinanceiroVer, PermissionSlug.FinanceiroEditar,
    PermissionSlug.PedidosVer, PermissionSlug.PedidosLiberar,
    PermissionSlug.FaturamentoVer, PermissionSlug.FaturamentoEditar,
  ],
};

/**
 * Nomes de tenant_roles protegidos (não podem ser renomeados/excluídos —
 * ver Etapa 4). Hoje só "admin"; tenant_roles.is_system reflete isto no banco.
 */
export const SYSTEM_ROLE_NAMES: readonly string[] = ['admin'];
