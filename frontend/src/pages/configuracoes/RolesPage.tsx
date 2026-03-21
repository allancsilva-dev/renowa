import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import apiClient from '@/lib/apiClient';
import { getApiErrorMessage } from '@/lib/errors';
import { normalizeListResponse, type PaginationMeta } from '@/lib/pagination';

interface Role {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  permissions: string[];
}

interface Permission {
  slug: string;
  module: string;
  description: string | null;
}

interface RoleForm {
  name: string;
  description: string;
}

const PAGE_LIMIT = 10;
const DEFAULT_FORM: RoleForm = {
  name: '',
  description: '',
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<RoleForm>(DEFAULT_FORM);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const fetchRoles = useCallback(async (targetPage?: number) => {
    const nextPage = targetPage ?? meta.page;
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<unknown>('/roles', {
        params: { page: nextPage, limit: PAGE_LIMIT },
      });

      const parsed = normalizeListResponse<Role>(response.data, nextPage, PAGE_LIMIT);

      if (parsed.serverPaginated) {
        setRoles(parsed.items);
        setMeta(parsed.meta);
      } else {
        const start = (nextPage - 1) * PAGE_LIMIT;
        const paged = parsed.items.slice(start, start + PAGE_LIMIT);
        const totalPages = Math.max(1, Math.ceil(parsed.meta.total / PAGE_LIMIT));

        setRoles(paged);
        setMeta({
          total: parsed.meta.total,
          page: nextPage,
          limit: PAGE_LIMIT,
          totalPages,
        });
      }
    } catch (err) {
      setRoles([]);
      setMeta({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 });
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [meta.page]);

  const loadPermissions = useCallback(async () => {
    try {
      const response = await apiClient.get<unknown>('/permissions');
      const parsed = normalizeListResponse<Permission>(response.data, 1, 1000);
      setPermissions(parsed.items);
    } catch (err) {
      setPermissions([]);
      setPermissionsError(getApiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void fetchRoles(1);
  }, [fetchRoles]);

  useEffect(() => {
    if (!loaded) {
      void loadPermissions();
      setLoaded(true);
    }
  }, [loaded, loadPermissions]);

  const columns = useMemo(() => ([
    {
      key: 'name',
      header: 'Role',
      cell: (row: Role) => (
        <div>
          <p className='font-medium text-slate-900'>{row.name}</p>
          <p className='text-xs text-slate-500'>{row.description || 'Sem descrição'}</p>
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissões',
      cell: (row: Role) => row.permissions.length,
    },
    {
      key: 'actions',
      header: 'Ações',
      cell: (row: Role) => (
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => {
              setEditingRole(row);
              setSelectedPermissions(row.permissions);
              setPermissionsError(null);
            }}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Permissões
          </button>
          <button
            type='button'
            onClick={async () => {
              if (permissionsLoading) return;
              setPermissionsLoading(true);
              setPermissionsError(null);
              try {
                await apiClient.delete(`/roles/${row.id}`);
                await fetchRoles();
              } catch (err) {
                setPermissionsError(getApiErrorMessage(err));
              } finally {
                setPermissionsLoading(false);
              }
            }}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Desativar
          </button>
        </div>
      ),
    },
  ]), [fetchRoles, permissionsLoading]);

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (createLoading) return;

    setCreateLoading(true);
    setCreateError(null);

    try {
      await apiClient.post('/roles', {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
      });
      setCreateForm(DEFAULT_FORM);
      setIsCreateOpen(false);
      await fetchRoles(1);
    } catch (err) {
      setCreateError(getApiErrorMessage(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleSavePermissions(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRole) return;
    if (permissionsLoading) return;

    setPermissionsLoading(true);
    setPermissionsError(null);

    try {
      await apiClient.patch(`/roles/${editingRole.id}/permissions`, {
        permissions: selectedPermissions,
      });
      setEditingRole(null);
      await fetchRoles();
    } catch (err) {
      setPermissionsError(getApiErrorMessage(err));
    } finally {
      setPermissionsLoading(false);
    }
  }

  function togglePermission(slug: string) {
    setSelectedPermissions((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((item) => item !== slug);
      }
      return [...prev, slug];
    });
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Roles</h1>
          <p className='text-sm text-slate-500'>Defina funções e permissões para os usuários do tenant.</p>
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
          Nova Role
        </button>
      </div>

      {permissionsError && (
        <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>
          {permissionsError}
        </div>
      )}

      {error ? (
        <ErrorState description={error} onRetry={() => fetchRoles(meta.page)} />
      ) : roles.length === 0 && !loading ? (
        <EmptyState title='Nenhuma role cadastrada' />
      ) : (
        <DataTable
          columns={columns}
          data={roles}
          isLoading={loading}
          meta={meta}
          onPageChange={(page) => { void fetchRoles(page); }}
        />
      )}

      {isCreateOpen && (
        <div className='fixed inset-0 z-40 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setIsCreateOpen(false)}
          />
          <form
            onSubmit={handleCreateRole}
            className='relative z-10 w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-xl'
          >
            <h2 className='text-base font-semibold text-slate-900'>Nova Role</h2>
            {createError && (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>
                {createError}
              </div>
            )}
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Nome</label>
              <input
                type='text'
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Descrição</label>
              <textarea
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
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

      {editingRole && (
        <div className='fixed inset-0 z-40 flex items-center justify-center'>
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setEditingRole(null)}
          />
          <form
            onSubmit={handleSavePermissions}
            className='relative z-10 w-full max-w-2xl space-y-4 rounded-xl border bg-white p-6 shadow-xl'
          >
            <h2 className='text-base font-semibold text-slate-900'>Permissões da role: {editingRole.name}</h2>

            <div className='grid max-h-80 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2'>
              {permissions.map((permission) => (
                <label key={permission.slug} className='flex items-start gap-2 rounded-md px-2 py-1 hover:bg-slate-50'>
                  <input
                    type='checkbox'
                    checked={selectedPermissions.includes(permission.slug)}
                    onChange={() => togglePermission(permission.slug)}
                  />
                  <span className='text-sm text-slate-700'>
                    <strong>{permission.slug}</strong>
                    <br />
                    <span className='text-xs text-slate-500'>
                      {permission.description || permission.module}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setEditingRole(null)}
                className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
              >
                Cancelar
              </button>
              <button
                type='submit'
                disabled={permissionsLoading}
                className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-60'
              >
                {permissionsLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
