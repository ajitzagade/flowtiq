import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import WebView from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import Config from 'react-native-config';
import SplashScreen from 'react-native-splash-screen';

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

// ── Injected script builder ───────────────────────────────────────────────
// Combines auth localStorage injection + NativeBridge injection.
// Runs before web app JS initialises (injectedJavaScriptBeforeContentLoaded).
// P10: Use JSON.stringify(platform) to safely embed the platform string.
function buildInjectedScript(platform: string, authState: object | null): string {
  const authInject = authState
    ? `localStorage.setItem(${JSON.stringify(FLOWTIQ_AUTH_KEY)}, ${JSON.stringify(JSON.stringify(authState))});`
    : '';
  return `(function() { try { ${authInject} window.NativeBridge = { platform: ${JSON.stringify(platform)}, postMessage: function(msg) { window.ReactNativeWebView.postMessage(msg); } }; } catch(e) {} })(); true;`;
}

// ── Component ─────────────────────────────────────────────────────────────
export function MainScreen() {
  const localRef = useRef<WebView>(null);
  const currentUrlRef = useRef<string>(WEBVIEW_URL); // D1: track current URL for bridge origin validation

  const [isWebViewLoading, setIsWebViewLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [injectedScript, setInjectedScript] = useState<string | null>(null);
  const pendingDeepLinkRef = useRef<string | null>(null); // P23: ref avoids stale closure in handleLoadEnd
  const hasFCMDeepLink = useRef(false); // P7: FCM deep links take priority over URL-based ones
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'notifications'>('home');
  const [isOnLoginPage, setIsOnLoginPage] = useState(true); // P9: suppress push prompt on login page

  // Keep module-level webViewRef in sync with local ref
  useEffect(() => {
    (webViewRef as React.MutableRefObject<WebView | null>).current = localRef.current;
  });

  // ── Story 3.3: Load Keychain credentials on mount ───────────────────
  useEffect(() => {
    async function loadAuth() {
      let authState: object | null = null;
      try {
        const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
        if (creds && creds.password) {
          const stored = JSON.parse(creds.password) as {
            accessToken: string;
            refreshToken: string;
            user: object;
            tenant?: object | null;
          };
          // Build Zustand persist format: { state: {...}, version: 0 }
          authState = {
            state: {
              user: stored.user,
              tenant: stored.tenant ?? null, // P18: restore tenant alongside user
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
      setInjectedScript(buildInjectedScript(Platform.OS, authState));
    }
    loadAuth();
  }, []);

  // ── Story 3.6: NetInfo / offline monitoring ──────────────────────────
  useEffect(() => {
    // Initial check
    NetInfo.fetch().then((state) => {
      const offline = !state.isConnected || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    // Subscribe
    const unsub = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline && localRef.current) {
        localRef.current.reload();
      }
    });
    return () => unsub();
  }, []);

  // ── Story 3.5: Deep linking (cold start + running) ───────────────────
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      // P7: Only set if FCM has not already claimed the pending deep link
      if (url && !hasFCMDeepLink.current) {
        pendingDeepLinkRef.current = extractPath(url);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      navigateWebView(extractPath(url));
    });
    return () => sub.remove();
  }, []);

  // ── Story 3.4: Quit-state push notification tap ──────────────────────
  useEffect(() => {
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage?.data?.deepLinkUrl) {
          // P7: FCM takes priority — overwrite any URL-based pending deep link
          // P27: Call extractPath on the deepLinkUrl before storing
          hasFCMDeepLink.current = true;
          pendingDeepLinkRef.current = extractPath(remoteMessage.data.deepLinkUrl as string);
        }
      });
  }, []);

  // ── Story 3.4: Foreground push — Notifee banner ──────────────────────
  useEffect(() => {
    const unsub = messaging().onMessage(async (remoteMessage) => {
      await notifee.displayNotification({
        title: remoteMessage.notification?.title ?? 'Flowtiq',
        body: remoteMessage.notification?.body ?? '',
        android: {
          channelId: 'flowtiq-default',
          pressAction: { id: 'default' },
        },
      });
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

  // ── Story 3.4: FCM token refresh → update module + notify web app ────
  useEffect(() => {
    const unsub = messaging().onTokenRefresh((token) => {
      setPushToken(token);
      // P3: JSON.stringify safely embeds the token without injection risk
      localRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('fcmTokenRefresh', { detail: { token: ${JSON.stringify(token)} } })); true;`
      );
    });
    return () => unsub();
  }, []);

  // ── Story 3.4: Push permission on first post-login launch ────────────
  // P9: Do not prompt while on the login page
  useEffect(() => {
    if (!isWebViewLoaded || isOnLoginPage) return;
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
              // P22: Wrap in try-catch — permission denial or token failure must not crash
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
  }, [isWebViewLoaded, isOnLoginPage]);

  // ── WebView event handlers ────────────────────────────────────────────
  const handleLoadStart = useCallback(() => setIsWebViewLoading(true), []);

  // P23: pendingDeepLinkRef is a ref — handleLoadEnd reads the latest value without
  // it appearing in the deps array, eliminating the stale closure that existed with state.
  const handleLoadEnd = useCallback(() => {
    setIsWebViewLoading(false);
    if (!isWebViewLoaded) {
      setIsWebViewLoaded(true);
      // Story 3.7: dismiss splash screen after first load
      SplashScreen.hide();
      // Story 3.5: navigate to pending deep link
      if (pendingDeepLinkRef.current) {
        navigateWebView(pendingDeepLinkRef.current);
        pendingDeepLinkRef.current = null;
      }
    }
  }, [isWebViewLoaded]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      // D1: Pass current URL so the bridge handler can validate message origin
      handleBridgeMessage(event.nativeEvent.data, localRef, currentUrlRef.current);
    },
    []
  );

  // ── Story 3.3: Logout detection + Story 3.7: active tab tracking ─────
  const handleNavigationStateChange = useCallback(
    (navState: { url: string }) => {
      currentUrlRef.current = navState.url; // D1: keep current URL up to date

      // P11: Use exact pathname comparison to avoid false positives (e.g. /login-help)
      let isLogin = false;
      try {
        isLogin = new URL(navState.url).pathname === '/login';
      } catch {
        isLogin = navState.url.includes('/login');
      }

      if (isLogin) {
        setIsOnLoginPage(true); // P9
        Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => {});
        // P8: Reset injected script so next page load starts without stale auth state
        setInjectedScript(buildInjectedScript(Platform.OS, null));
      } else {
        setIsOnLoginPage(false);
        // P30: Only update active tab when NOT on the login page
        try {
          const path = new URL(navState.url).pathname;
          setActiveTab(path.startsWith('/notifications') ? 'notifications' : 'home');
        } catch {
          setActiveTab(navState.url.includes('/notifications') ? 'notifications' : 'home');
        }
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

  // Wait until Keychain lookup is done before rendering WebView
  if (injectedScript === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <WebView
        ref={localRef}
        source={{ uri: WEBVIEW_URL }}
        style={styles.webview}
        originWhitelist={['https://*']} // P20: allow all HTTPS origins (RN WebView needs this for redirects)
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScriptBeforeContentLoaded={injectedScript}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onNavigationStateChange={handleNavigationStateChange}
      />

      {/* Initial loading indicator */}
      {isWebViewLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {/* Story 3.6: Offline overlay (WebView remains mounted beneath it) */}
      {isOffline && <OfflineOverlay onRetry={handleRetry} />}

      {/* Story 3.7: Bottom tab bar — P26: TouchableOpacity instead of Text with onPress */}
      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        <View style={styles.tabBarInner}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'home' && styles.tabActive]}
            onPress={() => {
              setActiveTab('home');
              navigateWebView('/dashboard');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabIconActive]}>
              {'\uD83C\uDFE0'}
            </Text>
            <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>
              Home
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'notifications' && styles.tabActive]}
            onPress={() => {
              setActiveTab('notifications');
              navigateWebView('/notifications');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, activeTab === 'notifications' && styles.tabIconActive]}>
              {'\uD83D\uDD14'}
            </Text>
            <Text
              style={[styles.tabLabel, activeTab === 'notifications' && styles.tabLabelActive]}
            >
              Notifications
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  webview: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tabBar: {
    backgroundColor: '#0f172a',
  },
  tabBarInner: {
    flexDirection: 'row',
    height: 56,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#3b82f6',
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});
