// ── Window type extension ──────────────────────────────────────────────────
declare global {
  interface Window {
    NativeBridge?: {
      postMessage: (message: string) => void;
      platform?: 'ios' | 'android';
    };
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface FilePickOptions {
  multiple?: boolean;
  accept?: string; // e.g. 'image/*', 'application/pdf'
}

interface BridgeMessage {
  type: 'FILE_PICK' | 'CAMERA_CAPTURE' | 'GET_PUSH_TOKEN' | 'GET_CONNECTIVITY' | 'REQUEST_PERMISSION' | 'NAVIGATE';
  requestId: string;
  payload?: Record<string, unknown>;
}

interface BridgeResponse {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface NativeFileData {
  base64: string;
  mimeType: string;
  filename: string;
}

// ── Internal helpers ───────────────────────────────────────────────────────
function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new File([ab], filename, { type: mimeType });
}

function sendBridgeRequest<T>(type: BridgeMessage['type'], payload?: Record<string, unknown>): Promise<T> {
  if (!isNativeApp()) {
    return Promise.reject(new Error('Not in native app'));
  }
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('nativeBridgeResponse', handler);
      reject(new Error(`NativeBridge timeout: ${type}`));
    }, 15000);

    const handler = (event: Event) => {
      const e = event as CustomEvent<BridgeResponse>;
      if (e.detail.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('nativeBridgeResponse', handler);
      if (e.detail.success) resolve(e.detail.data as T);
      else reject(new Error(e.detail.error));
    };

    window.addEventListener('nativeBridgeResponse', handler);
    window.NativeBridge!.postMessage(JSON.stringify({ type, requestId, payload }));
  });
}

// ── Public API ─────────────────────────────────────────────────────────────
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && typeof window.NativeBridge !== 'undefined';
}

export async function requestFilePick(options?: FilePickOptions): Promise<File[]> {
  if (!isNativeApp()) return Promise.reject(new Error('Not in native app'));
  const result = await sendBridgeRequest<NativeFileData[]>('FILE_PICK', {
    multiple: options?.multiple ?? false,
    accept: options?.accept,
  });
  return result.map((f) => base64ToFile(f.base64, f.mimeType, f.filename));
}

export async function requestCameraCapture(): Promise<File> {
  if (!isNativeApp()) return Promise.reject(new Error('Not in native app'));
  const result = await sendBridgeRequest<NativeFileData>('CAMERA_CAPTURE');
  return base64ToFile(result.base64, result.mimeType, result.filename);
}

export async function getPushToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  return sendBridgeRequest<string | null>('GET_PUSH_TOKEN');
}

export async function getConnectivity(): Promise<boolean> {
  if (!isNativeApp()) return true;
  return sendBridgeRequest<boolean>('GET_CONNECTIVITY');
}

export function navigateTo(path: string): void {
  if (!isNativeApp()) return;
  window.NativeBridge!.postMessage(
    JSON.stringify({ type: 'NAVIGATE', requestId: crypto.randomUUID(), payload: { path } })
  );
}

export function getPlatform(): 'ios' | 'android' | null {
  if (!isNativeApp()) return null;
  return window.NativeBridge!.platform ?? null;
}
