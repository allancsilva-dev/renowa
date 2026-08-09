// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductPhotoField from './ProductPhotoField';

const fetchProductPhoto = vi.fn();
const fetchProductPhotoDataUrl = vi.fn();
const uploadProductPhoto = vi.fn();
const deleteProductPhoto = vi.fn();

vi.mock('@/services/productPhotos.service', () => ({
  fetchProductPhoto: (...args: unknown[]) => fetchProductPhoto(...args),
  fetchProductPhotoDataUrl: (...args: unknown[]) => fetchProductPhotoDataUrl(...args),
  uploadProductPhoto: (...args: unknown[]) => uploadProductPhoto(...args),
  deleteProductPhoto: (...args: unknown[]) => deleteProductPhoto(...args),
}));

const arquivo = () => new File([new Uint8Array([1, 2, 3])], 'papel.png', { type: 'image/png' });

function escolher() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [arquivo()] } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProductPhotoField — produto já salvo', () => {
  it('mostra a foto existente dentro do Strict Mode', async () => {
    fetchProductPhoto.mockResolvedValue({ uuid: 'f1', version: 2, nome_arquivo: 'p.png' });
    fetchProductPhotoDataUrl.mockResolvedValue('data:image/png;base64,STRICT');

    render(<StrictMode><ProductPhotoField produtoUuid='prod-strict' editable /></StrictMode>);

    await waitFor(() => expect(screen.getByAltText('Foto do produto'))
      .toHaveAttribute('src', 'data:image/png;base64,STRICT'));
    expect(screen.queryByText('Sem foto')).not.toBeInTheDocument();
    expect(fetchProductPhoto).toHaveBeenCalledTimes(1);
    expect(fetchProductPhotoDataUrl).toHaveBeenCalledTimes(1);
  });

  it('mostra a foto existente', async () => {
    fetchProductPhoto.mockResolvedValue({ uuid: 'f1', version: 2, nome_arquivo: 'p.png' });
    fetchProductPhotoDataUrl.mockResolvedValue('data:image/png;base64,AAA');

    render(<ProductPhotoField produtoUuid='prod-1' editable />);

    await waitFor(() => expect(screen.getByAltText('Foto do produto')).toHaveAttribute('src', 'data:image/png;base64,AAA'));
    expect(screen.getByText('Trocar foto')).toBeInTheDocument();
  });

  it('sobe a foto escolhida e atualiza o preview', async () => {
    fetchProductPhoto.mockResolvedValue(null);
    uploadProductPhoto.mockResolvedValue({ uuid: 'f1', version: 1 });
    fetchProductPhotoDataUrl.mockResolvedValue('data:image/png;base64,BBB');

    render(<ProductPhotoField produtoUuid='prod-1' editable />);
    await waitFor(() => expect(fetchProductPhoto).toHaveBeenCalled());
    escolher();

    await waitFor(() => expect(uploadProductPhoto).toHaveBeenCalledWith('prod-1', expect.any(File)));
    await waitFor(() => expect(screen.getByAltText('Foto do produto')).toBeInTheDocument());
  });

  /** Remover manda a `version` corrente: outra aba pode ter trocado a foto. */
  it('remove mandando a version corrente', async () => {
    fetchProductPhoto.mockResolvedValue({ uuid: 'f1', version: 4, nome_arquivo: 'p.png' });
    fetchProductPhotoDataUrl.mockResolvedValue('data:image/png;base64,AAA');
    deleteProductPhoto.mockResolvedValue(undefined);

    render(<ProductPhotoField produtoUuid='prod-1' editable />);
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(deleteProductPhoto).toHaveBeenCalledWith('prod-1', 4));
    await waitFor(() => expect(screen.getByText('Sem foto')).toBeInTheDocument());
  });

  /**
   * Regressão do FIX-0008: falha ao baixar a imagem não pode re-disparar o
   * efeito a cada render — vira laço de requisições contra a API.
   */
  it('não entra em laço quando o download falha', async () => {
    fetchProductPhoto.mockRejectedValue(new Error('boom'));

    const { rerender } = render(<ProductPhotoField produtoUuid='prod-1' editable />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    for (let i = 0; i < 5; i += 1) rerender(<ProductPhotoField produtoUuid='prod-1' editable />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchProductPhoto).toHaveBeenCalledTimes(1);
  });

  it('ignora o preview obsoleto após trocar o produto', async () => {
    let resolveFirst!: (value: string) => void;
    fetchProductPhoto.mockImplementation((uuid: string) => Promise.resolve({
      uuid: `foto-${uuid}`, version: 1, nome_arquivo: `${uuid}.png`,
    }));
    fetchProductPhotoDataUrl.mockImplementation((uuid: string) => {
      if (uuid === 'prod-1') return new Promise<string>((resolve) => { resolveFirst = resolve; });
      return Promise.resolve('data:image/png;base64,SECOND');
    });

    const { rerender } = render(<ProductPhotoField produtoUuid='prod-1' editable />);
    await waitFor(() => expect(fetchProductPhotoDataUrl).toHaveBeenCalledWith('prod-1'));
    rerender(<ProductPhotoField produtoUuid='prod-2' editable />);
    await waitFor(() => expect(screen.getByAltText('Foto do produto'))
      .toHaveAttribute('src', 'data:image/png;base64,SECOND'));

    resolveFirst('data:image/png;base64,FIRST');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByAltText('Foto do produto'))
      .toHaveAttribute('src', 'data:image/png;base64,SECOND');
  });

  it('esconde as ações quando não é editável', async () => {
    fetchProductPhoto.mockResolvedValue(null);

    render(<ProductPhotoField produtoUuid='prod-1' editable={false} />);

    await waitFor(() => expect(fetchProductPhoto).toHaveBeenCalled());
    expect(screen.queryByText('Escolher foto')).not.toBeInTheDocument();
  });
});

