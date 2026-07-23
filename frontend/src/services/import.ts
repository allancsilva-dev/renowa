import api from '@/lib/apiClient';
import type { ApiResponse } from '@/types';

export interface ImportRowError {
  linha: number;
  chave: string;
  erro: string;
}

export interface ImportResult {
  criados: number;
  atualizados: number;
  rejeitados: number;
  erros: ImportRowError[];
}

/** Envia um .csv para o endpoint de importação em massa (campo `arquivo`). */
export async function importCsv(endpoint: string, file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('arquivo', file);
  const { data } = await api.post<ApiResponse<ImportResult>>(endpoint, formData);
  return data.data;
}

export const importSuppliers = (file: File) => importCsv('/fornecedores/importacao', file);
export const importTransportadoras = (file: File) => importCsv('/transportadoras/importacao', file);
export const importClientes = (file: File) => importCsv('/clientes/importacao', file);
