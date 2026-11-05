import { describe, expect, it } from 'vitest';
import { RELEASE_NOTES, pendingReleases, type ReleaseNote } from './releaseNotes';

const note = (version: string, date: string): ReleaseNote => ({
  version, date, commit: 'abc1234', items: [{ tipo: 'novo', texto: 'Texto de exemplo para teste.' }],
});
const NOTES = [note('1.3.0', '2026-03-01'), note('1.2.0', '2026-02-01'), note('1.1.0', '2026-01-01')];

describe('pendingReleases', () => {
  it('sem nenhuma versão publicada → nada', () => {
    expect(pendingReleases(null, null, [])).toEqual([]);
  });

  it('já viu a mais recente → nada', () => {
    expect(pendingReleases('1.3.0', null, NOTES)).toEqual([]);
  });

  it('pulou versões → vê todas as que perdeu, mais recente primeiro', () => {
    expect(pendingReleases('1.1.0', null, NOTES).map((n) => n.version)).toEqual(['1.3.0', '1.2.0']);
  });

  it('nunca viu → só a mais recente', () => {
    expect(pendingReleases(null, '2025-12-01T10:00:00.000Z', NOTES).map((n) => n.version)).toEqual(['1.3.0']);
  });

  it('versão vista desconhecida → só a mais recente', () => {
    expect(pendingReleases('0.9.0', null, NOTES).map((n) => n.version)).toEqual(['1.3.0']);
  });

  it('não compara versão como número: 1.10.0 depois de 1.9.0 funciona pela posição', () => {
    const notes = [note('1.10.0', '2026-03-01'), note('1.9.0', '2026-02-01')];
    expect(pendingReleases('1.9.0', null, notes).map((n) => n.version)).toEqual(['1.10.0']);
  });

  it('conta criada depois da versão mais recente → nada', () => {
    expect(pendingReleases(null, '2026-03-02T00:00:00.000Z', NOTES)).toEqual([]);
  });

  it('conta criada no mesmo dia da versão → vê', () => {
    expect(pendingReleases(null, '2026-03-01T23:00:00.000Z', NOTES)).toHaveLength(1);
  });
});

/**
 * Guarda do conteúdo publicado: é o que impede texto técnico ou entrada
 * quebrada de chegar ao cliente. Falhou aqui → corrigir `releaseNotes.ts`.
 */
describe('RELEASE_NOTES (conteúdo publicado)', () => {
  const JARGAO = /\b(backend|frontend|endpoint|api|migration|migração|commit|deploy|merge|feat|fix|refactor|tenant|uuid|jwt|json|null|undefined|bug|hook|modal|dto|sql|cache)\b/i;
  const PREFIXO_COMMIT = /^\s*[a-z]+(\([^)]*\))?!?:/i;

  it('versões no formato X.Y.Z, únicas', () => {
    const versions = RELEASE_NOTES.map((n) => n.version);
    versions.forEach((v) => expect(v).toMatch(/^\d+\.\d+\.\d+$/));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('datas válidas e em ordem decrescente (mais recente primeiro)', () => {
    RELEASE_NOTES.forEach((n) => {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(n.date))).toBe(false);
    });
    for (let i = 1; i < RELEASE_NOTES.length; i += 1) {
      expect(RELEASE_NOTES[i - 1].date >= RELEASE_NOTES[i].date).toBe(true);
    }
  });

  it('commit âncora é um SHA', () => {
    RELEASE_NOTES.forEach((n) => expect(n.commit).toMatch(/^[0-9a-f]{7,40}$/));
  });

  it('cada versão tem itens com texto leigo, de 10 a 160 caracteres', () => {
    RELEASE_NOTES.forEach((n) => {
      expect(n.items.length).toBeGreaterThan(0);
      n.items.forEach(({ tipo, texto }) => {
        expect(['novo', 'melhoria', 'correcao']).toContain(tipo);
        expect(texto.trim().length).toBeGreaterThanOrEqual(10);
        expect(texto.length).toBeLessThanOrEqual(160);
        expect(texto, `jargão técnico em: "${texto}"`).not.toMatch(JARGAO);
        expect(texto, `prefixo de commit em: "${texto}"`).not.toMatch(PREFIXO_COMMIT);
        expect(texto, `símbolo de interface em: "${texto}"`).not.toMatch(/[⋮…→]/);
      });
    });
  });
});
