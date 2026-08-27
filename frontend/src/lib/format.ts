export const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/** Formata uma data (YYYY-MM-DD) para pt-BR sem sofrer o shift de fuso do `new Date(string)`. */
export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
};

/** Aplica máscara de CNPJ (00.000.000/0001-00) enquanto o usuário digita. */
export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Aplica máscara de telefone (10 ou 11 dígitos) enquanto o usuário digita. */
export function maskTel(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d{4})(\d)/, '($1) $2-$3').replace(/^(\d{2})(\d)/, '($1) $2');
  }
  return d.replace(/^(\d{2})(\d{5})(\d)/, '($1) $2-$3');
}

/** Aplica máscara de CEP (00000-000) enquanto o usuário digita. */
export function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

interface EnderecoParts {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/**
 * Junta partes de endereço num texto único — usado onde a entidade guarda o
 * endereço em um campo só (transportadora) e a origem vem esmiuçada (consulta
 * de CNPJ). Partes ausentes somem sem deixar separador órfão.
 */
export function formatEnderecoCompleto(parts: EnderecoParts): string {
  const clean = (v: string | null | undefined) => v?.trim() || '';
  const logradouro = [clean(parts.endereco), clean(parts.numero)].filter(Boolean).join(', ');
  const cidadeUf = [clean(parts.cidade), clean(parts.uf)].filter(Boolean).join('/');
  const localidade = [clean(parts.bairro), cidadeUf].filter(Boolean).join(', ');
  return [logradouro, clean(parts.complemento), localidade, clean(parts.cep)]
    .filter(Boolean)
    .join(' - ');
}
