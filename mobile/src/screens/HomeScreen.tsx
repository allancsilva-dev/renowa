import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncService } from '../services/SyncService';
import { getPendingCount } from '../storage/sync-queue';
import { apiService, type MobileUser } from '../services/ApiService';

interface Props {
  onLogout: () => void;
}

export default function HomeScreen({ onLogout }: Props) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    void apiService.getStoredUser().then(setUser);
    void apiService.getLastSyncTimestamp().then(setLastSyncTime);
    void getPendingCount().then(setPendingSync);

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);

      if (online) {
        void handleSync();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncService.runFullSync();
      const last = await apiService.getLastSyncTimestamp();
      setLastSyncTime(last);
      const count = await getPendingCount();
      setPendingSync(count);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  async function handleLogout() {
    await apiService.logout();
    onLogout();
  }

  return (
    <ScrollView style={styles.container}>
      {/* Barra de status offline */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Modo offline — dados locais</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.nome ?? 'usuário'}</Text>
          <Text style={styles.tenant}>{user?.tenantId ?? ''}</Text>
        </View>
        <TouchableOpacity onPress={() => { void handleLogout(); }} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Status de sincronização */}
      <View style={styles.syncCard}>
        <Text style={styles.syncTitle}>Sincronização</Text>
        {pendingSync > 0 && (
          <Text style={styles.pendingText}>{pendingSync} item(s) aguardando envio</Text>
        )}
        {lastSyncTime && (
          <Text style={styles.lastSync}>
            Última sync: {new Date(lastSyncTime).toLocaleString('pt-BR')}
          </Text>
        )}
        {isOnline && (
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
            onPress={() => { void handleSync(); }}
            disabled={syncing}
          >
            <Text style={styles.syncBtnText}>
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Menu rápido */}
      <Text style={styles.sectionTitle}>Acesso rápido</Text>
      <View style={styles.menuGrid}>
        {[
          { label: 'Clientes', emoji: '👥' },
          { label: 'Pedidos', emoji: '🛒' },
          { label: 'Produtos', emoji: '📦' },
        ].map(({ label, emoji }) => (
          <TouchableOpacity key={label} style={styles.menuCard}>
            <Text style={styles.menuEmoji}>{emoji}</Text>
            <Text style={styles.menuLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F6' },
  offlineBanner: {
    backgroundColor: '#f59e0b',
    paddingVertical: 8,
    alignItems: 'center',
  },
  offlineText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A9D8F',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tenant: { fontSize: 12, color: '#fff8', marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#fff', fontSize: 14 },
  syncCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    elevation: 2,
  },
  syncTitle: { fontWeight: '700', fontSize: 15, color: '#0f172a', marginBottom: 8 },
  pendingText: { fontSize: 13, color: '#f59e0b', marginBottom: 4 },
  lastSync: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  syncBtn: {
    backgroundColor: '#2A9D8F',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    gap: 8,
  },
  menuCard: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    elevation: 2,
  },
  menuEmoji: { fontSize: 28, marginBottom: 8 },
  menuLabel: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
});
