import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import apiClient from '@/lib/apiClient';
import { getApiErrorMessage } from '@/lib/errors';
import { normalizeListResponse, type PaginationMeta } from '@/lib/pagination';

interface TenantUser {
  id: string;
  authUserId: string;
  email: string;
  role: string;
  tenantId: string;
  active: boolean;
}

interface UserUpsertForm {
  email: string;
  nome: string;
  senha: string;
  role: string;
}

const PAGE_LIMIT = 10;
const DEFAULT_FORM: UserUpsertForm = {
  email: '',
  nome: '',
  senha: '',
  role: 'viewer',
};

const ROLE_OPTIONS = ['admin', 'manager', 'viewer'];

export default function UsuariosPage() {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserUpsertForm>(DEFAULT_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editRole, setEditRole] = useState('viewer');
  const [editActive, setEditActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (targetPage?: number) => {
    const nextPage = targetPage ?? meta.page;
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<unknown>('/users', {
        params: { page: nextPage, limit: PAGE_LIMIT },
      });

      const parsed = normalizeListResponse<TenantUser>(response.data, nextPage, PAGE_LIMIT);

      if (parsed.serverPaginated) {
        setUsers(parsed.items);
        setMeta(parsed.meta);
      } else {
        const start = (nextPage - 1) * PAGE_LIMIT;
        const paged = parsed.items.slice(start, start + PAGE_LIMIT);
        const totalPages = Math.max(1, Math.ceil(parsed.meta.total / PAGE_LIMIT));

        setUsers(paged);
        setMeta({
          total: parsed.meta.total,
          page: nextPage,
          limit: PAGE_LIMIT,
          totalPages,
        });
      }
    } catch (err) {
      setUsers([]);
      setMeta({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 });
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [meta.page]);

  useEffect(() => {
    void fetchUsers(1);
  }, [fetchUsers]);

  const columns = useMemo(() => ([
    {
      key: 'email',
      header: 'E-mail',
      cell: (row: TenantUser) => (
        <div>
          <p className='font-medium text-slate-900'>{row.email}</p>
          <p className='text-xs text-slate-500'>Auth ID: {row.authUserId}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row: TenantUser) => row.role,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: TenantUser) => row.active ? 'Ativo' : 'Inativo',
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: TenantUser) => (
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => {
              setEditingUser(row);
              setEditRole(row.role || 'viewer');
              setEditActive(row.active);
              setEditNewPassword('');
              setUpdateError(null);
            }}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Editar
          </button>
          <button
            type='button'
            onClick={async () => {
              if (updateLoading) return;
              setUpdateLoading(true);
              setUpdateError(null);
              try {
                await apiClient.patch(`/users/${row.id}`, { active: !row.active });
                await fetchUsers();
              } catch (err) {
                setUpdateError(getApiErrorMessage(err));
              } finally {
                setUpdateLoading(false);
              }
            }}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            {row.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      ),
    },
  ]), [fetchUsers, updateLoading]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (createLoading) return;

    setCreateLoading(true);
    setCreateError(null);

    try {
      await apiClient.post('/users', {
        email: createForm.email.trim(),
        nome: createForm.nome.trim(),
        senha: createForm.senha,
        role: createForm.role,
      });
      setCreateForm(DEFAULT_FORM);
      setIsCreateOpen(false);
      await fetchUsers(1);
    } catch (err) {
      setCreateError(getApiErrorMessage(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (updateLoading) return;

    setUpdateLoading(true);
    setUpdateError(null);

    try {
      await apiClient.patch(`/users/${editingUser.id}`, {
        role: editRole,
        active: editActive,
        ...(editNewPassword ? { new_password: editNewPassword } : {}),
      });
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      setUpdateError(getApiErrorMessage(err));
    } finally {
      setUpdateLoading(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Usuários</h1>
          <p className='text-sm text-slate-500'>Gerencie os usuários do tenant e seus níveis de acesso.</p>
        </div>
        <button
          type='button'
          onClick={() => {
            setCreateForm(DEFAULT_FORM);
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Novo Usuário
        </button>
      </div>

      {updateError && (
        <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>
          {updateError}
        </div>
      )}

      {error ? (
        <ErrorState description={error} onRetry={() => fetchUsers(meta.page)} />
      ) : users.length === 0 && !loading ? (
        <EmptyState title='Nenhum usuário cadastrado' />
      ) : (
        <DataTable
          columns={columns}
          data={users}
          isLoading={loading}
          meta={meta}
          onPageChange={(page) => { void fetchUsers(page); }}
        />
      )}

      {isCreateOpen && (
        <div className='fixed inset-0 z-40 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setIsCreateOpen(false)}
          />
          <form
            onSubmit={handleCreateUser}
            className='relative z-10 w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-xl'
          >
            <h2 className='text-base font-semibold text-slate-900'>Novo Usuário</h2>
            {createError && (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>
                {createError}
              </div>
            )}
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>E-mail</label>
              <input
                type='email'
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Nome</label>
              <input
                type='text'
                required
                value={createForm.nome}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, nome: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Senha</label>
              <input
                type='password'
                required
                minLength={8}
                autoComplete='new-password'
                value={createForm.senha}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, senha: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
              <p className='text-xs text-slate-400'>Mínimo 8 caracteres.</p>
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setIsCreateOpen(false)}
                className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
              >
                Cancelar
              </button>
              <button
                type='submit'
                disabled={createLoading}
                className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60'
              >
                {createLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className='fixed inset-0 z-40 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setEditingUser(null)}
          />
          <form
            onSubmit={handleUpdateUser}
            className='relative z-10 w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-xl'
          >
            <h2 className='text-base font-semibold text-slate-900'>Editar Usuário</h2>
            <p className='text-sm text-slate-500'>{editingUser.email}</p>

            {updateError && (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>
                {updateError}
              </div>
            )}

            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <label className='flex items-center gap-2 text-sm text-slate-700'>
              <input
                type='checkbox'
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              Usuário ativo
            </label>

            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Nova senha</label>
              <input
                type='password'
                minLength={8}
                autoComplete='new-password'
                placeholder='Deixe em branco para manter'
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>

            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setEditingUser(null)}
                className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
              >
                Cancelar
              </button>
              <button
                type='submit'
                disabled={updateLoading}
                className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60'
              >
                {updateLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
