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
  if (status === 409) return 'Recurso em uso — não pode ser removido';
  if (status === 404) return 'Recurso não encontrado';

  return 'Erro inesperado. Tente novamente.';
}
