import type { RefObject } from 'react';
import NetInfo from '@react-native-community/netinfo';
import DocumentPicker from 'react-native-document-picker';
import { launchCamera } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import * as Keychain from 'react-native-keychain';
import type WebView from 'react-native-webview';
import { Config } from '../config';

import { getPushTokenValue } from './pushToken';
import { navigateWebView } from './webViewNavigation';

// Sentinel string for structured cancel detection across the bridge boundary (P28 / documents page)
export const USER_CANCELLED = 'USER_CANCELLED';

// ── Types ──────────────────────────────────────────────────────────────────
interface BridgeMessage {
  type: string;
  requestId: string;
  payload?: Record<string, unknown>;
}

// Allowlist of accepted bridge message types (NFR-1-SEC-D)
const ALLOWED_TYPES = new Set([
  'FILE_PICK',
  'CAMERA_CAPTURE',
  'GET_PUSH_TOKEN',
  'GET_CONNECTIVITY',
  'NAVIGATE',
  'STORE_TOKENS',
  'LOGOUT',
]);

const KEYCHAIN_SERVICE = 'com.flowtiq.auth';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // P6: 50 MB guard before reading files into memory

// ── Response helper ────────────────────────────────────────────────────────
// P2: Double-serialize the detail payload so arbitrary JSON values cannot break
// out of the CustomEvent constructor string in the injected JavaScript.
function sendResponse(
  ref: RefObject<WebView>,
  requestId: string,
  success: boolean,
  data?: unknown,
  error?: string
): void {
  const detailStr = JSON.stringify({ requestId, success, data, error });
  const safeDetail = JSON.stringify(detailStr);
  ref.current?.injectJavaScript(
    `window.dispatchEvent(new CustomEvent('nativeBridgeResponse', { detail: JSON.parse(${safeDetail}) })); true;`
  );
}

// ── DocumentPicker type mapping (P28) ─────────────────────────────────────
// Maps MIME type / glob string from the web app's `accept` field to react-native-document-picker types.
function mimeToPickerTypes(accept?: string): string[] {
  if (!accept || accept === '*/*') return [DocumentPicker.types.allFiles];
  const types = new Set<string>();
  accept.split(',').forEach((a) => {
    const mime = a.trim();
    if (mime.startsWith('image/')) types.add(DocumentPicker.types.images);
    else if (mime.startsWith('video/')) types.add(DocumentPicker.types.video);
    else if (mime === 'application/pdf') types.add(DocumentPicker.types.pdf);
    else types.add(DocumentPicker.types.allFiles);
  });
  return [...types];
}

// ── Handlers ───────────────────────────────────────────────────────────────
async function handleFilePick(
  ref: RefObject<WebView>,
  requestId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const results = await DocumentPicker.pick({
      allowMultiSelection: payload.multiple === true,
      type: mimeToPickerTypes(payload.accept as string | undefined), // P28: map accept MIME
    });
    const files = await Promise.all(
      results.map(async (f) => {
        // P6: Reject files larger than 50 MB before reading into memory
        if (f.size != null && f.size > MAX_FILE_BYTES) {
          throw new Error(`File "${f.name}" exceeds the 50 MB size limit`);
        }
        const base64 = await RNFS.readFile(f.uri, 'base64');
        return {
          base64,
          mimeType: f.type ?? 'application/octet-stream',
          filename: f.name ?? 'file',
        };
      })
    );
    sendResponse(ref, requestId, true, files);
  } catch (e: unknown) {
    if (DocumentPicker.isCancel(e)) {
      sendResponse(ref, requestId, false, undefined, USER_CANCELLED);
    } else {
      sendResponse(ref, requestId, false, undefined, (e as Error).message ?? 'File pick error');
    }
  }
}

