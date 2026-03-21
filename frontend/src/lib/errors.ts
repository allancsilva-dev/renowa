export function getApiErrorMessage(error: unknown): string {
  const status = (error as any)?.response?.status
    ?? (error as any)?.status;

  if (status === 422) return 'Email não cadastrado no ZonaDev Auth';
  if (status === 403) return 'Usuário não tem acesso ao Renowa';
  if (status === 409) return 'Recurso em uso — não pode ser removido';
  if (status === 404) return 'Recurso não encontrado';

  return 'Erro inesperado. Tente novamente.';
}
