/**
 * Resposta normalizada da consulta de CNPJ (BrasilAPI), usada para
 * pré-preencher formulários de cliente/fornecedor.
 *
 * `inscricao_estadual` é SEMPRE `null` — a BrasilAPI não retorna dado
 * estadual (é uma informação por UF, não federal). Mantido no shape só
 * para o frontend reaproveitar o mesmo formulário de endereço sem checagem
 * condicional de campo ausente.
 */
export class CnpjLookupResponseDto {
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
