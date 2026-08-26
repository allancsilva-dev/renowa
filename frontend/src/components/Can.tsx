import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

export type PermissionMode = 'all' | 'any';

interface CanProps {
  /** Slug único ou lista. Espelha o `@RequirePermission` do backend. */
  permission: string | readonly string[];
  /** `all` exige todas (padrão, como o backend); `any` basta uma. */
  mode?: PermissionMode;
  /** O que renderizar quando não autorizado. Por padrão, nada. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Gate declarativo de ação.
 *
 * O backend já recusa com 403 — isto não é a barreira de segurança, é o
 * contrato de autorização da interface. Sem ele, o usuário encontrava o botão,
 * preenchia o formulário inteiro e só descobria a recusa no submit.
 *
 * Para barrar uma rota inteira use `ProtectedRoute`, que redireciona; aqui a
 * ausência de permissão apenas some com o elemento.
 */
export function Can({ permission, mode = 'all', fallback = null, children }: CanProps) {
  const { hasPermission } = useAuth();
  const required = Array.isArray(permission) ? permission : [permission as string];

  const allowed = mode === 'any'
    ? required.some((slug) => hasPermission(slug))
    : required.every((slug) => hasPermission(slug));

  return <>{allowed ? children : fallback}</>;
}

export default Can;
