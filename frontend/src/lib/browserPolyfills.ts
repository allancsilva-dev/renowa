import { Buffer } from 'buffer';

// @react-pdf/layout consulta `Buffer.isBuffer` mesmo no build para navegador.
// Vite não publica polyfills de Node automaticamente, então disponibilizamos
// somente a primitiva exigida pelo renderer, antes de qualquer rota ser aberta.
globalThis.Buffer ??= Buffer;
