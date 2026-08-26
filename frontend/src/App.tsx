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
const PedidoExternoForm = lazy(() => import('@/pages/PedidoExternoForm'));
const Sac = lazy(() => import('@/pages/Sac'));
const SacForm = lazy(() => import('@/pages/SacForm'));
const SacDetalhe = lazy(() => import('@/pages/SacDetalhe'));
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

          {/* Cada módulo declara a permissão de leitura que o backend exige, e
              cada formulário a de escrita. A URL digitada à mão é o caminho que
              a sidebar filtrada não cobre. */}
          <Route
            path='clientes'
            element={(
              <ProtectedRoute permission='clientes.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Clientes />} />
            <Route path='novo' element={<ProtectedRoute permission='clientes.criar'><ClienteForm /></ProtectedRoute>} />
            <Route path=':uuid/editar' element={<ProtectedRoute permission='clientes.editar'><ClienteForm /></ProtectedRoute>} />
          </Route>

          <Route
            path='pedidos'
            element={(
              <ProtectedRoute permission='pedidos.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            {/* Cada formulário declara a permissão que o backend vai exigir no
                submit: sem isso quem só tem `pedidos.ver` preenche a tela inteira
                e descobre a recusa ao salvar. */}
            <Route index element={<Pedidos />} />
            <Route path='novo' element={<ProtectedRoute permission='pedidos.criar'><PedidoForm /></ProtectedRoute>} />
            {/* Pedido externo: form próprio (sem itens), mesmo detalhe e mesmo
                ciclo de liberação/faturamento do pedido interno. */}
            <Route path='externo/novo' element={<ProtectedRoute permission='pedidos.criar'><PedidoExternoForm /></ProtectedRoute>} />
            <Route path='externo/:uuid/editar' element={<ProtectedRoute permission='pedidos.editar'><PedidoExternoForm /></ProtectedRoute>} />
            {/* `externo` sem sufixo cairia em `:uuid` e viraria erro de API em vez
                de rota inexistente. */}
            <Route path='externo' element={<Navigate to='/pedidos' replace />} />
            <Route path=':uuid/editar' element={<ProtectedRoute permission='pedidos.editar'><PedidoForm /></ProtectedRoute>} />
            <Route path=':uuid' element={<PedidoDetalhe />} />
          </Route>

          {/* SAC declara a permissão na rota (mesmo padrão de /faturamento):
              o item da sidebar já é filtrado, mas a URL digitada à mão não. */}
          <Route
            path='sac'
            element={(
              <ProtectedRoute permission='sac.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Sac />} />
            <Route path='novo' element={<ProtectedRoute permission='sac.criar'><SacForm /></ProtectedRoute>} />
            <Route path=':uuid/editar' element={<ProtectedRoute permission='sac.editar'><SacForm /></ProtectedRoute>} />
            <Route path=':uuid' element={<SacDetalhe />} />
          </Route>

          <Route
            path='produtos'
            element={(
              <ProtectedRoute permission='produtos.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Produtos />} />
            <Route path='novo' element={<ProtectedRoute permission='produtos.criar'><ProdutoForm /></ProtectedRoute>} />
            <Route path=':uuid/editar' element={<ProtectedRoute permission='produtos.editar'><ProdutoForm /></ProtectedRoute>} />
          </Route>

          <Route
            path='fornecedores'
            element={(
              <ProtectedRoute permission='fornecedores.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Fornecedores />} />
            <Route path='novo' element={<ProtectedRoute permission='fornecedores.criar'><FornecedorForm /></ProtectedRoute>} />
            <Route path=':uuid/editar' element={<ProtectedRoute permission='fornecedores.editar'><FornecedorForm /></ProtectedRoute>} />
          </Route>

          <Route
            path='transporte'
            element={(
              <ProtectedRoute permission='transportadoras.ver'>
                <AppShell />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Transporte />} />
          </Route>

          <Route
            path='financeiro'
            element={(
              <ProtectedRoute permission='financeiro.ver'>
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
