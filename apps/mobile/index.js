/**
 * Flowtiq Mobile — App Entry Point
 *
 * Background FCM handler MUST be registered here (outside any React component)
 * before AppRegistry.registerComponent. This is a Firebase requirement.
 */
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';

import App from './App';
import { name as appName } from './package.json';

// Story 3.4: Background message handler
// The system tray notification is displayed automatically by FCM for background messages.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // Background push received — FCM handles display, no action needed here.
  if (__DEV__) {
    console.log('[FCM] Background message:', remoteMessage);
  }
});

AppRegistry.registerComponent(appName, () => App);
