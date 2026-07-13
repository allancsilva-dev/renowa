import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Clientes = lazy(() => import('@/pages/Clientes'));
const ClienteForm = lazy(() => import('@/pages/ClienteForm'));
const Pedidos = lazy(() => import('@/pages/Pedidos'));
const PedidoForm = lazy(() => import('@/pages/PedidoForm'));
const Produtos = lazy(() => import('@/pages/Produtos'));
const ProdutoForm = lazy(() => import('@/pages/ProdutoForm'));
const Transporte = lazy(() => import('@/pages/Transporte'));
const Financeiro = lazy(() => import('@/pages/Financeiro'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const ConfiguracoesHome = lazy(() => import('@/pages/configuracoes/ConfiguracoesHome'));
const UsuariosPage = lazy(() => import('@/pages/configuracoes/UsuariosPage'));
const RolesPage = lazy(() => import('@/pages/configuracoes/RolesPage'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/login' element={<Login />} />
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
              <Route index element={<ConfiguracoesHome />} />
              <Route path='usuarios' element={<UsuariosPage />} />
              <Route path='roles' element={<RolesPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
