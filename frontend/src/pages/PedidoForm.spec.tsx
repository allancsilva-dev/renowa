// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PedidoForm from './PedidoForm';

/**
 * BACKLOG-0066: trocar o fornecedor executava `setItems([newItem()])` e
 * descartava toda linha digitada, sem aviso e sem undo. Em edição isso também
 * perdia os `uuid` dos itens persistidos — e como o PUT manda `itens` completo,
 * o save seguinte apagava os itens no backend.
 */

const saveOrder = vi.fn();
const duplicateOrder = vi.fn();
const fetchOrder = vi.fn();
const fetchAllPages = vi.fn();
const fetchProducts = vi.fn();
const fetchSuppliers = vi.fn();
const routerSearch = vi.hoisted(() => ({ value: '' }));
const routerParams = vi.hoisted(() => ({ uuid: undefined as string | undefined }));
const fetchOrderItemPhoto = vi.fn();
const fetchOrderItemPhotoDataUrl = vi.fn();
const uploadOrderItemPhoto = vi.fn();
const deleteOrderItemPhoto = vi.fn();
const liberarOrder = vi.fn();

vi.mock('@/services/orders.service', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  saveOrder: (...args: unknown[]) => saveOrder(...args),
  duplicateOrder: (...args: unknown[]) => duplicateOrder(...args),
  liberarOrder: (...args: unknown[]) => liberarOrder(...args),
}));
vi.mock('@/services/clients.service', () => ({
  fetchClients: vi.fn(async () => ({
    data: [
      { uuid: 'cli-1', razao_social: 'Cliente Um', cnpj: null },
      // Pagamento padrão fora da lista canônica: é o que clientes antigos e os
      // importados por CSV têm de verdade.
      { uuid: 'cli-2', razao_social: 'Cliente Legado', cnpj: null, pgt_padrao: 'Boleto 30/60' },
    ],
    meta: { page: 1, totalPages: 1 },
  })),
}));
vi.mock('@/services/products.service', () => ({
  fetchProducts: (...args: unknown[]) => fetchProducts(...args),
}));
vi.mock('@/services/suppliers.service', () => ({
  fetchSuppliers: (...args: unknown[]) => fetchSuppliers(...args),
}));
vi.mock('@/lib/fetchAllPages', () => ({ fetchAllPages: (...args: unknown[]) => fetchAllPages(...args) }));
vi.mock('@/services/productPhotos.service', () => ({
  fetchOrderItemPhoto: (...args: unknown[]) => fetchOrderItemPhoto(...args),
  fetchOrderItemPhotoDataUrl: (...args: unknown[]) => fetchOrderItemPhotoDataUrl(...args),
  uploadOrderItemPhoto: (...args: unknown[]) => uploadOrderItemPhoto(...args),
  deleteOrderItemPhoto: (...args: unknown[]) => deleteOrderItemPhoto(...args),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasAnyRole: () => false, hasPermission: () => true }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => routerParams,
  useSearchParams: () => [new URLSearchParams(routerSearch.value)],
}));

const FORNECEDOR_A = { uuid: 'forn-a', razao_social: 'Fornecedor A' };
const FORNECEDOR_B = { uuid: 'forn-b', razao_social: 'Fornecedor B' };
const PRODUTO_A = { uuid: 'prod-a', codigo: 'AAA-1', descricao: 'Produto A', preco_base: '25.50', ipi_perc: '10', quantidade: 12 };
const PRODUTO_B = { uuid: 'prod-b', codigo: 'BBB-1', descricao: 'Produto B', preco_base: '30.00', ipi_perc: '5', quantidade: 6 };

beforeEach(() => {
  routerSearch.value = '';
  routerParams.uuid = undefined;
  fetchOrderItemPhoto.mockResolvedValue(null);
  uploadOrderItemPhoto.mockResolvedValue({ uuid: 'foto-nova', version: 1 });
  deleteOrderItemPhoto.mockResolvedValue(undefined);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:item-preview');
  globalThis.URL.revokeObjectURL = vi.fn();
  // `products` é recarregado por fornecedor; os demais recursos são fixos.
  fetchAllPages.mockImplementation(async (path: string, params?: { fornecedor_uuid?: string }) => {
    if (path === '/fornecedores') return [FORNECEDOR_A, FORNECEDOR_B];
    if (path === '/produtos') return params?.fornecedor_uuid === 'forn-b' ? [PRODUTO_B] : [PRODUTO_A];
    return [];
  });
  fetchProducts.mockImplementation(async ({ fornecedor_uuid }: { fornecedor_uuid?: string }) => ({
    data: fornecedor_uuid === 'forn-b' ? [PRODUTO_B] : [PRODUTO_A],
    meta: { page: 1, totalPages: 1 },
  }));
  fetchSuppliers.mockResolvedValue({
    data: [FORNECEDOR_A, FORNECEDOR_B],
    meta: { page: 1, totalPages: 1 },
  });
});

