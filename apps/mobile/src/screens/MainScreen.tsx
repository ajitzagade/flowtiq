import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import WebView from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { Config } from '../config';

import { webViewRef } from '../lib/webViewRef';
import { handleBridgeMessage } from '../lib/bridgeHandlers';
import { navigateWebView, extractPath } from '../lib/webViewNavigation';
import { setPushToken } from '../lib/pushToken';
import { OfflineOverlay } from '../components/OfflineOverlay';

// ── Constants ──────────────────────────────────────────────────────────────
const KEYCHAIN_SERVICE = 'com.flowtiq.auth';
const PUSH_PERM_KEY = 'push_permission_requested';
const FLOWTIQ_AUTH_KEY = 'flowtiq-auth';
const WEBVIEW_URL = Config.TENANT_WEBVIEW_URL ?? 'https://flowtiq-admin.vercel.app';
const WEBVIEW_SOURCE = { uri: WEBVIEW_URL };

// Static script — only sets up NativeBridge, never changes.
// Auth injection is done via injectJavaScript in onLoadEnd so this prop
// never changes and never triggers an Android WebView silent reload.
const NATIVE_BRIDGE_SCRIPT = `(function(){try{window.NativeBridge={platform:${JSON.stringify(Platform.OS)},postMessage:function(msg){window.ReactNativeWebView.postMessage(msg)}};}catch(e){}})();true;`;

