// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OrderItemPhotoField from './OrderItemPhotoField';

const imagem = () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
const pdf = () => new File([new Uint8Array([1, 2, 3])], 'nota.pdf', { type: 'application/pdf' });

function zona() {
  return screen.getByText('Foto deste pedido').closest('div')!.parentElement!;
}

afterEach(cleanup);

describe('OrderItemPhotoField', () => {
  it('aceita imagem arrastada e entrega o arquivo', () => {
    const onChoose = vi.fn();
    render(<OrderItemPhotoField index={0} fotoPreview={null} locked={false} onChoose={onChoose} onRemove={vi.fn()} />);

    const file = imagem();
    fireEvent.drop(zona(), { dataTransfer: { files: [file] } });

    expect(onChoose).toHaveBeenCalledWith(file);
  });

  it('recusa arquivo que não é imagem e avisa o usuário', () => {
    const onChoose = vi.fn();
    render(<OrderItemPhotoField index={0} fotoPreview={null} locked={false} onChoose={onChoose} onRemove={vi.fn()} />);

    fireEvent.drop(zona(), { dataTransfer: { files: [pdf()] } });

    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Arraste uma imagem JPEG, PNG ou WEBP.');
  });

  it('ignora o drop quando o pedido está travado', () => {
    const onChoose = vi.fn();
    render(<OrderItemPhotoField index={0} fotoPreview={null} locked onChoose={onChoose} onRemove={vi.fn()} />);

    fireEvent.drop(zona(), { dataTransfer: { files: [imagem()] } });

    expect(onChoose).not.toHaveBeenCalled();
  });

  it('zera o input após escolher, para reescolher o mesmo arquivo', () => {
    const onChoose = vi.fn();
    render(<OrderItemPhotoField index={0} fotoPreview={null} locked={false} onChoose={onChoose} onRemove={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [imagem()] } });

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });
});
