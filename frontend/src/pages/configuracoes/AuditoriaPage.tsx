import { useCallback, useEffect, useMemo, useState } from 'react';
import DataTable from '@/components/tables/DataTable';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { getApiErrorMessage } from '@/lib/errors';
import { fetchAuditEvents, type AuditAction, type PiiAuditEvent } from '@/services/audit.service';
import type { PaginatedResponse } from '@/types';

const actionLabels: Record<AuditAction, string> = {
  READ: 'Leitura', CREATE: 'Criação', UPDATE: 'Alteração', DELETE: 'Exclusão',
  EXPORT: 'Exportação', AUDIT_READ: 'Consulta da auditoria',
};

const emptyMeta = { total: 0, page: 1, limit: 25, totalPages: 1 };
const roleLabels: Record<string, string> = { admin: 'Administrador', manager: 'Gestor', viewer: 'Consulta' };
const fieldLabels: Record<string, string> = {
  active: 'status', cnpj: 'CNPJ', email: 'e-mail', endereco: 'endereço', nome: 'nome',
  role: 'perfil de acesso', roles: 'perfis de acesso', senha_hash: 'senha', tel: 'telefone',
};
const resourceLabels: Record<string, string> = { cliente: 'Cliente', usuario: 'Usuário' };

function readableLabel(value: string): string {
  return fieldLabels[value] ?? value.replace(/_/g, ' ');
}

export default function AuditoriaPage() {
  const [result, setResult] = useState<PaginatedResponse<PiiAuditEvent>>({ data: [], meta: emptyMeta });
  const [action, setAction] = useState('');
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError(null);
    try { setResult(await fetchAuditEvents({ page, limit: 25, action })); }
    catch (err) { setError(getApiErrorMessage(err)); }
    finally { setLoading(false); }
  }, [action]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => {
    fetchAllPages<{ authUserId: string; name: string; email: string }>('/users')
      .then((users) => {
        setActorNames(new Map(users.map((user) => [user.authUserId, user.name || user.email])));
      })
      .catch(() => setActorNames(new Map()));
  }, []);

  const columns = useMemo(() => [
    { key: 'date', header: 'Data e hora', cell: (row: PiiAuditEvent) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(row.occurred_at)) },
    { key: 'action', header: 'Ação', cell: (row: PiiAuditEvent) => <span className='font-medium text-slate-900'>{actionLabels[row.action]}</span> },
    { key: 'resource', header: 'Dados afetados', cell: (row: PiiAuditEvent) => resourceLabels[row.resource_type] ?? readableLabel(row.resource_type) },
    { key: 'actor', header: 'Responsável', cell: (row: PiiAuditEvent) => <div><p className='font-medium text-slate-900'>{actorNames.get(row.actor_id) ?? 'Usuário do sistema'}</p><p className='text-xs text-slate-600'>{row.actor_roles.map((role) => roleLabels[role.toLowerCase()] ?? role).join(', ')}</p></div> },
    { key: 'purpose', header: 'Finalidade', cell: (row: PiiAuditEvent) => <p className='max-w-72 text-slate-700'>{row.purpose}</p> },
    { key: 'fields', header: 'Informações', cell: (row: PiiAuditEvent) => row.fields.length ? row.fields.map(readableLabel).join(', ') : '—' },
  ], [actorNames]);

  return (
    <section className='space-y-4' aria-labelledby='audit-title'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 id='audit-title' className='text-xl font-bold text-slate-900'>Auditoria de dados pessoais</h1>
          <p className='mt-1 max-w-2xl text-sm text-slate-600'>Histórico de acesso e alteração. Valores pessoais não são armazenados nesta trilha.</p>
        </div>
        <label className='grid gap-1 text-sm font-medium text-slate-700'>
          Tipo de ação
          <select value={action} onChange={(event) => setAction(event.target.value)} className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary'>
            <option value=''>Todas</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <DataTable columns={columns} data={result.data} meta={result.meta} isLoading={loading}
        error={error} onRetry={() => void load(result.meta.page)} onPageChange={(page) => void load(page)}
        emptyTitle='Nenhum evento encontrado' emptyDescription='A trilha aparecerá quando dados pessoais forem acessados ou alterados.' />
    </section>
  );
}
