/**
 * Flowtiq Mobile — Root Application Component
 *
 * Wraps the app in SafeAreaProvider and sets up Notifee Android channel
 * on startup (idempotent — safe to call every launch).
 */
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import notifee, { AndroidImportance } from '@notifee/react-native';

import { MainScreen } from './src/screens/MainScreen';

export default function App() {
  useEffect(() => {
    // Story 3.4: Create default Android notification channel on every launch (idempotent)
    notifee.createChannel({
      id: 'flowtiq-default',
      name: 'Flowtiq Notifications',
      importance: AndroidImportance.HIGH,
      sound: 'flowtiq_sound',
      vibration: true,
    }).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}
