export function getApiErrorMessage(error: unknown): string {
  const status = (error as any)?.response?.status
    ?? (error as any)?.status;
  const backendMessage: string | undefined = (error as any)?.response?.data?.error?.message;

  if (status === 422) return 'Email não cadastrado no ZonaDev Auth';
  // 400/403 cobrem validações e recusas de negócio (ex.: nome de perfil
  // duplicado, tentar renomear/excluir um perfil de sistema) — a mensagem
  // do backend já é destinada ao usuário final, então mostra ela em vez de
  // um texto genérico.
  if (status === 400 || status === 403) return backendMessage || 'Usuário não tem acesso ao Renowa';
  // BACKLOG-0056: o 409 do backend carrega a razão exata do conflito — "Pedido
  // já liberado", "limite de 10 fotos por pedido", "pedido possui notas fiscais
  // ativas". O texto fixo apagava todas elas e virava "não pode ser removido"
  // mesmo quando o usuário não tinha tentado remover nada.
  if (status === 409) return backendMessage || 'Recurso em uso — não pode ser removido';
  if (status === 404) return 'Recurso não encontrado';
  // O throttler conta por rota e por usuário, e a janela é de 1 minuto: o texto
  // genérico mandava tentar de novo na hora, que é justamente o que não resolve.
  if (status === 429) return 'Muitas requisições em pouco tempo. Aguarde um minuto e tente novamente.';

  return 'Erro inesperado. Tente novamente.';
}