describe('PedidoForm — duplicação', () => {
  it('limpa cliente, cria UUID novo e envia vínculo seguro da foto fonte', async () => {
    routerSearch.value = 'duplicar=pedido-fonte';
    fetchOrder.mockResolvedValue({
      uuid: 'pedido-fonte', version: 7, origem: 'interno', status: 'faturado', data: '2025-01-01',
      cliente: { uuid: 'cliente-antigo', razao_social: 'Cliente Antigo' },
      vendedor: null, fornecedor: FORNECEDOR_A, transportadora: { uuid: 'transporte-antigo' },
      pgt: 'ANTIGO', prazo: '30 dias', local_entrega: 'Endereço antigo', tipo_faturamento: 'Total', observacao: 'Copiar',
      itens: [{
        uuid: '11111111-1111-4111-8111-111111111111', produto: PRODUTO_A,
        foto_especifica: { uuid: 'foto-1', version: 1 },
        codigo_manual: 'AAA-1', descricao_manual: 'Produto A', qtd_caixas: '2', qtd_unitaria: '3',
        preco_unitario: '25.50', desconto_perc: '5', ipi_perc: '10',
      }],
    });
    duplicateOrder.mockResolvedValue({ uuid: 'pedido-novo', version: 1 });

    await montar();

    expect(screen.getByRole('heading', { name: 'Duplicar pedido' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('');
    expect(screen.getByLabelText(/Transportadora/)).toHaveValue('');
    expect(screen.getByText('Foto do pedido original será copiada')).toBeInTheDocument();

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Um' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar pedido' }).closest('form')!);

    await waitFor(() => expect(duplicateOrder).toHaveBeenCalled());
    const [sourceUuid, payload] = duplicateOrder.mock.calls[0];
    expect(sourceUuid).toBe('pedido-fonte');
    expect(payload).toMatchObject({ cliente_uuid: 'cli-1', pgt: null, local_entrega: null, transportadora_uuid: null });
    expect(payload.itens[0]).toMatchObject({ foto_origem_item_uuid: '11111111-1111-4111-8111-111111111111' });
    expect(payload.itens[0].uuid).not.toBe('11111111-1111-4111-8111-111111111111');
  });
});

