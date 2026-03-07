import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/authStore';
import Dashboard from '@/pages/Dashboard';
import Clientes from '@/pages/Clientes';
import Pedidos from '@/pages/Pedidos';
import Produtos from '@/pages/Produtos';
import Transporte from '@/pages/Transporte';
import Financeiro from '@/pages/Financeiro';
import Configuracoes from '@/pages/Configuracoes';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to='/login' replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota raiz redireciona para dashboard */}
        <Route path='/' element={<Navigate to='/dashboard' replace />} />

        {/* Rotas protegidas dentro do AppShell */}
        <Route
          path='/'
          element={
            <PrivateRoute>
              <AppShell />
            </PrivateRoute>
          }
        >
          <Route path='dashboard' element={<Dashboard />} />
          <Route path='clientes' element={<Clientes />} />
          <Route path='pedidos' element={<Pedidos />} />
          <Route path='produtos' element={<Produtos />} />
          <Route path='transporte' element={<Transporte />} />
          <Route path='financeiro' element={<Financeiro />} />
          <Route path='configuracoes' element={<Configuracoes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
