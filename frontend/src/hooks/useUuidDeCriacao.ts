import { useCallback, useState } from 'react';

/**
 * Identidade estável do registro que está sendo criado.
 *
 * O uuid nasce quando nasce a INTENÇÃO de criar — abertura do formulário ou do
 * modal — e vive até a criação dar certo. Não nasce no submit.
 *
 * A diferença não é estética. O uuid vindo do cliente é a chave de idempotência
 * do sistema: o servidor devolve o registro existente quando o mesmo uuid chega
 * de novo, em vez de criar um segundo (ver `createIdempotente`, no backend).
 * Gerando o uuid dentro do handler, cada retry chega com identidade NOVA e a
 * idempotência do servidor não protege nada — foi assim que uma falha no upload
 * da foto virava produto duplicado, porque o segundo clique reenviava tudo com
 * outro uuid.
 *
 * Vale para todo caminho de retry: duplo clique, `Salvar` de novo depois de um
 * erro, retry de rede, e a fila offline do app de celular, que reenvia mutação
 * cuja resposta se perdeu.
 *
 * `renovar()` depois de criar com sucesso, quando a tela continua aberta para
 * cadastrar o próximo (modal que não fecha). Tela que navega após salvar não
 * precisa: desmontar já descarta o uuid.
 */
export function useUuidDeCriacao(): { uuid: string; renovar: () => void } {
  const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const renovar = useCallback(() => setUuid(crypto.randomUUID()), []);
  return { uuid, renovar };
}
