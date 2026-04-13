import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoadingState from '@/components/feedback/LoadingState';
import AuthCallback from '@/pages/AuthCallback';
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

const UsuariosPage = lazy(() => import('@/pages/configuracoes/UsuariosPage'));
const RolesPage = lazy(() => import('@/pages/configuracoes/RolesPage'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Navigate to='/dashboard' replace />} />

          <Route
            path='dashboard'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Dashboard />} />
          </Route>

          <Route
            path='clientes'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Clientes />} />
            <Route path='novo' element={<ClienteForm />} />
            <Route path=':uuid/editar' element={<ClienteForm />} />
          </Route>

          <Route
            path='pedidos'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Pedidos />} />
            <Route path='novo' element={<PedidoForm />} />
          </Route>

          <Route
            path='produtos'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Produtos />} />
            <Route path='novo' element={<ProdutoForm />} />
            <Route path=':uuid/editar' element={<ProdutoForm />} />
          </Route>

          <Route
            path='transporte'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Transporte />} />
          </Route>

          <Route
            path='financeiro'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Financeiro />} />
          </Route>

          <Route
            path='configuracoes'
            element={(
              <ProtectedRoute adminOnly>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route element={<Configuracoes />}>
              <Route index element={<Navigate to='usuarios' replace />} />
              <Route
                path='usuarios'
                element={(
                  <Suspense fallback={<LoadingState />}>
                    <UsuariosPage />
                  </Suspense>
                )}
              />
              <Route
                path='roles'
                element={(
                  <Suspense fallback={<LoadingState />}>
                    <RolesPage />
                  </Suspense>
                )}
              />
            </Route>
          </Route>
          {/* OIDC callback route (must match provider redirect URI) */}
          <Route path='/callback' element={<AuthCallback />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
