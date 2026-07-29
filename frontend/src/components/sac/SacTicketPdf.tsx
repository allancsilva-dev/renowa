import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { SacStatus, SacTicket } from '@/types';
import { qtyForDisplay } from '@/lib/decimal';
import logoRenowa from '@/assets/logo-renowa.png';

const BADGE_BY_STATUS: Record<SacStatus, { badge: string; badgeBg: string; badgeColor: string }> = {
  aberto: { badge: 'ABERTO', badgeBg: '#e6f0fb', badgeColor: '#1d4ed8' },
  em_andamento: { badge: 'EM ANDAMENTO', badgeBg: '#fef3e2', badgeColor: '#b45309' },
  resolvido: { badge: 'RESOLVIDO', badgeBg: '#e8f5e9', badgeColor: '#1b7a3d' },
  cancelado: { badge: 'CANCELADO', badgeBg: '#fdecea', badgeColor: '#b91c1c' },
};

/**
 * Estrutura fiel ao modelo "SAC RENOWA": logo, faixa cinza com o título,
 * três linhas de cabeçalho (DADOS DO CLIENTE / FORNECEDOR / NUMERO DE NFE),
 * tabela de 5 colunas e linha de TOTAL.
 */
const styles = StyleSheet.create({
  page: { paddingTop: 106, paddingBottom: 38, paddingHorizontal: 20, fontFamily: 'Helvetica', fontSize: 8, color: '#1f2937' },
  header: { position: 'absolute', top: 20, left: 20, right: 20, height: 68, borderBottomWidth: 1.5, borderBottomColor: '#2A9D8F', flexDirection: 'row', justifyContent: 'space-between' },
  logo: { width: 104, height: 46, objectFit: 'contain', objectPosition: 'left center' },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  badge: { marginTop: 5, paddingVertical: 3, paddingHorizontal: 8, fontFamily: 'Helvetica-Bold', fontSize: 7 },
  nonFiscal: { marginTop: 5, color: '#64748b', fontSize: 7 },
  footer: { position: 'absolute', bottom: 16, left: 20, right: 20, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between', color: '#64748b', fontSize: 6 },
  faixa: { backgroundColor: '#d9d9d9', paddingVertical: 5, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#0D2B2B', borderWidth: 0.5, borderColor: '#94a3b8' },
  headerRows: { marginTop: 10, borderWidth: 0.5, borderColor: '#94a3b8', borderBottomWidth: 0 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#94a3b8' },
  headerLabel: { width: '30%', padding: 6, fontFamily: 'Helvetica-Bold', borderRightWidth: 0.5, borderRightColor: '#94a3b8' },
  headerValue: { width: '70%', padding: 6 },
  tableHeader: { marginTop: 12, flexDirection: 'row', backgroundColor: '#d9d9d9', color: '#0D2B2B', paddingVertical: 6, fontFamily: 'Helvetica-Bold', fontSize: 8, borderWidth: 0.5, borderColor: '#94a3b8' },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: '#94a3b8', minHeight: 20 },
  divider: { borderRightWidth: 0.5, borderRightColor: '#94a3b8' },
  colCod: { width: '20%', paddingHorizontal: 4, textAlign: 'center' },
  colQuant: { width: '15%', paddingHorizontal: 4, textAlign: 'center' },
  colMotivo: { width: '30%', paddingHorizontal: 4, textAlign: 'center' },
  colVlUni: { width: '17.5%', paddingHorizontal: 4, textAlign: 'center' },
  colVlTotal: { width: '17.5%', paddingHorizontal: 4, textAlign: 'center' },
  totalRow: { flexDirection: 'row', backgroundColor: '#d9d9d9', paddingVertical: 6, borderWidth: 0.5, borderColor: '#94a3b8', fontFamily: 'Helvetica-Bold' },
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 5, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0D2B2B' },
  obsBox: { minHeight: 50, borderWidth: 0.5, borderColor: '#94a3b8', padding: 7 },
});

const brl = (value: Decimal.Value | null | undefined) => `R$ ${new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2).replace('.', ',')}`;
const text = (value: string | null | undefined) => value?.trim() || '—';

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.headerLabel}>{label}</Text>
      <Text style={styles.headerValue}>{value}</Text>
    </View>
  );
}

export function SacTicketPdf({ ticket }: { ticket: SacTicket }) {
  const meta = BADGE_BY_STATUS[ticket.status];
  const total = ticket.total
    ?? ticket.itens.reduce((sum, item) => sum.plus(item.valor_total ?? 0), new Decimal(0)).toFixed(2);

  return (
    <Document title={`Abertura SAC ${ticket.numero_chamado}`} author='Renowa Representações'>
      <Page size='A4' orientation='portrait' style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Image src={logoRenowa} style={styles.logo} />
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Nº ABERTURA SAC {ticket.numero_chamado}</Text>
            <Text style={[styles.badge, { backgroundColor: meta.badgeBg, color: meta.badgeColor }]}>{meta.badge}</Text>
            <Text style={styles.nonFiscal}>Documento não fiscal — registro de atendimento</Text>
          </View>
        </View>
        <View style={styles.footer} fixed>
          <Text>Abertura SAC {ticket.numero_chamado} · Renowa Representações — Documento não fiscal</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          <Text>{new Date().toLocaleString('pt-BR')}</Text>
        </View>

        <Text style={styles.faixa}>SAC RENOWA</Text>

        <View style={styles.headerRows}>
          <HeaderRow label='DADOS DO CLIENTE' value={text(ticket.cliente?.razao_social)} />
          <HeaderRow label='FORNECEDOR' value={text(ticket.fornecedor?.razao_social)} />
          <HeaderRow label='NUMERO DE NFE' value={text(ticket.numero_nfe)} />
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.colCod, styles.divider]}>COD</Text>
          <Text style={[styles.colQuant, styles.divider]}>QUANT</Text>
          <Text style={[styles.colMotivo, styles.divider]}>MOTIVO</Text>
          <Text style={[styles.colVlUni, styles.divider]}>VL UNI. (NF)</Text>
          <Text style={styles.colVlTotal}>VL. TOTAL NF</Text>
        </View>
        {ticket.itens.map((item) => (
          <View key={item.uuid} style={styles.row} wrap={false}>
            <Text style={[styles.colCod, styles.divider]}>{text(item.codigo)}</Text>
            <Text style={[styles.colQuant, styles.divider]}>{qtyForDisplay(item.quantidade)}</Text>
            <Text style={[styles.colMotivo, styles.divider]}>{text(item.motivo)}</Text>
            <Text style={[styles.colVlUni, styles.divider]}>{brl(item.valor_unitario)}</Text>
            <Text style={styles.colVlTotal}>{brl(item.valor_total)}</Text>
          </View>
        ))}
        <View style={styles.totalRow} wrap={false}>
          <Text style={[styles.colCod, styles.divider]}>TOTAL</Text>
          <Text style={[styles.colQuant, styles.divider]}> </Text>
          <Text style={[styles.colMotivo, styles.divider]}> </Text>
          <Text style={[styles.colVlUni, styles.divider]}> </Text>
          <Text style={styles.colVlTotal}>{brl(total)}</Text>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <View style={styles.obsBox}><Text>{text(ticket.observacao)}</Text></View>
        </View>
      </Page>
    </Document>
  );
}