async function handleCameraCapture(ref: RefObject<WebView>, requestId: string): Promise<void> {
  return new Promise((resolve) => {
    launchCamera({ mediaType: 'photo', includeBase64: true }, (response) => {
      if (response.didCancel) {
        sendResponse(ref, requestId, false, undefined, USER_CANCELLED);
      } else if (response.errorCode) {
        sendResponse(ref, requestId, false, undefined, response.errorMessage ?? 'Camera error');
      } else {
        const asset = response.assets?.[0];
        if (!asset?.base64) {
          sendResponse(ref, requestId, false, undefined, 'No image data');
        } else {
          sendResponse(ref, requestId, true, {
            base64: asset.base64,
            mimeType: asset.type ?? 'image/jpeg',
            filename: asset.fileName ?? 'photo.jpg',
          });
        }
      }
      resolve();
    });
  });
}

async function handleGetPushToken(ref: RefObject<WebView>, requestId: string): Promise<void> {
  sendResponse(ref, requestId, true, getPushTokenValue());
}

async function handleGetConnectivity(ref: RefObject<WebView>, requestId: string): Promise<void> {
  const state = await NetInfo.fetch();
  sendResponse(ref, requestId, true, state.isConnected ?? false);
}

function handleNavigate(payload: Record<string, unknown>): void {
  const path = payload.path as string;
  if (path) navigateWebView(path);
}

async function handleStoreTokens(payload: Record<string, unknown>): Promise<void> {
  try {
    const { accessToken, refreshToken, user, tenant } = payload;
    // P19: Validate tokens are non-empty strings before writing to Keychain
    if (typeof accessToken !== 'string' || !accessToken) return;
    if (typeof refreshToken !== 'string' || !refreshToken) return;
    await Keychain.setGenericPassword(
      'flowtiq-auth',
      JSON.stringify({ accessToken, refreshToken, user, tenant }),
      { service: KEYCHAIN_SERVICE }
    );
  } catch (e) {
    console.warn('[Keychain] Store error:', e);
  }
}

async function handleLogout(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch (e) {
    console.warn('[Keychain] Reset error:', e);
  }
}

// ── Main dispatcher ────────────────────────────────────────────────────────
// D1: currentUrl is required to validate that the message originates from the trusted tenant domain.
export function handleBridgeMessage(
  data: string,
  ref: RefObject<WebView>,
  currentUrl: string
): void {
  // D1: Reject messages from any origin other than the configured tenant domain
  const trustedBase = Config.TENANT_WEBVIEW_URL ?? 'https://flowtiq-admin.vercel.app';
  try {
    if (new URL(currentUrl).origin !== new URL(trustedBase).origin) return;
  } catch {
    return;
  }

  let msg: BridgeMessage;
  try {
    msg = JSON.parse(data) as BridgeMessage;
  } catch {
    return; // Malformed JSON — ignore
  }

  if (!ALLOWED_TYPES.has(msg.type)) return; // Unknown type — silently ignore (NFR-1-SEC-D)

  const { type, requestId, payload = {} } = msg;

  // P5: Capture each async task and attach a catch so unhandled errors return an error response
  // instead of silently failing or causing an unhandled promise rejection.
  let task: Promise<void>;
  switch (type) {
    case 'FILE_PICK':
      task = handleFilePick(ref, requestId, payload);
      break;
    case 'CAMERA_CAPTURE':
      task = handleCameraCapture(ref, requestId);
      break;
    case 'GET_PUSH_TOKEN':
      task = handleGetPushToken(ref, requestId);
      break;
    case 'GET_CONNECTIVITY':
      task = handleGetConnectivity(ref, requestId);
      break;
    case 'NAVIGATE':
      handleNavigate(payload);
      return; // synchronous — no task to attach catch to
    case 'STORE_TOKENS':
      task = handleStoreTokens(payload);
      break;
    case 'LOGOUT':
      task = handleLogout();
      break;
    default:
      return;
  }

  task.catch((e: unknown) => {
    sendResponse(ref, requestId, false, undefined, (e as Error)?.message ?? 'Unexpected error');
  });
}
