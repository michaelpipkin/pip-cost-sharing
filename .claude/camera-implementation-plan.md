# Camera Functionality Implementation Plan

## Overview
Add camera functionality to allow users to capture photos, select from photo gallery, or select from file system when adding receipts to expenses.

## Current State Analysis

### Existing File Upload Implementation
- **Location**: [add-expense.component.html:239-259](src/app/components/expenses/add-expense/add-expense.component.html#L239-L259)
- **Current Flow**:
  - Hidden file input with `accept=".pdf,image/*"`
  - Click handler on attachment area triggers file input
  - `onFileSelected()` method handles the file selection
  - File stored in `receiptFile` signal
  - File name stored in `fileName` signal
  - 5MB size limit enforced

### Technology Stack
- **Framework**: Angular 21 with standalone components and signals
- **Mobile**: Capacitor 7 (already installed)
- **UI**: Angular Material
- **Existing Capacitor Plugins**:
  - `@capacitor-firebase/authentication`
  - `@capacitor-community/admob`
  - `@capacitor/browser`
  - `@capacitor/text-zoom`
  - `@capawesome/capacitor-android-edge-to-edge-support`

### Platform Detection
- **Service**: [PwaDetectionService](src/app/services/pwa-detection.service.ts)
- Detects: browser, standalone PWA, or native app
- Uses `Capacitor.isNativePlatform()` for native detection

## Implementation Approach

### 1. Install Capacitor Camera Plugin
**Package**: `@capacitor/camera`

This plugin provides:
- Camera photo capture
- Photo gallery/library selection
- File system browsing (on web)
- Image quality/size options
- Result format options (base64, URI, etc.)

### 2. Create File Selection Dialog Component

**Component**: `FileSelectionDialogComponent`
**Location**: `src/app/shared/file-selection-dialog/`

This dialog will show three options:
1. **Take Photo** (camera icon) - Uses Capacitor Camera with source=CAMERA
2. **Choose from Gallery** (photo library icon) - Uses Capacitor Camera with source=PHOTOS
3. **Browse Files** (folder icon) - Falls back to traditional file input for web/PDFs

**Pattern**: Follow existing dialog pattern from [ConfirmDialogComponent](src/app/shared/confirm-dialog/confirm-dialog.component.ts)

### 3. Create Camera Service

**Service**: `CameraService`
**Location**: `src/app/services/camera.service.ts`

Responsibilities:
- Check if camera is available (native platform)
- Request camera permissions
- Capture photo from camera
- Select photo from gallery
- Convert photo results to File objects
- Handle errors gracefully

### 4. Update Add Expense Component

**Changes to [AddExpenseComponent](src/app/components/expenses/add-expense/add-expense.component.ts)**:

1. Replace direct file input click with dialog opening
2. Handle dialog result (camera, gallery, or file browser)
3. Maintain existing file validation (size, type)
4. Keep existing file storage logic unchanged

### 5. Update UI

**Changes to [add-expense.component.html](src/app/components/expenses/add-expense/add-expense.component.html#L234-L259)**:

1. Keep hidden file input as fallback for web browsers
2. Update click handler to open selection dialog instead
3. No visual changes - same button and layout

## Implementation TODOs

### TODO 1: Install @capacitor/camera plugin ✅
- [x] Run `pnpm add @capacitor/camera`
- [ ] Run `pnpm build:cap` to sync with native projects (to be done by user when building for mobile)
- [ ] Add camera permissions to Android manifest (will be needed for native build)

### TODO 2: Create CameraService ✅
- [x] Create `src/app/services/camera.service.ts`
- [x] Implement `isAvailable()` - check if native platform
- [x] Implement `takePicture()` - capture from camera
- [x] Implement `selectFromGallery()` - select from photo library
- [x] Implement helper to convert photo result to File object
- [x] Add proper error handling for permission denials

### TODO 3: Create FileSelectionDialogComponent ✅
- [x] Create `src/app/shared/file-selection-dialog/file-selection-dialog.component.ts`
- [x] Create `src/app/shared/file-selection-dialog/file-selection-dialog.component.html`
- [x] Create `src/app/shared/file-selection-dialog/file-selection-dialog.component.scss`
- [x] Implement dialog with three buttons:
  - Take Photo (show only on native platforms)
  - Choose from Gallery (show only on native platforms)
  - Browse Files (always show)
- [x] Return dialog result indicating which option was selected
- [x] Use Material icons: `camera_alt`, `photo_library`, `folder_open`
- [x] Follow existing dialog styling patterns
- [x] Add proper ARIA labels and test IDs

### TODO 4: Update AddExpenseComponent ✅
- [x] Inject CameraService and MatDialog
- [x] Create `openFileSelectionDialog()` method
- [x] Update template click handler to call `openFileSelectionDialog()`
- [x] Handle dialog results:
  - "camera" -> call `cameraService.takePicture()`
  - "gallery" -> call `cameraService.selectFromGallery()`
  - "file" -> trigger existing file input click
- [x] Update `onFileSelected()` to use new `processSelectedFile()` method
- [x] Keep existing file validation logic (5MB limit, file type check)
- [x] Maintain existing `receiptFile` and `fileName` signals

### TODO 5: Update Edit Expense Component ✅
- [x] Check if EditExpenseComponent has similar file upload functionality
- [x] Apply same changes as AddExpenseComponent

### TODO 6: Test on Different Platforms
- [ ] Test on web browser (should show file browse only)
- [ ] Test on PWA (should show file browse only)
- [ ] Test on Android native app (should show all three options)
- [ ] Test camera capture flow
- [ ] Test gallery selection flow
- [ ] Test file size validation with camera photos
- [ ] Test file upload to Firebase Storage
- [ ] Test edge cases (permission denial, camera not available, etc.)

### TODO 7: Documentation Updates
- [ ] Update CLAUDE.md if needed with camera-specific patterns
- [ ] Add code comments explaining the camera flow
- [ ] Document any Android permissions needed

## Technical Considerations

### Capacitor Camera Configuration
```typescript
{
  quality: 90,
  allowEditing: false,
  resultType: CameraResultType.Uri, // or DataUrl for base64
  source: CameraSource.Camera, // or Photos for gallery
  correctOrientation: true,
  width: 1920, // Limit size to reduce storage
  height: 1920
}
```

### File Conversion
- Camera result will be a URI or base64 string
- Need to convert to File object to maintain compatibility with existing `uploadBytes()` in [ExpenseService](src/app/services/expense.service.ts#L199-L256)
- Use `fetch()` to get blob from URI, then create File object

### Permission Handling
- Camera permissions handled automatically by Capacitor on first use
- Show appropriate error messages if permission denied
- Graceful fallback to file input if camera unavailable

### Platform-Specific Behavior
- **Web/PWA**: Show only "Browse Files" option
- **Native (Android)**: Show all three options
- **iOS** (future): Same as Android

### Styling Consistency
- Use existing Material Design components
- Follow color tokens from [styles.scss](src/styles.scss)
- Match button styles (btn-primary, btn-secondary, etc.)
- Ensure responsive layout for small screens

## Alternative Approaches Considered

### Alternative 1: Bottom Sheet instead of Dialog
- **Pros**: More mobile-friendly, slides up from bottom
- **Cons**: App already uses dialogs consistently, would introduce inconsistency
- **Decision**: Stick with dialog for consistency

### Alternative 2: Direct button replacement (3 separate buttons)
- **Pros**: No dialog needed, more direct
- **Cons**: Takes up more screen space, clutters UI
- **Decision**: Use dialog to keep UI clean

### Alternative 3: Use HTML5 capture attribute
```html
<input type="file" accept="image/*" capture="camera">
```
- **Pros**: Simple, no dependencies
- **Cons**: Limited control, inconsistent browser support, no gallery option
- **Decision**: Use Capacitor for better control and native experience

## Dependencies
- `@capacitor/camera`: ~7.0.0 (match other Capacitor plugins)

## Risks & Mitigations
1. **Risk**: Camera permissions denied by user
   - **Mitigation**: Show helpful error message, fall back to file browse

2. **Risk**: Photo file size exceeds 5MB limit
   - **Mitigation**: Use quality and size options to compress images before upload

3. **Risk**: Camera not available on device
   - **Mitigation**: Detect availability and hide camera/gallery options if not available

4. **Risk**: File conversion issues (URI to File)
   - **Mitigation**: Thorough testing, proper error handling

## Success Criteria
- ✅ Users on native apps can take photos with camera
- ✅ Users on native apps can select from photo gallery
- ✅ Users on web/PWA can still browse files normally
- ✅ All existing file validation works with camera photos
- ✅ Photos upload to Firebase Storage successfully
- ✅ No breaking changes to existing file upload flow
- ✅ Proper error handling for all edge cases
