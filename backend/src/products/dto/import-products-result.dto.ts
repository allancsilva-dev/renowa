export interface ImportProductRowError {
  linha: number;
  codigo: string;
  erro: string;
}

export class ImportProductsResultDto {
  criados: number;
  atualizados: number;
  rejeitados: number;
  erros: ImportProductRowError[];
}
