import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { Order } from '@/types';

const styles = StyleSheet.create({
  page: { paddingTop: 106, paddingBottom: 38, paddingHorizontal: 20, fontFamily: 'Helvetica', fontSize: 7.5, color: '#1f2937' },
  header: { position: 'absolute', top: 20, left: 20, right: 20, height: 68, borderBottomWidth: 1.5, borderBottomColor: '#2A9D8F', flexDirection: 'row', justifyContent: 'space-between' },
  logo: { width: 104, height: 46, objectFit: 'contain', objectPosition: 'left center' },
  titleBlock: { alignItems: 'flex-end' }, title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  badge: { marginTop: 5, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: '#e6f5f3', color: '#176b62', fontFamily: 'Helvetica-Bold', fontSize: 7 },
  nonFiscal: { marginTop: 5, color: '#64748b', fontSize: 7 },
  footer: { position: 'absolute', bottom: 16, left: 20, right: 20, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between', color: '#64748b', fontSize: 6 },
  section: { marginBottom: 10 }, sectionTitle: { marginBottom: 5, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 0.5, borderColor: '#cbd5e1', padding: 7 },
  info: { width: '50%', paddingRight: 8, marginBottom: 5 }, infoWide: { width: '100%', paddingRight: 8, marginBottom: 5 },
  label: { color: '#64748b', fontSize: 6.5, marginBottom: 1 }, value: { fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#176b62', color: '#ffffff', paddingVertical: 5, paddingHorizontal: 2, fontFamily: 'Helvetica-Bold', fontSize: 5.5 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', minHeight: 23, fontSize: 6 },
  item: { width: '4%' }, code: { width: '8%' }, description: { width: '22%' }, quantity: { width: '14%' }, number: { width: '8%', textAlign: 'right' }, total: { width: '14%', textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: '55%', width: '45%', borderWidth: 0.7, borderColor: '#94a3b8', padding: 8 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }, finalLine: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1.2, borderTopColor: '#2A9D8F', paddingTop: 6, marginTop: 2, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  acceptanceTitle: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: '#0D2B2B', marginBottom: 12 },
  acceptanceText: { fontSize: 10, lineHeight: 1.55, marginBottom: 18, maxWidth: 680 },
  choices: { flexDirection: 'row', gap: 36, fontSize: 11, marginBottom: 20 }, box: { width: 12, height: 12, borderWidth: 1, borderColor: '#334155', marginRight: 7 }, choice: { flexDirection: 'row', alignItems: 'center' },
  notes: { height: 80, borderWidth: 0.7, borderColor: '#94a3b8', padding: 7, marginBottom: 28 },
  signatures: { flexDirection: 'row', gap: 28 }, signature: { flex: 1, borderTopWidth: 0.7, borderTopColor: '#334155', paddingTop: 5, textAlign: 'center' },
});

const brl = (value: Decimal.Value | null | undefined) => `R$ ${new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2).replace('.', ',')}`;
const text = (value: string | null | undefined) => value?.trim() || '—';
const address = (order: Order) => [order.cliente?.endereco, order.cliente?.bairro, order.cliente?.cidade, order.cliente?.uf, order.cliente?.cep].filter(Boolean).join(' · ') || '—';

function Footer({ order }: { order: Order }) {
  return <View style={styles.footer} fixed><Text>Pedido {order.numero_pedido ?? 'sem número'} · Renowa Representações — Documento não fiscal</Text><Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /><Text>{new Date().toLocaleString('pt-BR')}</Text></View>;
}

export function OrderValidationPdf({ order }: { order: Order }) {
  const gross = order.itens.reduce((sum, item) => sum.plus(new Decimal(item.qtd_total ?? 0).mul(item.preco_unitario ?? 0)), new Decimal(0));
  const withoutTax = new Decimal(order.total_sem_imposto ?? 0);
  const withTax = new Decimal(order.total_com_imposto ?? 0);
  const transport = order.transportadora ?? order.cliente?.transportadora;
  const cells = [styles.item, styles.code, styles.description, styles.quantity, styles.number, styles.number, styles.number, styles.total, styles.total];
  const headings = ['Item', 'Código', 'Descrição', 'Quantidade', 'Vlr. tabela', 'Desc.', 'IPI', 'Total s/ imp.', 'Total c/ imp.'];
  return <Document title={`Pedido para validação ${order.numero_pedido ?? ''}`} author='Renowa Representações'>
    <Page size='A4' orientation='portrait' style={styles.page} wrap>
      <View style={styles.header} fixed><Image src='/assets/logo-renowa.png' style={styles.logo} /><View style={styles.titleBlock}><Text style={styles.title}>PEDIDO PARA VALIDAÇÃO</Text><Text style={styles.badge}>AGUARDANDO VALIDAÇÃO</Text><Text style={styles.nonFiscal}>Documento não fiscal — sujeito à conferência e aprovação</Text></View></View>
      <Footer order={order} />
      <View style={styles.section}><Text style={styles.sectionTitle}>Dados comerciais</Text><View style={styles.infoGrid}>
        <View style={styles.infoWide}><Text style={styles.label}>Cliente</Text><Text style={styles.value}>{text(order.cliente?.razao_social)}</Text></View><View style={styles.info}><Text style={styles.label}>CNPJ</Text><Text style={styles.value}>{text(order.cliente?.cnpj)}</Text></View>
        <View style={styles.infoWide}><Text style={styles.label}>Endereço</Text><Text>{address(order)}</Text></View><View style={styles.info}><Text style={styles.label}>IE / SUFRAMA</Text><Text>{text(order.cliente?.inscricao_estadual)} / {text(order.cliente?.suframa)}</Text></View>
        <View style={styles.info}><Text style={styles.label}>Contato</Text><Text>{text(order.cliente?.contato)}</Text></View><View style={styles.info}><Text style={styles.label}>Telefone / e-mail</Text><Text>{text(order.cliente?.tel)} · {text(order.cliente?.email)}</Text></View><View style={styles.info}><Text style={styles.label}>Pedido / emissão</Text><Text>#{order.numero_pedido ?? '—'} · {order.data ? new Date(`${order.data}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</Text></View>
        <View style={styles.info}><Text style={styles.label}>Vendedor / fornecedor</Text><Text>{text(order.vendedor?.nome)} · {text(order.fornecedor?.razao_social)}</Text></View><View style={styles.infoWide}><Text style={styles.label}>Transportadora</Text><Text>{text(transport?.razao_social)} · {text(transport?.telefone)} · {text(transport?.endereco_completo)}</Text></View>
        <View style={styles.info}><Text style={styles.label}>Pagamento / prazo</Text><Text>{text(order.pgt)} · {text(order.prazo)}</Text></View><View style={styles.info}><Text style={styles.label}>Faturamento</Text><Text>{text(order.tipo_faturamento)}</Text></View><View style={styles.info}><Text style={styles.label}>Local de entrega</Text><Text>{text(order.local_entrega)}</Text></View>
        <View style={styles.infoWide}><Text style={styles.label}>Observações</Text><Text>{text(order.observacao)}</Text></View>
      </View></View>
      <View style={styles.tableHeader} fixed>{headings.map((heading, index) => <Text key={heading} style={cells[index]}>{heading}</Text>)}</View>
      {order.itens.map((item, index) => <View key={item.uuid} style={styles.row} wrap={false}>
        <Text style={styles.item}>{index + 1}</Text><Text style={styles.code}>{text(item.codigo_manual ?? item.produto?.codigo)}</Text><Text style={styles.description}>{text(item.descricao_manual ?? item.produto?.descricao)}</Text>
        <Text style={styles.quantity}>{item.qtd_caixas} cx × {item.qtd_unitaria} un = {item.qtd_total}</Text><Text style={styles.number}>{brl(item.preco_unitario)}</Text><Text style={styles.number}>{item.desconto_perc}%</Text><Text style={styles.number}>{item.ipi_perc != null ? `${item.ipi_perc}%` : '—'}</Text><Text style={styles.total}>{brl(item.total_item)}</Text><Text style={styles.total}>{brl(item.total_com_imposto)}</Text>
      </View>)}
      <View style={styles.totals} wrap={false}><View style={styles.totalLine}><Text>Valor bruto</Text><Text>{brl(gross)}</Text></View><View style={styles.totalLine}><Text>Desconto total</Text><Text>{brl(gross.minus(withoutTax))}</Text></View><View style={styles.totalLine}><Text>Total sem imposto</Text><Text>{brl(withoutTax)}</Text></View><View style={styles.totalLine}><Text>IPI total</Text><Text>{brl(withTax.minus(withoutTax))}</Text></View><View style={styles.finalLine}><Text>Total final</Text><Text>{brl(withTax)}</Text></View></View>
    </Page>
    <Page size='A4' orientation='portrait' style={styles.page}><View style={styles.header} fixed><Image src='/assets/logo-renowa.png' style={styles.logo} /><View style={styles.titleBlock}><Text style={styles.title}>VALIDAÇÃO MANUAL</Text><Text style={styles.nonFiscal}>Pedido #{order.numero_pedido ?? '—'}</Text></View></View><Footer order={order} />
      <Text style={styles.acceptanceTitle}>Conferência e aceite</Text><Text style={styles.acceptanceText}>Declaro que conferi os dados do cliente, produtos, quantidades, preços, descontos, impostos, transporte e condições de pagamento apresentados neste pedido para validação.</Text>
      <View style={styles.choices}><View style={styles.choice}><View style={styles.box} /><Text>Aprovado</Text></View><View style={styles.choice}><View style={styles.box} /><Text>Solicito ajustes</Text></View></View>
      <Text style={styles.sectionTitle}>Observações</Text><View style={styles.notes} />
      <View style={styles.signatures}><Text style={styles.signature}>Nome do responsável</Text><Text style={styles.signature}>Assinatura</Text><Text style={styles.signature}>Data</Text></View>
    </Page>
  </Document>;
}
