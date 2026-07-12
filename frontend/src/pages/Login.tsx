import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});
type Form = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Credenciais inválidas');
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-4'>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className='w-full max-w-sm space-y-4 rounded-xl border bg-white p-8 shadow-sm'
      >
        <div className='space-y-1'>
          <h1 className='text-xl font-bold text-slate-900'>Entrar</h1>
          <p className='text-sm text-slate-500'>Acesse sua conta Renowa.</p>
        </div>

        <div className='space-y-1'>
          <label htmlFor='email' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
            E-mail
          </label>
          <input
            id='email'
            type='email'
            autoComplete='email'
            {...register('email')}
            className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
          />
          {errors.email && <p className='text-xs text-red-600'>{errors.email.message}</p>}
        </div>

        <div className='space-y-1'>
          <label htmlFor='password' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
            Senha
          </label>
          <input
            id='password'
            type='password'
            autoComplete='current-password'
            {...register('password')}
            className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
          />
          {errors.password && <p className='text-xs text-red-600'>{errors.password.message}</p>}
        </div>

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <button
          type='submit'
          disabled={isSubmitting}
          className='w-full rounded-lg bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60'
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
