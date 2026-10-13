import PrepostosCadastro from '@/pages/prepostos/PrepostosCadastro';

export default function Prepostos() {
  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-xl font-bold text-slate-900'>Prepostos</h1>
        <p className='mt-1 text-sm text-slate-500'>Representantes externos que vendem pela empresa e recebem comissão sobre as notas.</p>
      </div>
      <PrepostosCadastro />
    </div>
  );
}