// ── Component ─────────────────────────────────────────────────────────────
export function MainScreen() {
  const localRef = useRef<WebView>(null);
  const currentUrlRef = useRef<string>(WEBVIEW_URL);
  const authStateRef = useRef<object | null>(null);
  const pendingDeepLinkRef = useRef<string | null>(null);
  const hasFCMDeepLink = useRef(false);
  const wasOfflineRef = useRef(false);

  const hasLoadedRef = useRef(false);

  const [isOffline, setIsOffline] = useState(false);
  const [isOnLoginPage, setIsOnLoginPage] = useState(true);

  // Keep module-level webViewRef in sync with local ref
  useEffect(() => {
    (webViewRef as React.MutableRefObject<WebView | null>).current = localRef.current;
  });

  // ── Story 3.3: Load Keychain credentials on mount ───────────────────
  useEffect(() => {
    async function loadAuth() {
      try {
        const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
        if (creds && creds.password) {
          const stored = JSON.parse(creds.password) as {
            accessToken: string;
            refreshToken: string;
            user: object;
            tenant?: object | null;
          };
          authStateRef.current = {
            state: {
              user: stored.user,
              tenant: stored.tenant ?? null,
              accessToken: stored.accessToken,
              refreshToken: stored.refreshToken,
              isAuthenticated: true,
            },
            version: 0,
          };
        }
      } catch (e) {
        console.warn('[Keychain] Read error — falling back to login:', e);
      }
    }
    loadAuth();
  }, []);

  // ── Story 3.6: NetInfo / offline monitoring ──────────────────────────
  const netInfoInitializedRef = useRef(false);
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const offline = !state.isConnected || state.isInternetReachable === false;
      wasOfflineRef.current = offline;
      netInfoInitializedRef.current = true;
      setIsOffline(offline);
    });
    const unsub = NetInfo.addEventListener((state) => {
      // Ignore events that arrive before the initial fetch resolves —
      // Android fires several null-valued events on startup that would
      // otherwise falsely trigger an offline→online reload.
      if (!netInfoInitializedRef.current) return;
      const offline = !state.isConnected || state.isInternetReachable === false;
      setIsOffline(offline);
      // Only reload on offline → online transition, not every connectivity event
      if (!offline && wasOfflineRef.current && localRef.current) {
        localRef.current.reload();
      }
      wasOfflineRef.current = offline;
    });
    return () => unsub();
  }, []);

  // ── Story 3.5: Deep linking ──────────────────────────────────────────
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url && !hasFCMDeepLink.current) {
        pendingDeepLinkRef.current = extractPath(url);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      navigateWebView(extractPath(url));
    });
    return () => sub.remove();
  }, []);

  // Fetch FCM token on startup so GET_PUSH_TOKEN bridge returns a value immediately on login.
  // getToken() does not require notification permission — it just retrieves the device token.
  useEffect(() => {
    messaging().getToken().then((token) => {
      if (token) setPushToken(token);
    }).catch(() => {});
  }, []);

  // ── Story 3.4: Quit-state push notification tap ──────────────────────
  useEffect(() => {
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage?.data?.deepLinkUrl) {
          hasFCMDeepLink.current = true;
          pendingDeepLinkRef.current = extractPath(remoteMessage.data.deepLinkUrl as string);
        }
      });
  }, []);

  // ── Story 3.4: Foreground push — Notifee banner + WebView toast ─────
  useEffect(() => {
    const unsub = messaging().onMessage(async (remoteMessage) => {
      const title = remoteMessage.notification?.title ?? 'Flowtiq';
      const body = remoteMessage.notification?.body ?? '';

      // Android notification banner via Notifee
      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId: 'flowtiq-default',
          pressAction: { id: 'default' },
          sound: 'default',
          vibrationPattern: [0, 300, 100, 300],
        },
      });

      // Dispatch custom event into WebView so the web UI shows a toast
      localRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('flowtiqNotification',{detail:{title:${JSON.stringify(title)},body:${JSON.stringify(body)}}}));true;`
      );
    });
    return () => unsub();
  }, []);

  // ── Story 3.4: Foreground notification tap → navigate WebView ────────
  useEffect(() => {
    return notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        const deepLinkUrl = detail.notification?.data?.deepLinkUrl as string | undefined;
        navigateWebView(deepLinkUrl ? extractPath(deepLinkUrl) : '/');
      }
    });
  }, []);

  // ── Story 3.4: FCM token refresh ────────────────────────────────────
  useEffect(() => {
    const unsub = messaging().onTokenRefresh((token) => {
      setPushToken(token);
      localRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('fcmTokenRefresh',{detail:{token:${JSON.stringify(token)}}}));true;`
      );
    });
    return () => unsub();
  }, []);

  // ── Story 3.4: Push permission on first post-login launch ────────────
  // Triggered when user navigates away from login (isOnLoginPage flips false)
  useEffect(() => {
    if (isOnLoginPage) return;
    async function maybeRequestPush() {
      const already = await AsyncStorage.getItem(PUSH_PERM_KEY);
      if (already) return;
      Alert.alert(
        'Stay Updated',
        'Enable notifications to receive alerts for assignments, stage updates, and reminders.',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => AsyncStorage.setItem(PUSH_PERM_KEY, 'true'),
          },
          {
            text: 'Enable Notifications',
            onPress: async () => {
              try {
                await messaging().requestPermission();
                await AsyncStorage.setItem(PUSH_PERM_KEY, 'true');
                const token = await messaging().getToken();
                if (token) setPushToken(token);
              } catch {
                AsyncStorage.setItem(PUSH_PERM_KEY, 'true').catch(() => {});
              }
            },
          },
        ]
      );
    }
    maybeRequestPush();
  }, [isOnLoginPage]);

  // ── WebView event handlers ────────────────────────────────────────────
  const handleLoadEnd = useCallback(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      // Inject stored auth into localStorage after first page load.
      // Using injectJavaScript here instead of injectedJavaScriptBeforeContentLoaded
      // because changing that prop on Android causes a silent reload loop.
      if (authStateRef.current) {
        const authJson = JSON.stringify(JSON.stringify(authStateRef.current));
        localRef.current?.injectJavaScript(
          `try{localStorage.setItem(${JSON.stringify(FLOWTIQ_AUTH_KEY)},${authJson});}catch(e){}true;`
        );
      }
      if (pendingDeepLinkRef.current) {
        navigateWebView(pendingDeepLinkRef.current);
        pendingDeepLinkRef.current = null;
      }
    }
  }, []);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      handleBridgeMessage(event.nativeEvent.data, localRef, currentUrlRef.current);
    },
    []
  );

  const handleNavigationStateChange = useCallback(
    (navState: { url: string }) => {
      currentUrlRef.current = navState.url;

      let isLogin = false;
      try {
        isLogin = new URL(navState.url).pathname === '/login';
      } catch {
        isLogin = navState.url.includes('/login');
      }

      if (isLogin) {
        setIsOnLoginPage(true);
        authStateRef.current = null;
        Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => {});
      } else {
        setIsOnLoginPage(false);
      }
    },
    []
  );

  const handleRetry = useCallback(() => {
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        setIsOffline(false);
        localRef.current?.reload();
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <WebView
        ref={localRef}
        source={WEBVIEW_SOURCE}
        style={styles.webview}
        originWhitelist={['https://*']}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE_SCRIPT}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}
      />

      {isOffline && <OfflineOverlay onRetry={handleRetry} />}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  webview: { flex: 1 },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
