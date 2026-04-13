import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setStatus('error');
      setMessage('Parâmetros inválidos');
      return;
    }

    const controller = new AbortController();
    // Timer de 15s — se o fetch demorar mais, aborta
    const timeout = setTimeout(() => controller.abort(), 15_000);

    (async () => {
      try {
        await fetch(
          `${API_URL}/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          { method: 'GET', credentials: 'include', signal: controller.signal }
        );
        // Forçar navegação após 800ms — não depender apenas do 302 do servidor,
        // pois o Nginx Proxy Manager pode interceptar e responder JSON
        setTimeout(() => { window.location.href = '/dashboard'; }, 800);
        setStatus('success');
      } catch (err) {
        // AbortError = timeout ou componente desmontado — não é erro do usuário
        if ((err as Error)?.name === 'AbortError') return;
        setStatus('error');
        setMessage((err as Error)?.message ?? 'Erro ao autenticar');
      } finally {
        clearTimeout(timeout); // sempre limpa o timer, sucesso ou erro
      }
    })();

    // Cleanup: cancela o fetch e limpa o timer se o componente desmontar
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchParams]);

  if (status === 'loading') {
    return <div>Autenticando...</div>;
  }

  if (status === 'error') {
    return (
      <div>
        <p>Erro: {message}</p>
        <button onClick={() => (window.location.href = '/')}>Tentar novamente</button>
      </div>
    );
  }

  return <div>Autenticação bem-sucedida. Redirecionando...</div>;
}
