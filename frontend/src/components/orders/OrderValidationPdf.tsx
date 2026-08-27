import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { Order, OrderStatus } from '@/types';
import { qtyForDisplay } from '@/lib/decimal';
import { orderTotalsBreakdown } from '@/lib/orderCalculation';
import logoRenowa from '@/assets/logo-renowa.png';

// Só sobrevive como metadado do arquivo (<Document title>): a faixa do topo não
// exibe mais status nem nota fiscal — o papel imita a planilha do cliente, e o
// aviso de documento não fiscal ficou no rodapé fixo.
const TITLE_BY_STATUS: Record<OrderStatus, string> = {
  em_aberto: 'PEDIDO PARA VALIDAÇÃO',
  liberado: 'PEDIDO LIBERADO',
  parcialmente_faturado: 'PEDIDO PARCIALMENTE FATURADO',
  faturado: 'PEDIDO FATURADO',
  cancelado: 'PEDIDO CANCELADO',
};

const styles = StyleSheet.create({
  page: { paddingTop: 80, paddingBottom: 38, paddingHorizontal: 20, fontFamily: 'Helvetica', fontSize: 7.5, color: '#1f2937' },
  header: { position: 'absolute', top: 20, left: 20, right: 20, height: 54, borderBottomWidth: 1.5, borderBottomColor: '#2A9D8F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 104, height: 40, objectFit: 'contain', objectPosition: 'left center' },
  headerInfo: { flex: 1, marginLeft: 16, alignItems: 'flex-end' },
  headerRef: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  headerSupplier: { marginTop: 3, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#0D2B2B', textAlign: 'right' },
  footer: { position: 'absolute', bottom: 16, left: 20, right: 20, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between', color: '#64748b', fontSize: 6 },
  section: { marginBottom: 10 }, sectionTitle: { marginBottom: 5, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 0.5, borderColor: '#94a3b8' },
  // Rótulo e valor lado a lado, como célula de planilha. A largura do rótulo é
  // fixa (e não percentual) de propósito: é o que alinha a coluna de rótulos em
  // todas as linhas, inclusive nos campos que ocupam meia largura ou a largura
  // inteira.
  field: { flexDirection: 'row', borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#94a3b8' },
  fieldLabel: { width: 62, flexShrink: 0, backgroundColor: '#f1f5f9', borderRightWidth: 0.5, borderRightColor: '#94a3b8', padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 5.5, color: '#334155' },
  fieldValue: { flex: 1, padding: 3, fontSize: 6.5 },
  obsSection: { marginTop: 'auto' },
  obsBox: { minHeight: 60, borderWidth: 0.5, borderColor: '#94a3b8', padding: 7 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#176b62', color: '#ffffff', paddingVertical: 5, paddingHorizontal: 2, fontFamily: 'Helvetica-Bold', fontSize: 5.5 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', minHeight: 23, fontSize: 6 },
  headerDivider: { borderRightColor: '#0D2B2B' },
  // As larguras somam exatamente 100%: mexer numa exige devolver a diferença em
  // outra. A coluna FOTO abriu 11% tirando a folga das colunas numéricas, e
  // CÓDIGO subiu de 7% para 10% porque em 7% código de item transbordava.
  colItem: { width: '4%', paddingLeft: 3, paddingRight: 3 },
  colFoto: { width: '11%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colCode: { width: '10%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colDescription: { width: '15%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colQtdCx: { width: '5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  // Sem borda direita: a lateral esquerda colorida de QTD TOTAL ocupa esse lugar.
  colQtdUnit: { width: '5%', textAlign: 'right', paddingLeft: 3, paddingRight: 3 },
  // QTD TOTAL e DESC.% são as duas colunas que a planilha do cliente destaca em
  // cor — laranja e vermelho, borda dos dois lados e valor colorido.
  // 0.8 e não 0.5 como as demais divisórias: em 0.5 a borda cai no meio do pixel
  // e sai lavada na tela, perdendo o destaque que a planilha do cliente tem.
  colQtdTotal: { width: '6%', textAlign: 'right', borderLeftWidth: 0.8, borderLeftColor: '#ed7d31', borderRightWidth: 0.8, borderRightColor: '#ed7d31', paddingLeft: 3, paddingRight: 3, fontFamily: 'Helvetica-Bold' },
  // Sem borda direita: a lateral esquerda colorida de DESC.% ocupa esse lugar.
  colVlrTb: { width: '7.5%', textAlign: 'right', paddingLeft: 3, paddingRight: 3 },
  colDescPerc: { width: '5.5%', textAlign: 'right', borderLeftWidth: 0.8, borderLeftColor: '#ff0000', borderRightWidth: 0.8, borderRightColor: '#ff0000', paddingLeft: 3, paddingRight: 3 },
  colVlrComDesc: { width: '8%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3, fontFamily: 'Helvetica-Bold' },
  colIpi: { width: '5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colVlrComImp: { width: '8.5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colTotalSemImp: { width: '9.5%', textAlign: 'right', paddingLeft: 3 },
  valueOrange: { color: '#c55a11' }, valueRed: { color: '#ff0000' },
  rowPhotoCode: { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  rowPhotoImage: { height: 46, objectFit: 'contain' },
  totals: { marginTop: 12, marginLeft: '55%', width: '45%', borderWidth: 0.7, borderColor: '#94a3b8', padding: 8 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }, finalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.2, borderTopColor: '#2A9D8F', paddingTop: 6, marginTop: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
});

// Exportado para o teste de regressão dos pesos das colunas destacadas.
// eslint-disable-next-line react-refresh/only-export-components
export const orderValidationPdfStyles = styles;

const brl = (value: Decimal.Value | null | undefined) => `R$ ${new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2).replace('.', ',')}`;
const text = (value: string | null | undefined) => value?.trim() || '—';

function Footer({ order }: { order: Order }) {
  return <View style={styles.footer} fixed><Text>Pedido {order.numero_pedido ?? 'sem número'} · Renowa Representações — Documento não fiscal</Text><Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /><Text>{new Date().toLocaleString('pt-BR')}</Text></View>;
}

const SPAN = { 1: { width: '25%' as const }, 2: { width: '50%' as const }, 4: { width: '100%' as const } };

function Field({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 | 4 }) {
  return <View style={[styles.field, SPAN[span]]}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View>;
}

const ptBrDate = (value: string | null | undefined) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—');

/**
 * Foto resolvida de cada item, já em data URL e indexada pelo uuid do item. A
 * foto específica do pedido tem prioridade e a do catálogo é o fallback.
 */
export type OrderPdfPhotos = Record<string, string>;

export function OrderValidationPdf({ order, fotosPorProduto = {} }: { order: Order; fotosPorProduto?: OrderPdfPhotos }) {
  // Pedido externo não tem itens nem decomposição de desconto/IPI: o valor é
  // informado direto. A tabela de itens e o quadro de totais analíticos dão
  // lugar ao bloco de origem e a um total único.
  const isExterno = (order.origem ?? 'interno') === 'externo';
  // Mesmo helper que a tela de detalhe usa: papel e tela não podem divergir.
  const breakdown = orderTotalsBreakdown(order, order.itens);
  const gross = new Decimal(breakdown.bruto);
  const withoutTax = new Decimal(breakdown.semImposto);
  const withTax = new Decimal(breakdown.comImposto);
  const transport = order.transportadora ?? order.cliente?.transportadora;
  const title = TITLE_BY_STATUS[order.status];
  return <Document title={`${title} ${order.numero_pedido ?? ''}`} author='Renowa Representações'>
    <Page size='A4' orientation='portrait' style={styles.page} wrap>
      {/* Pedido nº e data vivem aqui, não na grade: a faixa é fixa e repete em
          toda página, então quem folheia o papel sempre sabe de que pedido é. */}
      <View style={styles.header} fixed>
        <Image src={logoRenowa} style={styles.logo} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerRef}>PEDIDO Nº {order.numero_pedido ?? '—'} · {ptBrDate(order.data)}</Text>
          <Text style={styles.headerSupplier}>{text(order.fornecedor?.razao_social)}</Text>
        </View>
      </View>
      <Footer order={order} />
      <View style={styles.section}><View style={styles.infoGrid}>
        <Field span={4} label='RAZÃO SOCIAL' value={text(order.cliente?.razao_social)} />
        <Field label='CNPJ' value={text(order.cliente?.cnpj)} /><Field label='INSC. EST.' value={text(order.cliente?.inscricao_estadual)} /><Field label='SUFRAMA' value={text(order.cliente?.suframa)} /><Field label='VENDEDOR' value={text(order.vendedor?.nome)} />
        <Field span={2} label='ENDEREÇO' value={text(order.cliente?.endereco)} /><Field span={2} label='BAIRRO' value={text(order.cliente?.bairro)} />
        <Field label='Nº / AND.' value={text(order.cliente?.numero)} /><Field label='CIDADE' value={text(order.cliente?.cidade)} /><Field label='UF' value={text(order.cliente?.uf)} /><Field label='CEP' value={text(order.cliente?.cep)} />
        {/* E-mail em meia largura: em 25% um endereço corporativo hifeniza em três linhas e estica a linha inteira da grade. */}
        <Field label='CONTATO' value={text(order.cliente?.contato)} /><Field label='TELEFONE' value={text(order.cliente?.tel)} /><Field span={2} label='E-MAIL' value={text(order.cliente?.email)} />
        <Field label='PAGAMENTO' value={text(order.pgt)} /><Field label='PRAZO' value={text(order.prazo)} /><Field span={2} label='TIPO FAT.' value={text(order.tipo_faturamento)} />
        <Field span={2} label='TRANSPORTADORA' value={text(transport?.razao_social)} /><Field label='CNPJ TRANSP.' value={text(transport?.cnpj)} /><Field label='TEL. TRANSP.' value={text(transport?.telefone)} />
        <Field span={4} label='END. TRANSP.' value={text(transport?.endereco_completo)} />
        <Field span={4} label='LOCAL ENTREGA' value={text(order.local_entrega)} />
        {isExterno && <><Field span={2} label='SIST. ORIGEM' value={text(order.sistema_origem)} /><Field span={2} label='Nº ORIGEM' value={text(order.numero_pedido_externo)} /></>}
      </View></View>
      {isExterno ? (
        <View style={styles.totals} wrap={false}><View style={styles.finalLine}><Text>Valor do pedido</Text><Text>{brl(withTax)}</Text></View></View>
      ) : (<>
      <View style={styles.tableHeader} fixed>
        <Text style={styles.colItem}>ITEM</Text>
        <Text style={[styles.colFoto, styles.headerDivider]}>FOTO</Text>
        <Text style={[styles.colCode, styles.headerDivider]}>CÓDIGO</Text>
        <Text style={[styles.colDescription, styles.headerDivider]}>DESCRIÇÃO</Text>
        <Text style={[styles.colQtdCx, styles.headerDivider]}>QTD CX</Text>
        <Text style={styles.colQtdUnit}>QTD UNIT</Text>
        <Text style={styles.colQtdTotal}>QTD TOTAL</Text>
        <Text style={styles.colVlrTb}>VLR.TB</Text>
        <Text style={styles.colDescPerc}>DESC.%</Text>
        <Text style={[styles.colVlrComDesc, styles.headerDivider]}>VLR. COM DESC.</Text>
        <Text style={[styles.colIpi, styles.headerDivider]}>IPI %</Text>
        <Text style={[styles.colVlrComImp, styles.headerDivider]}>VLR C/ IMP</Text>
        <Text style={styles.colTotalSemImp}>TOTAL S/IMP</Text>
      </View>
      {order.itens.map((item, index) => <View key={item.uuid} style={styles.row} wrap={false}>
        <Text style={styles.colItem}>{index + 1}</Text>
        {/* Código repetido acima da foto de propósito: quem confere a mercadoria
            olha a foto e o código juntos, sem varrer a linha até a coluna CÓDIGO.
            Item manual (sem produto cadastrado) não tem foto: célula vazia. */}
        <View style={styles.colFoto}>
          {fotosPorProduto[item.uuid] && <>
            <Text style={styles.rowPhotoCode}>{text(item.codigo_manual ?? item.produto?.codigo)}</Text>
            <Image src={fotosPorProduto[item.uuid]} style={styles.rowPhotoImage} />
          </>}
        </View>
        <Text style={styles.colCode}>{text(item.codigo_manual ?? item.produto?.codigo)}</Text>
        <Text style={styles.colDescription}>{text(item.descricao_manual ?? item.produto?.descricao)}</Text>
        <Text style={styles.colQtdCx}>{qtyForDisplay(item.qtd_caixas)}</Text>
        <Text style={styles.colQtdUnit}>{qtyForDisplay(item.qtd_unitaria)}</Text>
        <Text style={[styles.colQtdTotal, styles.valueOrange]}>{qtyForDisplay(item.qtd_total)}</Text>
        <Text style={styles.colVlrTb}>{brl(item.preco_unitario)}</Text>
        <Text style={[styles.colDescPerc, styles.valueRed]}>{item.desconto_perc}%</Text>
        <Text style={styles.colVlrComDesc}>{brl(item.valor_com_desconto)}</Text>
        <Text style={styles.colIpi}>{item.ipi_perc != null ? `${item.ipi_perc}%` : '—'}</Text>
        <Text style={styles.colVlrComImp}>{brl(item.valor_com_imposto)}</Text>
        <Text style={styles.colTotalSemImp}>{brl(item.total_item)}</Text>
      </View>)}
      <View style={styles.totals} wrap={false}><View style={styles.totalLine}><Text>Valor bruto</Text><Text>{brl(gross)}</Text></View><View style={styles.totalLine}><Text>Desconto total</Text><Text>{brl(gross.minus(withoutTax))}</Text></View><View style={styles.totalLine}><Text>Total sem imposto</Text><Text>{brl(withoutTax)}</Text></View><View style={styles.totalLine}><Text>IPI total</Text><Text>{brl(withTax.minus(withoutTax))}</Text></View><View style={styles.finalLine}><Text>Total final</Text><Text>{brl(withTax)}</Text></View></View>
      </>)}
      {/* Não existe seção de fotos separada: a foto resolvida vai na linha do
          item. Pedido externo não tem itens e, portanto, sai sem foto. */}
      <View style={[styles.section, styles.obsSection]} wrap={false}><Text style={styles.sectionTitle}>Observações</Text><View style={styles.obsBox}><Text>{text(order.observacao)}</Text></View></View>
    </Page>
  </Document>;
}
