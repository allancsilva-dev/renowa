import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import apiClient from '@/lib/apiClient';
import { getApiErrorMessage } from '@/lib/errors';
import { normalizeListResponse, type PaginationMeta } from '@/lib/pagination';
import Dialog from '@/components/ui/Dialog';
import { formatRoleName } from '@renowa/shared';
import { mergeRoleOptions, type RoleOption, type TenantRoleSummary } from '@/lib/roleOptions';

interface TenantUser {
  id: string;
  authUserId: string;
  name: string;
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

/**
 * Sem perfil pré-selecionado: a escolha é explícita. Um default aqui seria
 * escolher privilégio por omissão — foi assim que `viewer` virou o padrão de
 * quem só apertava "Salvar".
 */
const DEFAULT_FORM: UserUpsertForm = {
  email: '',
  nome: '',
  senha: '',
  role: '',
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserUpsertForm>(DEFAULT_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>(() => mergeRoleOptions([]));
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (targetPage = 1) => {
    const nextPage = targetPage;
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
  }, []);

  const fetchRoleOptions = useCallback(async () => {
    try {
      const response = await apiClient.get<unknown>('/roles', { params: { limit: 100 } });
      const parsed = normalizeListResponse<TenantRoleSummary>(response.data, 1, 100);
      setRoleOptions(mergeRoleOptions(parsed.items));
      setRoleOptionsError(null);
    } catch {
      // Não trava a tela: sem a lista do tenant, os templates ainda permitem
      // criar usuário — só os perfis sob medida ficam de fora.
      setRoleOptions(mergeRoleOptions([]));
      setRoleOptionsError('Não foi possível carregar os perfis do tenant. Mostrando apenas os perfis padrão.');
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
    void fetchRoleOptions();
  }, [fetchUsers, fetchRoleOptions]);

  const columns = useMemo(() => ([
    {
      key: 'email',
      header: 'Usuário',
      cell: (row: TenantUser) => (
        <div>
          <p className='font-medium text-slate-900'>{row.name || row.email}</p>
          <p className='text-xs text-slate-600'>{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Perfil de acesso',
      cell: (row: TenantUser) => formatRoleName(row.role),
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
              setEditRole(row.role);
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
          <p className='text-sm text-slate-600'>Gerencie pessoas e defina o que cada uma pode acessar.</p>
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

      <DataTable
        columns={columns}
        data={users}
        isLoading={loading}
        error={error}
        errorDescription={error ?? undefined}
        onRetry={() => fetchUsers(meta.page)}
        meta={meta}
        onPageChange={(page) => { void fetchUsers(page); }}
        emptyTitle='Nenhum usuário cadastrado'
      />

      {isCreateOpen && (
        <Dialog open title='Novo usuário' onClose={() => setIsCreateOpen(false)} className='max-w-md'>
          <form
            onSubmit={handleCreateUser}
            className='space-y-4'
          >
            {createError && (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>
                {createError}
              </div>
            )}
            <div className='space-y-1'>
              <label htmlFor='new-user-email' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>E-mail</label>
              <input
                type='email'
                id='new-user-email'
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='space-y-1'>
              <label htmlFor='new-user-name' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Nome</label>
              <input
                type='text'
                id='new-user-name'
                required
                value={createForm.nome}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, nome: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='space-y-1'>
              <label htmlFor='new-user-password' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Senha</label>
              <input
                type='password'
                id='new-user-password'
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
              <label htmlFor='new-user-role' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Perfil de acesso</label>
              {roleOptionsError && (
                <p role='status' className='text-xs text-amber-700'>{roleOptionsError}</p>
              )}
              <select
                id='new-user-role'
                required
                value={createForm.role}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              >
                <option value='' disabled>Selecione o perfil</option>
                {roleOptions.map((role) => (
                  <option key={role.name} value={role.name}>{role.label}</option>
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
        </Dialog>
      )}

      {editingUser && (
        <Dialog open title='Editar usuário' onClose={() => setEditingUser(null)} className='max-w-md'>
          <form
            onSubmit={handleUpdateUser}
            className='space-y-4'
          >
            <p className='text-sm text-slate-500'>{editingUser.email}</p>

            {updateError && (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>
                {updateError}
              </div>
            )}

            <div className='space-y-1'>
              <label htmlFor='edit-user-role' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Perfil de acesso</label>
              <select
                id='edit-user-role'
                required
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              >
                {/* Perfil sob medida (criado em Perfis) não está em ROLE_TEMPLATES;
                    sem esta opção ele sumiria do select ao editar o usuário. */}
                {!roleOptions.some((role) => role.name === editRole) && (
                  <option value={editRole}>{formatRoleName(editRole)}</option>
                )}
                {roleOptions.map((role) => (
                  <option key={role.name} value={role.name}>{role.label}</option>
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
              <label htmlFor='edit-user-password' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Nova senha</label>
              <input
                type='password'
                id='edit-user-password'
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
        </Dialog>
      )}
    </div>
  );
}
