/**
 * Cabeçalhos dos modelos de importação CSV, na mesma ordem dos exemplos em
 * `docs/exemplos-csv/`. Separador `;` (Excel pt-BR); o backend auto-detecta
 * `,`/`;` em `csv-import.util.ts`.
 */
export const CSV_TEMPLATE_HEADERS = {
  fornecedores:
    'razao_social;cnpj;endereco;numero;complemento;bairro;cidade;uf;cep;telefone;inscricao_estadual',
  transporte: 'razao_social;cnpj;telefone;endereco_completo',
  clientes:
    'razao_social;cnpj;email;tel;endereco;numero;complemento;bairro;cidade;uf;cep;contato;inscricao_estadual;pgt_padrao;prazo;local_entrega;observacao;transportadora_cnpj',
  produtos: 'codigo;descricao;preco_base;ipi_perc;quantidade;foto',
} as const;

/**
 * Baixa um modelo .csv só com a linha de cabeçalho (sem dados de exemplo,
 * para não importar lixo se o arquivo for enviado sem edição). Prefixa BOM
 * UTF-8 para o Excel abrir acentos corretamente.
 */
export function downloadCsvTemplate(filename: string, headerLine: string): void {
  // BOM como escape, não como caractere literal: literal dispara
  // `no-irregular-whitespace` no ESLint e é invisível na revisão.
  const content = `\uFEFF${headerLine}\n`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
