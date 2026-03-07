import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { apiService } from './src/services/ApiService';

export default function App() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    apiService.hasValidSession()
      .then((valid) => {
        setIsAuthenticated(valid);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2A9D8F' }}>
        <ActivityIndicator color='#fff' size='large' />
      </View>
    );
  }

  return (
    <>
      <StatusBar style='light' />
      {isAuthenticated ? (
        <HomeScreen onLogout={() => setIsAuthenticated(false)} />
      ) : (
        <LoginScreen onSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
}
