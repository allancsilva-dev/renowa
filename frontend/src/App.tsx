import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/authStore';
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import Pedidos from '@/pages/Pedidos';
import Produtos from '@/pages/Produtos';
import Transporte from '@/pages/Transporte';
import Financeiro from '@/pages/Financeiro';
import Configuracoes from '@/pages/Configuracoes';

const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
const AUD = import.meta.env.VITE_EXPECTED_AUD ?? 'renowa.zonadev.tech';

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
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
            <Route path='pedidos' element={<Pedidos />} />
            <Route path='produtos' element={<Produtos />} />
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
