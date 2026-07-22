import { useCallback, useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/errors';
import { fetchClients } from '@/services/clients.service';
import { advancePrivacyRequest, createPrivacyRequest, fetchPrivacyRequests, type PrivacyRequest } from '@/services/privacy.service';
import type { Client } from '@/types';

const statusLabel: Record<PrivacyRequest['status'], string> = {
  RECEIVED: 'Recebida', IDENTITY_VERIFIED: 'Identidade validada', APPROVED: 'Aprovada',
  IN_PROGRESS: 'Em execução', COMPLETED: 'Concluída', DENIED: 'Negada', FAILED: 'Falhou',
};

export default function PrivacidadePage() {
  const [items, setItems] = useState<PrivacyRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [subjectUuid, setSubjectUuid] = useState('');
  const [type, setType] = useState<'ERASURE' | 'EXPORT'>('ERASURE');
  const [reason, setReason] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { try { setItems(await fetchPrivacyRequests()); setError(null); } catch (err) { setError(getApiErrorMessage(err)); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    fetchClients({ page: 1, limit: 100 })
      .then((result) => { if (active) setClients(result.data); })
      .catch(() => { if (active) setError('Não foi possível carregar os clientes.'); })
      .finally(() => { if (active) setClientsLoading(false); });
    return () => { active = false; };
  }, []);

  const clientNames = new Map(clients.map((client) => [client.uuid, client.razao_social]));

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await createPrivacyRequest({ subjectType: 'CLIENT', subjectUuid, requestType: type, reason: reason || undefined }); setSubjectUuid(''); setReason(''); await load(); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }

  async function advance(item: PrivacyRequest, action: 'verify' | 'approve' | 'execute') {
    if (action === 'approve' && !legalBasis.trim()) { setError('Informe base legal ou decisão jurídica antes de aprovar.'); return; }
    setBusy(true); setError(null);
    try {
      const response = await advancePrivacyRequest(item.request_uuid, action, legalBasis.trim());
      if (action === 'execute' && item.request_type === 'EXPORT') {
        const payload = response.data as { data?: { exportData?: Record<string, unknown> } };
        const exportData = payload.data?.exportData;
        if (exportData) {
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
          anchor.href = url; anchor.download = `portabilidade-${item.subject_uuid}.json`; anchor.click(); URL.revokeObjectURL(url);
        }
      }
      await load();
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }

  return <section className='space-y-5' aria-labelledby='privacy-title'>
    <div><h1 id='privacy-title' className='text-xl font-bold text-slate-900'>Direitos dos titulares</h1>
      <p className='mt-1 max-w-3xl text-sm text-slate-600'>Registre e acompanhe pedidos de apagamento ou portabilidade dos dados de clientes.</p></div>
    {error && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'>{error}</div>}
    <form onSubmit={create} className='flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4'>
      <label className='grid min-w-72 flex-1 gap-1 text-sm font-medium text-slate-700'>Cliente
        <select required disabled={clientsLoading} value={subjectUuid} onChange={(event) => setSubjectUuid(event.target.value)} className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'>
          <option value=''>{clientsLoading ? 'Carregando clientes...' : ''}</option>
          {clients.map((client) => <option key={client.uuid} value={client.uuid}>{client.razao_social}</option>)}
        </select></label>
      <label className='grid gap-1 text-sm font-medium text-slate-700'>Direito solicitado<select value={type} onChange={(event) => setType(event.target.value as typeof type)} className='rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'><option value='ERASURE'>Apagamento</option><option value='EXPORT'>Portabilidade</option></select></label>
      <label className='grid min-w-56 flex-1 gap-1 text-sm font-medium text-slate-700'>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} className='rounded-lg border border-slate-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary' /></label>
      <button disabled={busy} className='inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60'><Plus className='h-4 w-4' />Registrar</button>
    </form>
    <label className='grid max-w-2xl gap-1 text-sm font-medium text-slate-700'>Justificativa legal para aprovação
      <textarea value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)} rows={2} className='rounded-lg border border-slate-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary' /></label>
    <div className='overflow-x-auto rounded-lg border border-slate-200 bg-white'><table className='w-full text-sm'><thead><tr className='bg-primary text-white'><th className='px-4 py-3 text-left'>Solicitação</th><th className='px-4 py-3 text-left'>Titular</th><th className='px-4 py-3 text-left'>Estado</th><th className='px-4 py-3 text-left'>Ação</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.request_uuid} className='border-b last:border-0'><td className='px-4 py-3'><p className='font-medium'>{item.request_type === 'ERASURE' ? 'Apagamento' : 'Portabilidade'}</p><p className='text-xs text-slate-600'>{new Date(item.created_at).toLocaleString('pt-BR')}</p></td><td className='px-4 py-3 font-medium text-slate-900'>{clientNames.get(item.subject_uuid) ?? 'Cliente não encontrado'}</td><td className='px-4 py-3'>{statusLabel[item.status]}</td><td className='px-4 py-3'>
        {item.status === 'RECEIVED' && <button disabled={busy} onClick={() => void advance(item, 'verify')} className='rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50'>Validar identidade</button>}
        {item.status === 'IDENTITY_VERIFIED' && <button disabled={busy} onClick={() => void advance(item, 'approve')} className='rounded-md bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-600'>Aprovar</button>}
        {item.status === 'APPROVED' && <button disabled={busy} onClick={() => void advance(item, 'execute')} className='inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-600'>{item.request_type === 'EXPORT' && <Download className='h-4 w-4' />}Executar</button>}
        {['COMPLETED','DENIED','FAILED'].includes(item.status) && <span className='text-slate-600'>Sem ação pendente</span>}
      </td></tr>)}</tbody></table>{items.length === 0 && <p className='p-8 text-center text-sm text-slate-600'>Nenhuma solicitação registrada.</p>}</div>
  </section>;
}
