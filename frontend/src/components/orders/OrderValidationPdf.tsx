import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { Order, OrderStatus } from '@/types';
import { qtyForDisplay } from '@/lib/decimal';
import logoRenowa from '@/assets/logo-renowa.png';

const HEADER_BY_STATUS: Record<OrderStatus, { title: string; badge: string; badgeBg: string; badgeColor: string; note: string }> = {
  em_aberto: { title: 'PEDIDO PARA VALIDAÇÃO', badge: 'AGUARDANDO VALIDAÇÃO', badgeBg: '#e6f5f3', badgeColor: '#176b62', note: 'Documento não fiscal — sujeito à conferência e aprovação' },
  liberado: { title: 'PEDIDO LIBERADO', badge: 'LIBERADO PARA FATURAMENTO', badgeBg: '#e6f5f3', badgeColor: '#176b62', note: 'Documento não fiscal — sujeito à conferência e aprovação' },
  parcialmente_faturado: { title: 'PEDIDO PARCIALMENTE FATURADO', badge: 'PARCIALMENTE FATURADO', badgeBg: '#fef3e2', badgeColor: '#b45309', note: 'Documento não fiscal — consulte as notas fiscais emitidas para efeitos legais' },
  faturado: { title: 'PEDIDO FATURADO', badge: 'FATURADO', badgeBg: '#e8f5e9', badgeColor: '#1b7a3d', note: 'Documento não fiscal — consulte a nota fiscal emitida para efeitos legais' },
  cancelado: { title: 'PEDIDO CANCELADO', badge: 'CANCELADO', badgeBg: '#fdecea', badgeColor: '#b91c1c', note: 'Documento não fiscal — pedido cancelado' },
};