/**
 * O aviso É o controle. A foto de catálogo não tem titular — saiu do
 * `PII_REGISTRY` na 0042 — então nenhuma solicitação de exclusão a alcança, e
 * nada no código impede alguém de fotografar uma nota fiscal. Se este texto
 * sumir sem substituto, a premissa "catálogo não tem PII" volta a ser
 * expectativa. Ver PROB-0083.
 */
describe('ProductPhotoField — aviso de PII', () => {
  const aviso = () => screen.queryByRole('status');

  it('avisa contra subir documento de cliente quando dá para escolher foto', async () => {
    fetchProductPhoto.mockResolvedValue(null);

    render(<ProductPhotoField produtoUuid='prod-1' editable />);

    await waitFor(() => expect(aviso()).toBeInTheDocument());
    expect(aviso()).toHaveTextContent(/nota fiscal, documento/i);
    expect(aviso()).toHaveTextContent(/LGPD/);
  });

  it('não avisa quem não pode subir foto', async () => {
    fetchProductPhoto.mockResolvedValue(null);

    render(<ProductPhotoField produtoUuid='prod-1' editable={false} />);

    await waitFor(() => expect(fetchProductPhoto).toHaveBeenCalled());
    expect(aviso()).not.toBeInTheDocument();
  });
});

describe('ProductPhotoField — produto ainda não salvo', () => {
  /** Sem uuid não há o que gravar: o arquivo espera o POST do formulário. */
  it('guarda o arquivo em vez de subir', async () => {
    const onPendingChange = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');

    render(<ProductPhotoField editable onPendingChange={onPendingChange} />);
    escolher();

    await waitFor(() => expect(onPendingChange).toHaveBeenCalledWith(expect.any(File)));
    expect(uploadProductPhoto).not.toHaveBeenCalled();
    expect(fetchProductPhoto).not.toHaveBeenCalled();
    expect(screen.getByAltText('Foto do produto')).toHaveAttribute('src', 'blob:preview');
  });

  it('remover limpa o arquivo pendente', async () => {
    const onPendingChange = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');

    render(<ProductPhotoField editable onPendingChange={onPendingChange} />);
    escolher();
    await waitFor(() => expect(screen.getByText('Remover')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Remover'));

    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(null));
    expect(deleteProductPhoto).not.toHaveBeenCalled();
    expect(screen.getByText('Sem foto')).toBeInTheDocument();
  });
});
