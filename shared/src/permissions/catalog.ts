export enum PermissionModule {
  CLIENTES = 'clientes',
  PEDIDOS = 'pedidos',
  PRODUTOS = 'produtos',
  FORNECEDORES = 'fornecedores',
  TRANSPORTADORAS = 'transportadoras',
  FINANCEIRO = 'financeiro',
  USUARIOS = 'usuarios',
  AUDITORIA = 'auditoria',
  PRIVACIDADE = 'privacidade',
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

  UsuariosGerenciar = 'usuarios.gerenciar',

  AuditoriaVer = 'auditoria.ver',

  PrivacidadeGerenciar = 'privacidade.gerenciar',
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

  { slug: PermissionSlug.UsuariosGerenciar, module: PermissionModule.USUARIOS, description: 'Gerenciar usuários e perfis do tenant' },

  { slug: PermissionSlug.AuditoriaVer, module: PermissionModule.AUDITORIA, description: 'Visualizar trilha de auditoria' },

  { slug: PermissionSlug.PrivacidadeGerenciar, module: PermissionModule.PRIVACIDADE, description: 'Gerenciar solicitações de privacidade (LGPD)' },
] as const;

export const PERMISSION_SLUGS: readonly PermissionSlug[] = PERMISSION_CATALOG.map((entry) => entry.slug);
