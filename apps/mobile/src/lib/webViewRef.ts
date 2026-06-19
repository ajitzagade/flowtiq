import { createRef } from 'react';
import type WebView from 'react-native-webview';

// Module-level WebView ref shared by bridge handlers and navigation utilities
export const webViewRef = createRef<WebView>();
