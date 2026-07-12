import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';

interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  /** Mensagem de erro; quando presente, exibe o estado de erro dentro da moldura. */
  error?: string | null;
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
}

export default function DataTable<T>({
  columns,
  data,
  isLoading = false,
  error = null,
  onRetry,
  errorTitle,
  errorDescription,
  emptyTitle,
  emptyDescription,
  emptyAction,
  meta,
  onPageChange,
}: DataTableProps<T>) {
  return (
    <div className='w-full'>
      <div className='overflow-hidden rounded-lg border bg-white shadow-sm'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b bg-primary text-white'>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn('px-4 py-3 text-left font-semibold', col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={columns.length} className='p-0'>
                  <ErrorState bare title={errorTitle} description={errorDescription} onRetry={onRetry} />
                </td>
              </tr>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className='border-b animate-pulse'>
                  {columns.map((col) => (
                    <td key={col.key} className='px-4 py-3'>
                      <div className='h-4 rounded bg-slate-200' />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className='p-0'>
                  <EmptyState bare title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  className='border-b last:border-0 hover:bg-slate-50 transition-colors'
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {meta && meta.totalPages > 1 && (
        <div className='mt-4 flex items-center justify-between text-sm text-slate-600'>
          <span>
            Mostrando {(meta.page - 1) * meta.limit + 1}–
            {Math.min(meta.page * meta.limit, meta.total)} de {meta.total}
          </span>

          <div className='flex items-center gap-1'>
            <button
              onClick={() => onPageChange?.(meta.page - 1)}
              disabled={meta.page <= 1}
              className='rounded p-1 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <ChevronLeft className='h-4 w-4' />
            </button>

            <span className='px-2 font-medium'>
              {meta.page} / {meta.totalPages}
            </span>

            <button
              onClick={() => onPageChange?.(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              className='rounded p-1 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
            >
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
