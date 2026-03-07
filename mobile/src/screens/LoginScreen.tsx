import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useState } from 'react';
import { apiService } from '../services/ApiService';

interface Props {
  onSuccess: () => void;
}

/**
 * Tela de login mobile.
 *
 * Fluxo:
 * 1. Usuário entra com token JWT RS256 do ZonaDevAuth
 *    (no app real: integrar com WebView/OAuth flow do ZonaDevAuth)
 * 2. App troca pelo token HS256 de sessão via POST /api/auth/mobile-session
 */
export default function LoginScreen({ onSuccess }: Props) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!token.trim()) {
      setError('Informe o token de acesso.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiService.createMobileSession(token.trim());
      onSuccess();
    } catch {
      setError('Token inválido ou serviço indisponível. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Logo placeholder */}
        <View style={styles.logoPlaceholder} />
        <Text style={styles.title}>Renowa</Text>
        <Text style={styles.subtitle}>Gestão Comercial</Text>

        <TextInput
          style={styles.input}
          placeholder='Token de acesso ZonaDev'
          value={token}
          onChangeText={setToken}
          autoCapitalize='none'
          autoCorrect={false}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => { void handleLogin(); }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color='#fff' />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#2A9D8F',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#2A9D8F',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
