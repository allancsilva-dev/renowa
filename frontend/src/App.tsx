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
const Fornecedores = lazy(() => import('@/pages/Fornecedores'));
const FornecedorForm = lazy(() => import('@/pages/FornecedorForm'));
const PedidoDetalhe = lazy(() => import('@/pages/PedidoDetalhe'));
const Transporte = lazy(() => import('@/pages/Transporte'));
const Financeiro = lazy(() => import('@/pages/Financeiro'));
const Faturamento = lazy(() => import('@/pages/Faturamento'));
const FaturamentoDetalhe = lazy(() => import('@/pages/FaturamentoDetalhe'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));
const ConfiguracoesHome = lazy(() => import('@/pages/configuracoes/ConfiguracoesHome'));
const UsuariosPage = lazy(() => import('@/pages/configuracoes/UsuariosPage'));
const RolesPage = lazy(() => import('@/pages/configuracoes/RolesPage'));
const AuditoriaPage = lazy(() => import('@/pages/configuracoes/AuditoriaPage'));
const PrivacidadePage = lazy(() => import('@/pages/configuracoes/PrivacidadePage'));

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
            <Route path=':uuid/editar' element={<PedidoForm />} />
            <Route path=':uuid' element={<PedidoDetalhe />} />
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
            path='fornecedores'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Fornecedores />} />
            <Route path='novo' element={<FornecedorForm />} />
            <Route path=':uuid/editar' element={<FornecedorForm />} />
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
            path='faturamento'
            element={(
              <ProtectedRoute permission='faturamento.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Faturamento />} />
            <Route path=':uuid' element={<FaturamentoDetalhe />} />
          </Route>

          <Route
            path='configuracoes'
            element={(
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route element={<Configuracoes />}>
              <Route index element={<ConfiguracoesHome />} />
              <Route path='usuarios' element={(
                <ProtectedRoute permission='usuarios.gerenciar'><UsuariosPage /></ProtectedRoute>
              )} />
              <Route path='roles' element={(
                <ProtectedRoute permission='usuarios.gerenciar'><RolesPage /></ProtectedRoute>
              )} />
              <Route path='auditoria' element={(
                <ProtectedRoute permission='auditoria.ver'><AuditoriaPage /></ProtectedRoute>
              )} />
              <Route path='privacidade' element={(
                <ProtectedRoute permission='privacidade.gerenciar'><PrivacidadePage /></ProtectedRoute>
              )} />
            </Route>
          </Route>
          <Route path='*' element={<Navigate to='/dashboard' replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