describe('PedidoForm — forma de pagamento', () => {
  it('oferece a lista canônica e mantém o valor legado herdado do cliente', async () => {
    await montar();

    const pagamento = screen.getByLabelText('Forma de pagamento') as HTMLSelectElement;
    expect(pagamento.tagName).toBe('SELECT');
    expect([...pagamento.options].map((o) => o.value))
      .toEqual(['', 'BOL', 'BOL/BOL', 'BOL/CHEQUE', 'BOL/PIX', 'PIX']);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Legado' }));

    // Sem a opção extra derivada do estado vivo, o DOM cairia na opção vazia e o
    // save apagaria o pagamento herdado sem nenhum aviso na tela.
    await waitFor(() => expect(pagamento).toHaveValue('Boleto 30/60'));
    expect([...pagamento.options].map((o) => o.value)).toContain('Boleto 30/60');
  });

  it('grava a opção escolhida na lista', async () => {
    await montar();

    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'BOL/PIX' } });

    expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('BOL/PIX');
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Renderiza, espera o fetch inicial e devolve os campos usados pelos casos. */
async function montar() {
  render(<PedidoForm />);
  await waitFor(() => expect(screen.getByLabelText(/Fornecedor/)).toBeInTheDocument());
  return {
    fornecedor: screen.getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement,
    produto: () => screen.getByLabelText('Buscar produto do item 1') as HTMLInputElement,
    caixas: () => screen.getByLabelText('Caixas') as HTMLInputElement,
    desconto: () => screen.getByLabelText('Desconto (%)') as HTMLInputElement,
    ipi: () => screen.getByLabelText('IPI (%)') as HTMLInputElement,
    codigo: () => screen.getByLabelText('Código') as HTMLInputElement,
  };
}

async function escolherProduto(index = 0, nome = /AAA-1/) {
  const campos = screen.getAllByRole('combobox', { name: /Buscar produto do item/ });
  fireEvent.focus(campos[index]);
  fireEvent.click(await screen.findByRole('option', { name: nome }));
}

async function escolherFornecedor(nome = 'Fornecedor A') {
  const campo = screen.getByRole('combobox', { name: 'Fornecedor' });
  fireEvent.focus(campo);
  fireEvent.click(await screen.findByRole('option', { name: nome }));
}

describe('PedidoForm — troca de fornecedor', () => {
  it('move a ação de adicionar para o fim quando há vários itens', async () => {
    await montar();

    const section = screen.getByRole('heading', { name: 'Itens' }).closest('section')!;
    const topAction = screen.getByRole('button', { name: 'Adicionar item' });
    expect(topAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));

    fireEvent.click(topAction);

    expect(screen.getByText('Item 2')).toBeInTheDocument();
    const bottomAction = screen.getByRole('button', { name: 'Adicionar item' });
    expect(section.lastElementChild).toContainElement(bottomAction);

    fireEvent.click(bottomAction);
    expect(screen.getByText('Item 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Adicionar item' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover item 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover item 2' }));

    const restoredTopAction = screen.getByRole('button', { name: 'Adicionar item' });
    expect(restoredTopAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));
  });

  it('mostra o valor unitário com desconto durante o preenchimento', async () => {
    const campos = await montar();

    await escolherFornecedor();
    await escolherProduto();
    expect(screen.getByLabelText('Unidades por caixa')).toHaveValue(12);
    expect(campos.caixas()).toHaveValue(1);
    fireEvent.change(campos.desconto(), { target: { value: '10' } });

    expect(screen.getByText('Valor unitário com desconto:').parentElement).toHaveTextContent('R$ 22,95');
  });

  it('preserva as linhas e só desvincula o produto', async () => {
    const campos = await montar();

    await escolherFornecedor();
    await escolherProduto();
    fireEvent.change(campos.caixas(), { target: { value: '4' } });
    fireEvent.change(campos.desconto(), { target: { value: '10' } });
    expect(campos.ipi()).toHaveValue(10);

    await escolherFornecedor('Fornecedor B');

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
    expect(campos.caixas()).toHaveValue(4);
    expect(campos.desconto()).toHaveValue(10);
    expect(campos.ipi()).toHaveValue(10);
    expect(campos.produto()).toHaveValue('');
    expect(campos.produto()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 item precisa de um novo produto');
  });

  it('reselecionar o mesmo fornecedor não mexe na linha', async () => {
    const campos = await montar();

    await escolherFornecedor();
    await escolherProduto();

    await escolherFornecedor();

    expect(campos.produto()).toHaveValue('AAA-1 — Produto A');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('linha manual não depende de fornecedor e fica intacta', async () => {
    const campos = await montar();

    await escolherFornecedor();
    fireEvent.change(campos.codigo(), { target: { value: 'MANUAL-9' } });

    await escolherFornecedor('Fornecedor B');

    expect(campos.codigo()).toHaveValue('MANUAL-9');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('bloqueia o save enquanto a linha estiver sem produto e libera ao escolher outro', async () => {
    const campos = await montar();

    await escolherFornecedor();
    await escolherProduto();
    await escolherFornecedor('Fornecedor B');

    // Cliente é obrigatório e é checado antes dos itens no `submit()`.
    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Um' }));

    // Submit direto no form: o combobox de cliente é `required` no DOM, então
    // clicar no botão pararia antes, na validação nativa do navegador.
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar pedido' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cada item precisa de um produto ou de código/descrição manual.',
    );
    expect(saveOrder).not.toHaveBeenCalled();

    await escolherProduto(0, /BBB-1/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(campos.produto()).not.toHaveAttribute('aria-invalid');
  });
});

/**
 * Código repetido entre itens do mesmo pedido. O backend recusa com 409
 * (`assertCodigosItensUnicos` + `uq_itens_pedido_codigo_manual`), mas o banner
 * de erro do form é global e não diz QUAL linha corrigir — daí a marcação por
 * item aqui. Dava para digitar 22 linhas com o mesmo código antes disso.
 */
describe('PedidoForm — código duplicado entre itens', () => {
  const codigos = () => screen.getAllByLabelText('Código') as HTMLInputElement[];
  const salvar = () => screen.getByRole('button', { name: 'Salvar pedido' });
  const erroInline = /Este item já está no pedido/;

  async function comDoisItens() {
    const campos = await montar();
    await escolherFornecedor();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    return campos;
  }

  async function escolherCliente() {
    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Um' }));
  }

  it('marca só a repetição e desabilita o save', async () => {
    await comDoisItens();

    fireEvent.change(codigos()[0], { target: { value: 'ABC' } });
    fireEvent.change(codigos()[1], { target: { value: 'ABC' } });

    // A primeira ocorrência fica limpa: marcar as duas deixaria o usuário sem
    // saber qual é a linha "certa".
    expect(codigos()[0]).not.toHaveAttribute('aria-invalid');
    expect(codigos()[1]).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText(erroInline)).toHaveLength(1);
    expect(salvar()).toBeDisabled();
  });

  it('libera o save assim que o código repetido muda', async () => {
    await comDoisItens();

    fireEvent.change(codigos()[0], { target: { value: 'ABC' } });
    fireEvent.change(codigos()[1], { target: { value: 'ABC' } });
    expect(salvar()).toBeDisabled();

    fireEvent.change(codigos()[1], { target: { value: 'XYZ' } });

    expect(codigos()[1]).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(erroInline)).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('espaço em volta não escapa da regra', async () => {
    await comDoisItens();

    fireEvent.change(codigos()[0], { target: { value: 'ABC' } });
    fireEvent.change(codigos()[1], { target: { value: '  ABC  ' } });

    expect(codigos()[1]).toHaveAttribute('aria-invalid', 'true');
  });

  /**
   * `chooseProduct` copia `product.codigo` para o campo Código, então escolher o
   * mesmo produto duas vezes cai na mesma regra sem tratamento especial.
   */
  it('pega o mesmo produto cadastrado escolhido em dois itens', async () => {
    await comDoisItens();
    await escolherProduto(0);
    await escolherProduto(1);

    expect(codigos()[1]).toHaveValue('AAA-1');
    expect(codigos()[1]).toHaveAttribute('aria-invalid', 'true');
    expect(salvar()).toBeDisabled();
  });

  // BACKLOG-0097: editar o código não tira a repetição — o backend recusa o
  // mesmo produto em duas linhas (`uq_itens_pedido_produto`).
  it('mesmo produto com códigos editados diferentes continua bloqueado, por produto', async () => {
    await comDoisItens();
    await escolherCliente();
    await escolherProduto(0);
    await escolherProduto(1);

    fireEvent.change(codigos()[0], { target: { value: 'QAA' } });
    fireEvent.change(codigos()[1], { target: { value: 'QAB' } });

    expect(screen.getByText(/Este produto já está em outro item/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Buscar produto do item 2' })).toHaveAttribute('aria-invalid', 'true');
    expect(salvar()).toBeDisabled();

    fireEvent.submit(salvar().closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cada produto só pode aparecer uma vez.');
    expect(saveOrder).not.toHaveBeenCalled();
  });

  it('remover a linha repetida reabilita o save', async () => {
    await comDoisItens();

    fireEvent.change(codigos()[0], { target: { value: 'ABC' } });
    fireEvent.change(codigos()[1], { target: { value: 'ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover item 2' }));

    expect(salvar()).toBeEnabled();
  });

  it('descrição repetida é legítima e não bloqueia', async () => {
    saveOrder.mockResolvedValue({ uuid: 'ped-1', version: 1 });
    await comDoisItens();
    await escolherCliente();

    const descricoes = screen.getAllByLabelText('Descrição') as HTMLInputElement[];
    fireEvent.change(descricoes[0], { target: { value: 'Peça avulsa' } });
    fireEvent.change(descricoes[1], { target: { value: 'Peça avulsa' } });

    expect(salvar()).toBeEnabled();
    fireEvent.submit(salvar().closest('form')!);
    await waitFor(() => expect(saveOrder).toHaveBeenCalled());
  });

  it('submit forçado com duplicata para no banner e não chama a API', async () => {
    await comDoisItens();
    await escolherCliente();

    fireEvent.change(codigos()[0], { target: { value: 'ABC' } });
    fireEvent.change(codigos()[1], { target: { value: 'ABC' } });

    // O botão está desabilitado; o submit direto no form prova que a guarda não
    // depende só do estado visual do botão.
    fireEvent.submit(salvar().closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Há itens com o mesmo código: ABC. Cada código só pode aparecer uma vez no pedido.',
    );
    expect(saveOrder).not.toHaveBeenCalled();
  });
});

describe('PedidoForm — foto específica na edição', () => {
  function pedido(status: 'em_aberto' | 'liberado' = 'em_aberto') {
    return {
      uuid: 'ped-edit', version: 3, origem: 'interno', status, data: '2026-09-15',
      cliente: { uuid: 'cli-1', razao_social: 'Cliente Um' }, vendedor: null,
      fornecedor: FORNECEDOR_A, transportadora: null, pgt: null, prazo: null,
      local_entrega: null, tipo_faturamento: null, observacao: null,
      itens: [{
        uuid: 'item-edit', produto: PRODUTO_A, foto_especifica: { uuid: 'foto-1', version: 4 },
        codigo_manual: 'AAA-1', descricao_manual: 'Produto A', qtd_caixas: '2',
        qtd_unitaria: '3', preco_unitario: '25.50', desconto_perc: '0', ipi_perc: '10',
      }],
    };
  }

  async function montarEdicao(status: 'em_aberto' | 'liberado' = 'em_aberto') {
    routerParams.uuid = 'ped-edit';
    fetchOrder.mockResolvedValue(pedido(status));
    fetchOrderItemPhoto.mockResolvedValue({ uuid: 'foto-1', version: 4 });
    fetchOrderItemPhotoDataUrl.mockResolvedValue('data:image/jpeg;base64,EXISTENTE');
    saveOrder.mockResolvedValue({ uuid: 'ped-edit', version: 4 });
    render(<PedidoForm />);
    await screen.findByAltText('Foto específica do item 1');
  }

  it('só remove foto persistida depois de salvar pedido', async () => {
    await montarEdicao();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(deleteOrderItemPhoto).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByRole('button', { name: 'Salvar pedido' }).closest('form')!);
    await waitFor(() => expect(saveOrder).toHaveBeenCalled());
    await waitFor(() => expect(deleteOrderItemPhoto).toHaveBeenCalledWith('ped-edit', 'item-edit', 4));
  });

  it('só envia foto arrastada depois de salvar pedido', async () => {
    await montarEdicao();
    const file = new File(['foto'], 'nova.jpg', { type: 'image/jpeg' });
    const zone = screen.getByText('Foto deste pedido').closest('div')!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(uploadOrderItemPhoto).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByRole('button', { name: 'Salvar pedido' }).closest('form')!);
    await waitFor(() => expect(uploadOrderItemPhoto).toHaveBeenCalledWith('ped-edit', 'item-edit', file));
    expect(deleteOrderItemPhoto).not.toHaveBeenCalled();
  });

  it('bloqueia troca quando pedido não está em aberto', async () => {
    await montarEdicao('liberado');
    const file = new File(['foto'], 'nova.jpg', { type: 'image/jpeg' });
    const zone = screen.getByText('Foto deste pedido').closest('div')!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(uploadOrderItemPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar pedido' })).toBeDisabled();
  });
});

/**
 * "Liberar pedido" chamava só PATCH /liberar: a observação (ou qualquer campo)
 * digitada e não salva sumia, e a tela travava como se tivesse gravado.
 */
describe('PedidoForm — liberar com edição pendente', () => {
  function pedido() {
    return {
      uuid: 'ped-lib', version: 3, origem: 'interno', status: 'em_aberto', data: '2026-09-15',
      cliente: { uuid: 'cli-1', razao_social: 'Cliente Um' }, vendedor: null,
      fornecedor: FORNECEDOR_A, transportadora: null, pgt: null, prazo: null,
      local_entrega: null, tipo_faturamento: null, observacao: 'Antiga',
      itens: [{
        uuid: 'item-lib', produto: PRODUTO_A, foto_especifica: { uuid: 'foto-1', version: 4 },
        codigo_manual: 'AAA-1', descricao_manual: 'Produto A', qtd_caixas: '2',
        qtd_unitaria: '3', preco_unitario: '25.50', desconto_perc: '0', ipi_perc: '10',
      }],
    };
  }

  async function montar() {
    routerParams.uuid = 'ped-lib';
    fetchOrder.mockResolvedValue(pedido());
    // Hidratação assíncrona da foto não é edição do usuário.
    fetchOrderItemPhoto.mockResolvedValue({ uuid: 'foto-1', version: 4 });
    fetchOrderItemPhotoDataUrl.mockResolvedValue('data:image/jpeg;base64,EXISTENTE');
    liberarOrder.mockResolvedValue({ uuid: 'ped-lib', version: 5, status: 'liberado' });
    render(<PedidoForm />);
    await screen.findByAltText('Foto específica do item 1');
  }

  it('salva a observação digitada antes de liberar, com a versão devolvida pelo save', async () => {
    await montar();
    saveOrder.mockResolvedValue({ uuid: 'ped-lib', version: 4 });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Nova observação' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    await waitFor(() => expect(liberarOrder).toHaveBeenCalledWith('ped-lib', 4));
    expect(saveOrder).toHaveBeenCalledWith(
      expect.objectContaining({ observacao: 'Nova observação', version: 3 }), 'ped-lib',
    );
    expect(saveOrder.mock.invocationCallOrder[0]).toBeLessThan(liberarOrder.mock.invocationCallOrder[0]);
    expect(await screen.findByText('Este pedido já foi liberado e não pode mais ser editado.')).toBeInTheDocument();
  });

  it('valor inválido pela validação nativa barra salvar e liberar, igual ao Salvar', async () => {
    await montar();
    // min='0' só é checado pelo navegador; persist() não repete essa regra.
    fireEvent.change(screen.getByLabelText('Caixas'), { target: { value: '-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveOrder).not.toHaveBeenCalled();
    expect(liberarOrder).not.toHaveBeenCalled();
  });

  function soltarFoto() {
    const file = new File(['foto'], 'nova.jpg', { type: 'image/jpeg' });
    const zone = screen.getByText('Foto deste pedido').closest('div')!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    return file;
  }

  it('foto pendente sobe antes de liberar — o backend recusa foto em pedido liberado', async () => {
    await montar();
    saveOrder.mockResolvedValue({ uuid: 'ped-lib', version: 4 });
    const file = soltarFoto();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    await waitFor(() => expect(liberarOrder).toHaveBeenCalledWith('ped-lib', 4));
    expect(uploadOrderItemPhoto).toHaveBeenCalledWith('ped-lib', 'item-lib', file);
    expect(uploadOrderItemPhoto.mock.invocationCallOrder[0]).toBeLessThan(liberarOrder.mock.invocationCallOrder[0]);
  });

  it('falha no upload da foto: pedido salvo, mas não liberado, e segue pendente', async () => {
    await montar();
    saveOrder.mockResolvedValue({ uuid: 'ped-lib', version: 4 });
    uploadOrderItemPhoto.mockRejectedValue(new Error('Falha no upload'));
    soltarFoto();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    expect(await screen.findByText(/O pedido foi salvo, mas 1 operação/)).toBeInTheDocument();
    expect(saveOrder).toHaveBeenCalled();
    expect(liberarOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar e liberar' })).toBeEnabled();
  });

  it('congela os campos enquanto salva e libera', async () => {
    await montar();
    let concluirSave!: (value: unknown) => void;
    saveOrder.mockReturnValue(new Promise((resolve) => { concluirSave = resolve; }));
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Nova observação' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    await waitFor(() => expect(screen.getByLabelText('Observações')).toBeDisabled());
    concluirSave({ uuid: 'ped-lib', version: 4 });
    await waitFor(() => expect(liberarOrder).toHaveBeenCalledWith('ped-lib', 4));
  });

  it('sem edição pendente só libera', async () => {
    await montar();

    fireEvent.click(screen.getByRole('button', { name: 'Liberar pedido' }));

    await waitFor(() => expect(liberarOrder).toHaveBeenCalledWith('ped-lib', 3));
    expect(saveOrder).not.toHaveBeenCalled();
  });

  it('não libera quando o save falha', async () => {
    await montar();
    saveOrder.mockRejectedValue(new Error('Conflito de versão'));
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Nova observação' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar e liberar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(liberarOrder).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Observações')).toHaveValue('Nova observação');
  });
});
