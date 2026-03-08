import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/authStore';
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import ClienteForm from '@/pages/ClienteForm';
import Pedidos from '@/pages/Pedidos';
import PedidoForm from '@/pages/PedidoForm';
import Produtos from '@/pages/Produtos';
import ProdutoForm from '@/pages/ProdutoForm';
import Transporte from '@/pages/Transporte';
import Financeiro from '@/pages/Financeiro';
import Configuracoes from '@/pages/Configuracoes';

const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
const AUD = import.meta.env.VITE_EXPECTED_AUD ?? 'renowa.zonadev.tech';

function ProtectedRoute() {
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    fetch(`${AUTH_URL}/api/auth/me`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => {
        setUser(data);
        setAuthState('authenticated');
      })
      .catch(() => {
        clearAuth();
        setAuthState('unauthenticated');
      });
  }, [setUser, clearAuth]);

  if (authState === 'checking') return null;

  if (authState === 'unauthenticated') {
    window.location.href = `${AUTH_URL}/login?aud=${AUD}&redirect=${encodeURIComponent(window.location.href)}`;
    return null;
  }

  return <Outlet />;
}

function RoleRoute({ roles }: { roles: string[] }) {
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  return hasAnyRole(roles) ? <Outlet /> : <Navigate to='/' replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Navigate to='/dashboard' replace />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path='dashboard' element={<Dashboard />} />
            <Route path='clientes' element={<Clientes />} />
            <Route path='clientes/novo' element={<ClienteForm />} />
            <Route path='clientes/:uuid/editar' element={<ClienteForm />} />
            <Route path='pedidos' element={<Pedidos />} />
            <Route path='pedidos/novo' element={<PedidoForm />} />
            <Route path='produtos' element={<Produtos />} />
            <Route path='produtos/novo' element={<ProdutoForm />} />
            <Route path='produtos/:uuid/editar' element={<ProdutoForm />} />
            <Route path='transporte' element={<Transporte />} />
            <Route path='financeiro' element={<Financeiro />} />
            <Route element={<RoleRoute roles={['ADMIN']} />}>
              <Route path='configuracoes' element={<Configuracoes />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