const styles = StyleSheet.create({
  page: { paddingTop: 106, paddingBottom: 38, paddingHorizontal: 20, fontFamily: 'Helvetica', fontSize: 7.5, color: '#1f2937' },
  header: { position: 'absolute', top: 20, left: 20, right: 20, height: 68, borderBottomWidth: 1.5, borderBottomColor: '#2A9D8F', flexDirection: 'row', justifyContent: 'space-between' },
  logo: { width: 104, height: 46, objectFit: 'contain', objectPosition: 'left center' },
  titleBlock: { alignItems: 'flex-end' }, title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  badge: { marginTop: 5, paddingVertical: 3, paddingHorizontal: 8, fontFamily: 'Helvetica-Bold', fontSize: 7 },
  nonFiscal: { marginTop: 5, color: '#64748b', fontSize: 7 },
  footer: { position: 'absolute', bottom: 16, left: 20, right: 20, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between', color: '#64748b', fontSize: 6 },
  section: { marginBottom: 10 }, sectionTitle: { marginBottom: 5, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 0.5, borderColor: '#94a3b8' },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#94a3b8', padding: 6 },
  w25: { width: '25%' }, w100: { width: '100%' },
  label: { color: '#64748b', fontSize: 6.5, marginBottom: 1 }, value: { fontFamily: 'Helvetica-Bold' },
  obsSection: { marginTop: 'auto' },
  obsBox: { minHeight: 60, borderWidth: 0.5, borderColor: '#94a3b8', padding: 7 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#176b62', color: '#ffffff', paddingVertical: 5, paddingHorizontal: 2, fontFamily: 'Helvetica-Bold', fontSize: 5.5 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', minHeight: 23, fontSize: 6 },
  headerDivider: { borderRightColor: '#0D2B2B' },
  colItem: { width: '4.5%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colCode: { width: '7%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colDescription: { width: '18.5%', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colQtdCx: { width: '5.5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colQtdUnit: { width: '6%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colQtdTotal: { width: '7%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colVlrTb: { width: '8.5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colDescPerc: { width: '6.5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colVlrComDesc: { width: '9%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colIpi: { width: '6%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colVlrComImp: { width: '9.5%', textAlign: 'right', borderRightWidth: 0.5, borderRightColor: '#0D2B2B', paddingLeft: 3, paddingRight: 3 },
  colTotalSemImp: { width: '12%', textAlign: 'right', paddingLeft: 3 },
  totals: { marginTop: 12, marginLeft: '55%', width: '45%', borderWidth: 0.7, borderColor: '#94a3b8', padding: 8 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }, finalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.2, borderTopColor: '#2A9D8F', paddingTop: 6, marginTop: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
});

const brl = (value: Decimal.Value | null | undefined) => `R$ ${new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2).replace('.', ',')}`;
const text = (value: string | null | undefined) => value?.trim() || '—';

function Footer({ order }: { order: Order }) {
  return <View style={styles.footer} fixed><Text>Pedido {order.numero_pedido ?? 'sem número'} · Renowa Representações — Documento não fiscal</Text><Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /><Text>{new Date().toLocaleString('pt-BR')}</Text></View>;
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <View style={[styles.cell, wide ? styles.w100 : styles.w25]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

export function OrderValidationPdf({ order }: { order: Order }) {
  const gross = order.itens.reduce((sum, item) => sum.plus(new Decimal(item.qtd_total ?? 0).mul(item.preco_unitario ?? 0)), new Decimal(0));
  const withoutTax = new Decimal(order.total_sem_imposto ?? 0);
  const withTax = new Decimal(order.total_com_imposto ?? 0);
  const transport = order.transportadora ?? order.cliente?.transportadora;
  const meta = HEADER_BY_STATUS[order.status];
  return <Document title={`${meta.title} ${order.numero_pedido ?? ''}`} author='Renowa Representações'>
    <Page size='A4' orientation='portrait' style={styles.page} wrap>
      <View style={styles.header} fixed><Image src={logoRenowa} style={styles.logo} /><View style={styles.titleBlock}><Text style={styles.title}>{meta.title}</Text><Text style={[styles.badge, { backgroundColor: meta.badgeBg, color: meta.badgeColor }]}>{meta.badge}</Text><Text style={styles.nonFiscal}>{meta.note}</Text></View></View>
      <Footer order={order} />
      <View style={styles.section}><Text style={styles.sectionTitle}>Dados comerciais</Text><View style={styles.infoGrid}>
        <Field wide label='Razão social' value={text(order.cliente?.razao_social)} />
        <Field label='Endereço' value={text(order.cliente?.endereco)} /><Field label='Nº / and.' value={text(order.cliente?.numero)} /><Field label='Bairro' value={text(order.cliente?.bairro)} /><Field label='UF' value={text(order.cliente?.uf)} />
        <Field label='Cidade' value={text(order.cliente?.cidade)} /><Field label='CEP' value={text(order.cliente?.cep)} /><Field label='Contato' value={text(order.cliente?.contato)} /><Field label='Telefone' value={text(order.cliente?.tel)} />
        <Field label='CNPJ' value={text(order.cliente?.cnpj)} /><Field label='Inscrição estadual' value={text(order.cliente?.inscricao_estadual)} /><Field label='SUFRAMA' value={text(order.cliente?.suframa)} /><Field label='E-mail' value={text(order.cliente?.email)} />
        <Field label='Pagamento' value={text(order.pgt)} /><Field label='Prazo' value={text(order.prazo)} /><Field label='Transportadora' value={text(transport?.razao_social)} /><Field label='Telefone transp.' value={text(transport?.telefone)} />
        <Field label='Endereço transp.' value={text(transport?.endereco_completo)} /><Field label='Pedido nº' value={`#${order.numero_pedido ?? '—'}`} /><Field label='Data' value={order.data ? new Date(`${order.data}T12:00:00`).toLocaleDateString('pt-BR') : '—'} /><Field label='Vendedor' value={text(order.vendedor?.nome)} />
        <Field label='Fornecedor' value={text(order.fornecedor?.razao_social)} /><Field label='Local de entrega' value={text(order.local_entrega)} /><Field label='Tipo de faturamento' value={text(order.tipo_faturamento)} />
      </View></View>
      <View style={styles.tableHeader} fixed>
        <Text style={[styles.colItem, styles.headerDivider]}>ITEM</Text>
        <Text style={[styles.colCode, styles.headerDivider]}>CÓDIGO</Text>
        <Text style={[styles.colDescription, styles.headerDivider]}>DESCRIÇÃO</Text>
        <Text style={[styles.colQtdCx, styles.headerDivider]}>QTD CX</Text>
        <Text style={[styles.colQtdUnit, styles.headerDivider]}>QTD UNIT</Text>
        <Text style={[styles.colQtdTotal, styles.headerDivider]}>QTD TOTAL</Text>
        <Text style={[styles.colVlrTb, styles.headerDivider]}>VLR.TB</Text>
        <Text style={[styles.colDescPerc, styles.headerDivider]}>DESC.%</Text>
        <Text style={[styles.colVlrComDesc, styles.headerDivider]}>VLR. COM DESC.</Text>
        <Text style={[styles.colIpi, styles.headerDivider]}>IPI %</Text>
        <Text style={[styles.colVlrComImp, styles.headerDivider]}>VLR C/ IMP</Text>
        <Text style={styles.colTotalSemImp}>TOTAL S/IMP</Text>
      </View>
      {order.itens.map((item, index) => <View key={item.uuid} style={styles.row} wrap={false}>
        <Text style={styles.colItem}>{index + 1}</Text>
        <Text style={styles.colCode}>{text(item.codigo_manual ?? item.produto?.codigo)}</Text>
        <Text style={styles.colDescription}>{text(item.descricao_manual ?? item.produto?.descricao)}</Text>
        <Text style={styles.colQtdCx}>{qtyForDisplay(item.qtd_caixas)}</Text>
        <Text style={styles.colQtdUnit}>{qtyForDisplay(item.qtd_unitaria)}</Text>
        <Text style={styles.colQtdTotal}>{qtyForDisplay(item.qtd_total)}</Text>
        <Text style={styles.colVlrTb}>{brl(item.preco_unitario)}</Text>
        <Text style={styles.colDescPerc}>{item.desconto_perc}%</Text>
        <Text style={styles.colVlrComDesc}>{brl(item.valor_com_desconto)}</Text>
        <Text style={styles.colIpi}>{item.ipi_perc != null ? `${item.ipi_perc}%` : '—'}</Text>
        <Text style={styles.colVlrComImp}>{brl(item.valor_com_imposto)}</Text>
        <Text style={styles.colTotalSemImp}>{brl(item.total_item)}</Text>
      </View>)}
      <View style={styles.totals} wrap={false}><View style={styles.totalLine}><Text>Valor bruto</Text><Text>{brl(gross)}</Text></View><View style={styles.totalLine}><Text>Desconto total</Text><Text>{brl(gross.minus(withoutTax))}</Text></View><View style={styles.totalLine}><Text>Total sem imposto</Text><Text>{brl(withoutTax)}</Text></View><View style={styles.totalLine}><Text>IPI total</Text><Text>{brl(withTax.minus(withoutTax))}</Text></View><View style={styles.finalLine}><Text>Total final</Text><Text>{brl(withTax)}</Text></View></View>
      <View style={[styles.section, styles.obsSection]} wrap={false}><Text style={styles.sectionTitle}>Observações</Text><View style={styles.obsBox}><Text>{text(order.observacao)}</Text></View></View>
    </Page>
  </Document>;
}
