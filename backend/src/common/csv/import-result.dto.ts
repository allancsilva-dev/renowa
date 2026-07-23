export interface ImportRowError {
  linha: number;
  chave: string;
  erro: string;
}

export class ImportResultDto {
  criados: number;
  atualizados: number;
  rejeitados: number;
  erros: ImportRowError[];
}
