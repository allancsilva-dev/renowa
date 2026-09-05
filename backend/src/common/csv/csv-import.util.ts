import { BadRequestException } from '@nestjs/common';
import { DeepPartial, ObjectLiteral, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { isValidCnpj } from '../validators/brazilian-document.validators';
import { ImportResultDto } from './import-result.dto';

const IMPORT_ALLOWED_EXTENSIONS = ['csv'];
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/**
 * Excel pt-BR gera CSV em dois formatos incompatíveis entre si:
 * - "CSV UTF-8": UTF-8 COM BOM (o BOM entraria no nome da 1ª coluna).
 * - "CSV (separado por vírgulas)": Windows-1252, onde "Descrição" não é
 *   UTF-8 válido e viraria mojibake se decodificado como UTF-8.
 * Decodifica em UTF-8 estrito e só cai para Windows-1252 quando o buffer
 * comprovadamente não é UTF-8 — assim arquivo UTF-8 legítimo nunca é
 * reinterpretado por engano.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  const hasBom = buffer.length >= 3 && UTF8_BOM.every((byte, i) => buffer[i] === byte);
  const body = hasBom ? buffer.subarray(UTF8_BOM.length) : buffer;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('windows-1252').decode(body);
  }
}

/**
 * Valida extensão + parseia o CSV para linhas por cabeçalho. Falhas
 * ESTRUTURAIS (tipo inválido, arquivo grande demais, ilegível) lançam
 * BadRequestException. Limita DURANTE o parse via `preview` para nunca
 * materializar mais que `maxRows + 1` linhas.
 */
export function parseCsvRows(
  file: Express.Multer.File | undefined,
  maxRows: number,
): Record<string, unknown>[] {
  if (!file) throw new BadRequestException('Arquivo obrigatório.');

  const extension = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (!IMPORT_ALLOWED_EXTENSIONS.includes(extension)) {
    throw new BadRequestException('Tipo de arquivo inválido. Utilize .csv (UTF-8).');
  }

  let rows: Record<string, unknown>[];
  try {
    const parsed = Papa.parse<Record<string, unknown>>(decodeCsvBuffer(file.buffer), {
      header: true,
      // Auto-detecção: Excel pt-BR salva CSV com ';' em vez de ','.
      delimiter: '',
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      preview: maxRows + 1,
    });
    rows = parsed.data;
  } catch {
    throw new BadRequestException('Não foi possível ler o arquivo enviado.');
  }

  if (rows.length > maxRows) {
    throw new BadRequestException(`Arquivo excede o limite de ${maxRows} linhas.`);
  }

  return rows;
}

/**
 * Normaliza chaves da linha: `trim().toLowerCase()`. Valores viram string
 * trimada; vazio/nulo vira `undefined`. Aceita variações acentuadas via
 * `pick` (ex.: `descrição`/`descricao`).
 */
export function normalizeRowKeys(row: Record<string, unknown>): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toLowerCase()] =
      value === undefined || value === null || value === '' ? undefined : String(value).trim();
  }
  return normalized;
}

/** Retorna o primeiro valor definido dentre as chaves candidatas. */
export function pick(
  row: Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

/** Dígitos de um documento (CNPJ/CEP), ou undefined se não sobrar nada. */
export function onlyDigits(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

/** Resultado do mapeamento de uma linha para entidade. */
export type RowMapResult<E> =
  | { erro: string; chave: string }
  | { fields: DeepPartial<E>; cnpj?: string; chave: string };

/**
 * Loop genérico de importação de entidades planas com chave natural CNPJ.
 * Cada linha é mapeada por `buildFields`; erros por linha são acumulados
 * sem interromper. Havendo CNPJ, faz upsert (atualiza se já existe no
 * tenant); sem CNPJ, sempre cria. CNPJ repetido no arquivo é rejeitado.
 * `buildFields` recebe a linha normalizada e deve validar campos próprios;
 * a validação de CNPJ (formato) e de duplicidade é feita aqui.
 */
export async function importCnpjEntity<E extends ObjectLiteral & { id: number }>(params: {
  rows: Record<string, unknown>[];
  repo: Repository<E>;
  tenantId: string;
  buildFields: (
    row: Record<string, string | undefined>,
    linha: number,
  ) => Promise<RowMapResult<E>> | RowMapResult<E>;
}): Promise<ImportResultDto> {
  const { rows, repo, tenantId } = params;
  const seen = new Set<string>();
  const erros: ImportResultDto['erros'] = [];
  let criados = 0;
  let atualizados = 0;
  let rejeitados = 0;

  for (const [index, rawRow] of rows.entries()) {
    const linha = index + 2; // linha 1 = cabeçalho
    const normalized = normalizeRowKeys(rawRow);
    const mapped = await params.buildFields(normalized, linha);

    if ('erro' in mapped) {
      erros.push({ linha, chave: mapped.chave, erro: mapped.erro });
      rejeitados++;
      continue;
    }

    const { fields, cnpj, chave } = mapped;

    if (cnpj !== undefined) {
      if (!isValidCnpj(cnpj)) {
        erros.push({ linha, chave, erro: 'CNPJ inválido.' });
        rejeitados++;
        continue;
      }
      const digits = cnpj.replace(/\D/g, '');
      if (seen.has(digits)) {
        erros.push({ linha, chave, erro: 'CNPJ duplicado no arquivo.' });
        rejeitados++;
        continue;
      }
      seen.add(digits);
    }

    const digits = onlyDigits(cnpj);
    const existing = digits
      ? await repo.createQueryBuilder('entity')
        .where('entity.tenant_id = :tenantId', { tenantId })
        .andWhere('entity.deleted_at IS NULL')
        .andWhere("regexp_replace(COALESCE(entity.cnpj, ''), '\\D', '', 'g') = :cnpj", { cnpj: digits })
        .getOne()
      : null;

    if (existing) {
      // Só sobrescreve campos informados na linha (não zera dados existentes).
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (existing as Record<string, unknown>)[key] = value;
      }
      await repo.save(existing);
      atualizados++;
    } else {
      const created = repo.create({
        ...fields,
        uuid: randomUUID(),
        tenant_id: tenantId,
      } as DeepPartial<E>);
      await repo.save(created);
      criados++;
    }
  }

  return { criados, atualizados, rejeitados, erros };
}
