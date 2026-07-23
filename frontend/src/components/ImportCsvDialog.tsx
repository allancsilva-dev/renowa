import { useState, type ReactNode } from 'react';
import Dialog from '@/components/ui/Dialog';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadCsvTemplate } from '@/lib/csvTemplate';
import type { ImportResult } from '@/services/import';

interface ImportCsvDialogProps {
  title: string;
  /** Ajuda com as colunas esperadas, exibida abaixo do seletor de arquivo. */
  help: ReactNode;
  /** Modelo .csv baixável (só cabeçalho). Omitido = sem botão de download. */
  template?: { filename: string; header: string };
  importFn: (file: File) => Promise<ImportResult>;
  /** Chamado após uma importação bem-sucedida (ex.: recarregar a lista). */
  onImported: () => void;
  onClose: () => void;
}

export default function ImportCsvDialog({ title, help, template, importFn, onImported, onClose }: ImportCsvDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError('Selecione um arquivo .csv para importar.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await importFn(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open title={title} onClose={onClose} className='max-w-lg'>
      <form onSubmit={handleSubmit} className='space-y-4'>
        {error && (
          <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
            {error}
          </div>
        )}

        <div className='flex flex-col gap-1'>
          <label htmlFor='import-arquivo' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
            Arquivo (.csv) <span className='text-red-500'>*</span>
          </label>
          <input
            id='import-arquivo'
            type='file'
            accept='.csv,text/csv'
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-primary focus:ring-1 focus:ring-primary/40'
          />
          <p className='text-xs text-slate-500'>
            No Excel, use <strong>Arquivo &gt; Salvar como &gt; CSV UTF-8 (delimitado por vírgulas)</strong>.{' '}
            {help} Máximo de 5.000 linhas.
          </p>
          {template && (
            <button
              type='button'
              onClick={() => downloadCsvTemplate(template.filename, template.header)}
              className='self-start text-sm font-medium text-primary underline-offset-2 hover:underline'
            >
              Baixar modelo (.csv)
            </button>
          )}
        </div>

        {result && (
          <div className='space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm'>
            <p className='font-medium text-slate-800'>
              {result.criados} criado(s), {result.atualizados} atualizado(s), {result.rejeitados} rejeitado(s).
            </p>
            {result.erros.length > 0 && (
              <div className='max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white'>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='bg-slate-100 text-left text-slate-600'>
                      <th className='px-2 py-1'>Linha</th>
                      <th className='px-2 py-1'>Registro</th>
                      <th className='px-2 py-1'>Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.erros.map((erro, index) => (
                      <tr key={index} className='border-t border-slate-100'>
                        <td className='px-2 py-1'>{erro.linha}</td>
                        <td className='px-2 py-1'>{erro.chave || '—'}</td>
                        <td className='px-2 py-1 text-red-700'>{erro.erro}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className='flex justify-end gap-3 pt-2'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
          >
            Fechar
          </button>
          <button
            type='submit'
            disabled={importing}
            className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'
          >
            {importing ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
