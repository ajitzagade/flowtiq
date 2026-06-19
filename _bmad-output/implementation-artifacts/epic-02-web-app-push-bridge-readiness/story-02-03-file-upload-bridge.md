---
epicId: 2
storyId: '02-03'
title: 'File Upload Bridge Integration'
status: ready
priority: high
estimate: 3
dependencies:
  - '02-01'
---

# Story 2.3 — File Upload Bridge Integration

## Story

**As a** mobile app user,
**I want** file uploads to use the device's native document picker or camera,
**so that** I can upload documents from my phone without the web browser's file picker (which is limited inside a WebView).

---

## Context

Inside a React Native WebView, the browser's native `<input type="file">` behavior is unreliable across platforms. Instead, when running inside the native shell, file upload actions must route through the NativeBridge: the web app detects it is in native mode, suppresses the `<input>` click, calls `requestFilePick()` or `requestCameraCapture()` from the NativeBridge SDK (Story 2.1), receives a `File` object, and passes it to the existing Cloudinary upload flow unchanged.

When NOT in the native app, all existing upload behavior is preserved exactly.

Depends on Story 2.1 (NativeBridge SDK).

---

## Acceptance Criteria

### AC-1: Identify all file upload inputs in the portal

**Given** a code search across `apps/admin-portal/src/`,
**When** all `<input type="file">` or file upload triggers are found,
**Then** the following locations are confirmed and updated:
- Document upload modal (most likely `apps/admin-portal/src/components/documents/` — verify exact filename)
- Any other file input triggers found during implementation

Note: The developer must read the relevant component(s) before modifying them to understand existing state management and upload patterns.

### AC-2: File input click intercepted in native app

**Given** the user clicks an upload button or file input trigger while in the native app,
**When** `isNativeApp()` returns `true`,
**Then** the default browser file picker is NOT invoked (the click event is intercepted before `input.click()` is called, or the `<input>` element is not rendered in native mode).

### AC-3: `requestFilePick` used for document uploads

**Given** the user triggers a document upload in the native app,
**When** the bridge request completes successfully,
**Then** the returned `File[]` array is passed to the existing upload handler (same function that receives files from `<input onChange>`).
**And** the upload proceeds via the existing `uploadFile` call in `src/lib/api.ts` to the Cloudinary-backed API endpoint.
**And** the response handling (success toast, error toast, list refresh) is identical to the web browser path.

### AC-4: Camera capture option supported

**Given** a file upload trigger in the native app,
**When** the UI offers a "Take Photo" option (optional second button or a menu),
**Then** `requestCameraCapture()` is called and the resulting `File` is passed to the same upload handler.

Note: Whether to show both "Pick File" and "Take Photo" options, or just "Pick File", is an implementation decision left to the developer. At minimum, `requestFilePick` must work. Camera capture is a bonus if the UI flow supports it cleanly.

### AC-5: Loading and error states consistent

**Given** the bridge request is in progress (waiting for native picker),
**When** the user is selecting a file,
**Then** the upload button/trigger shows a loading or disabled state.

**And** if the bridge rejects (user cancelled or error), the UI returns to its idle state gracefully without an unhandled error.

### AC-6: Web browser path fully preserved

**Given** the user accesses the portal in a regular browser (not native app),
**When** `isNativeApp()` returns `false`,
**Then** the file `<input>` element is rendered and behaves exactly as before this story.
**And** no existing Playwright E2E tests for document upload fail.

### AC-7: No changes to upload API or Cloudinary flow

**Given** the modified upload components,
**When** a file is uploaded via the bridge path,
**Then** the HTTP request to the backend upload endpoint is identical in structure to the browser path (same multipart/form-data, same field names, same endpoint URL).
**And** `services/api/src/routes/documents.ts` is NOT modified in this story.

### AC-8: TypeScript compiles cleanly

**Given** all modified components,
**When** `pnpm type-check` runs,
**Then** zero new TypeScript errors are introduced.

---

## Implementation Notes

### Pattern for intercepting file input

Option A — conditional render:
```tsx
// Don't render <input type="file"> in native app; use button instead
{isNativeApp() ? (
  <Button onClick={handleNativePick}>Select File</Button>
) : (
  <input type="file" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
)}
```

Option B — intercept click:
```tsx
const handleUploadClick = async () => {
  if (isNativeApp()) {
    try {
      const files = await requestFilePick({ multiple: false, accept: '*/*' });
      await uploadFiles(files);
    } catch (err) {
      // handle cancellation or error
    }
  } else {
    fileInputRef.current?.click();
  }
};
```

Option A is preferred (cleaner, no hidden input in native mode). Choose whichever fits the existing component structure best after reading the component.

### Read before modifying

Before editing any upload component, read it first to understand:
- Current state management (useState, useCallback, etc.)
- How the `uploadFile` function from `src/lib/api.ts` is called
- Current loading/error state handling
- How the file list is refreshed after upload

### Accept types for document picker

Use `accept: '*/*'` for general document uploads (PDF, images, Office files). The backend already validates file types.

---

## Out of Scope

- Multiple file selection (implement single file upload first; `multiple: true` can be enabled if the existing UI supports it)
- Offline upload queuing
- Progress bar for large file uploads (existing behavior is preserved)
- Modifications to the backend upload endpoint

---

## Definition of Done

- [ ] All file upload inputs identified and catalogued
- [ ] Each upload trigger checks `isNativeApp()` before proceeding
- [ ] Native path: `requestFilePick()` called, result passed to existing upload handler
- [ ] Browser path: existing `<input type="file">` behavior fully preserved
- [ ] Loading and error states handled
- [ ] No changes to backend routes
- [ ] `pnpm type-check` passes
- [ ] Existing document upload E2E tests still pass
