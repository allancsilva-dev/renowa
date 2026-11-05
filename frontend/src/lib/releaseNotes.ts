/**
 * Novidades mostradas ao usuário depois de cada atualização do sistema.
 *
 * NÃO edite à mão sem necessidade: o conteúdo é gerado pela skill `/novidades`
 * (`.claude/skills/novidades/SKILL.md`) a partir dos commits desde `commit` da
 * versão mais recente, traduzido para linguagem leiga e revisado antes do
 * deploy. `releaseNotes.test.ts` barra jargão técnico e entrada malformada.
 *
 * Ordem: mais recente PRIMEIRO. A comparação de "já viu" é pela posição no
 * array, nunca por parse de versão.
 */
export type ReleaseItemTipo = 'novo' | 'melhoria' | 'correcao';

export interface ReleaseItem {
  tipo: ReleaseItemTipo;
  texto: string;
}

export interface ReleaseNote {
  /** X.Y.Z — é o valor gravado no banco quando o usuário fecha o modal. */
  version: string;
  /** AAAA-MM-DD da publicação. */
  date: string;
  /** SHA do HEAD quando a versão foi gerada; a próxima geração parte daqui. */
  commit: string;
  items: ReleaseItem[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-11-05',
    commit: '4f28614',
    items: [
      { tipo: 'novo', texto: 'Agora, sempre que o sistema for atualizado, esta janela mostra o que mudou. Para rever, use o ícone de brilho no topo da tela.' },
      { tipo: 'novo', texto: 'A comissão do vendedor só fica liberada para pagamento depois que a comissão da empresa da mesma nota fiscal for paga.' },
      { tipo: 'melhoria', texto: 'No Financeiro, os vendedores ganharam uma aba própria, com cadastro, comissões, filtros e totais por situação.' },
    ],
  },
];

export const RELEASE_ITEM_LABEL: Record<ReleaseItemTipo, string> = {
  novo: 'Novidade',
  melhoria: 'Melhoria',
  correcao: 'Corrigido',
};

/**
 * Versões que o usuário ainda não viu, mais recente primeiro.
 *
 * - `seen` encontrado → tudo que veio depois dele (pulou duas, vê as duas);
 * - `seen` nulo ou desconhecido → só a mais recente (não despeja o histórico);
 * - conta criada depois do dia da versão mais recente → nada: quem chegou
 *   agora não tem "antes" para comparar.
 */
export function pendingReleases(
  seen: string | null | undefined,
  userCreatedAt?: string | null,
  notes: ReleaseNote[] = RELEASE_NOTES,
): ReleaseNote[] {
  const latest = notes[0];
  if (!latest) return [];

  if (userCreatedAt) {
    const createdDay = userCreatedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(createdDay) && createdDay > latest.date) return [];
  }

  if (!seen) return [latest];
  const index = notes.findIndex((note) => note.version === seen);
  if (index === -1) return [latest];
  return notes.slice(0, index);
}
