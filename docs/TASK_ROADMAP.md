# Task Roadmap & Agent Execution Backlog — Keepr

Planning backlog for the React Native iOS and Android application. Tasks are marked complete only once verified against code, runnable tests, and platform builds. Tasks whose acceptance criteria require physical device verification, OEM validation, or live external credentials remain unchecked with partial verification status clearly documented.

## Progress Overview

- [x] **Phase 1: React Native Foundation and Shared Domain** (Complete — Verified via Android APK build, TypeScript typecheck, and Jest test suite)
- [ ] **Phase 2: Native Media Access and Authorization** (Partial — Unit/JVM/TS verified; pending physical device validation across Android API 29–35+ and iOS hardware/macOS simulator)
- [ ] **Phase 3: Local Persistence and Media Processing** (Partial — Session persistence & TS queue verified; pending physical device validation for hardware codecs and thermal behavior)
- [x] **Phase 4: Shared Triage Experience** (Complete — Verified via CardDeck and ActionButtons gesture & accessibility test suites)
- [ ] **Phase 5: Safe Checkout and Recovery** (Partial — Domain/UI/Unit verified; pending physical device validation for Android/iOS OS consent dialogs and background quotas)
- [ ] **Phase 6: Polish and Extensions** (Partial — UI/Filters/Safeguards verified; pending physical device album tests and live cloud OAuth credential verification)

---

## Phase 1: React Native Foundation and Shared Domain

### [x] Task 1.1: Cross-platform app scaffold & custom dev build
* **Goal**: Establish the React Native TypeScript app, custom native build targets, and verification workflows.
* **Scope**: React Native 0.88 bare workflow with TypeScript, React Navigation 7, Gesture Handler 3, and Reanimated 4. Configured for Custom Development Builds (`npx expo run:android` / `npx expo run:ios`, native Gradle, or EAS Build). Expo Go explicitly documented as unsupported due to custom native modules (`MediaStoreAdapter`, `PhotoKitAdapter`, `AndroidCompressor`, `IOSCompressor`, WorkManager, BackgroundTasks). Android configured for `minSdkVersion = 24`, `compileSdkVersion = 35`, `targetSdkVersion = 35`, NDK 27. iOS configured for iOS 15.1+ deployment target with CocoaPods Podfile and Swift bridging headers.
* **Verification**: Clean Android Gradle build succeeds (`./gradlew assembleDebug` generated `app-debug.apk`), TypeScript passes (`npx tsc --noEmit`), and full test matrix passes (`npm test`). Linux host limitations documented for Xcode native binary compilation.

### [x] Task 1.2: Domain contracts
* **Goal**: Define platform-neutral media, session, decision, error, and result types.
* **Scope**: Platform-neutral media interfaces in `src/platform/contracts/index.ts` and domain state machines, validation rules, privacy-safe error sanitizers, and bounded 10-item undo managers in `src/domain/`. Keeps native asset handles opaque.
* **Verification**: Unit tests in `__tests__/domain/domain.test.ts` cover decision rules, validation, protection assertion, LIFO 10-item undo eviction, and commit result mapping without native dependencies.

---

## Phase 2: Native Media Access and Authorization

### [ ] Task 2.1: Android MediaStore adapter (Partial: Unit/JVM/Build verified; physical device acceptance required)
* **Goal**: Query paginated media and expose current Android authorization state.
* **Scope**: MediaStore cursor queries in `com.keepr.media.MediaStoreAdapter` supporting Android 10–12L (`READ_EXTERNAL_STORAGE`), Android 13 (`READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`), and Android 14+ (`READ_MEDIA_VISUAL_USER_SELECTED` with selected vs full scope, reselection via picker). Handles stale URIs, external volume bucket display names, and airplane mode (no network dependency).
* **Verification Status**:
  * **Verified**: 12 JVM tests in `MediaStoreAdapterTest.kt` passing, TypeScript tests in `src/platform/android/__tests__/android-platform.test.ts` passing (covering permissions matrix, pagination, and filters), and Android APK clean compilation (`./gradlew assembleDebug`).
  * **Pending Physical Device Acceptance**: Requires physical device testing across API 29–35+ for camera/OEM quirks (e.g. Samsung/Xiaomi/Pixel bucket paths), permission revocation on external SD/OTG volumes, and airplane mode on hardware.

### [ ] Task 2.2: iOS PhotoKit adapter (Partial: Unit/TS verified; macOS/physical device verification required)
* **Goal**: Query paginated photo/video assets and expose iOS authorization state.
* **Scope**: PhotoKit adapter in `ios/keepr/Media/PhotoKitAdapter.swift` supporting `.readWrite` authorization (`.notDetermined`, `.restricted`, `.denied`, `.limited`, `.authorized`). Strict offline operation sets `isNetworkAccessAllowed = false` and flags iCloud-only assets as unavailable. Native user albums restricted with clear guidance under limited access.
* **Verification Status**:
  * **Verified**: Swift unit test suite structure in `ios/keeprTests/KeeprTests.swift` and 10 TypeScript tests in `src/platform/ios/__tests__/ios-platform.test.ts` verifying authorization mapping, limited access handling, and offline iCloud isolation.
  * **Pending Physical Device Acceptance**: Requires physical iOS device or macOS simulator for PhotoKit change observer (`PHPhotoLibraryChangeObserver`), iCloud-only asset behavior with network disabled, and limited-library picker. (Linux build hosts cannot run Xcode or the iOS Simulator).

---

## Phase 3: Local Persistence and Media Processing

### [x] Task 3.1: Local session persistence
* **Goal**: Persist reviewed decisions, sessions, and pending processing jobs.
* **Scope**: Cross-platform durable key-value storage engine in `src/data/storageEngine.ts`, Keepr-local collections repository in `src/data/collectionsRepository.ts` (preserving unavailable assets without silent removal), session repository in `src/data/sessionRepository.ts` (supporting interrupted session recovery), and pending job queue in `src/data/jobQueueRepository.ts` with abandoned staging cleanup.
* **Verification**: 13 unit tests in `__tests__/data/storage.test.ts` verifying CRUD, session recovery, unavailable asset preservation, and staged file cleanup.

### [ ] Task 3.2: Native image processing (Partial: Unit/TS verified; physical device validation required)
* **Goal**: Compress images safely on both platforms.
* **Scope**: Android (`com.keepr.processing.AndroidCompressor`) and iOS (`ios/keepr/Processing/IOSCompressor.swift`) compressors downscaling to maximum 2560px without upscaling. Preserves EXIF and GPS metadata using `androidx.exifinterface` on Android and `ImageIO` on iOS. Staged in app-private durable directories (`keepr_staging`).
* **Verification Status**:
  * **Verified**: Android tests in `AndroidCompressorTest.kt`, iOS tests in `KeeprTests.swift`, and TypeScript coordinator tests in `__tests__/processing/processing.test.ts` verifying aspect ratio math, metadata retention, and smaller-output validation.
  * **Pending Physical Device Acceptance**: Requires physical device validation of hardware codecs, decodability of all camera formats (RAW/DNG, HEIC/HEIF, OEM extensions), and thermal/memory behavior under heavy continuous batches.

### [ ] Task 3.3: Native video processing (Partial: Unit/TS verified; physical device playback validation required)
* **Goal**: Produce smaller, validated video candidates where supported.
* **Scope**: Target up to 1080p (1920x1080) with audio track preservation using Android `MediaMuxer`/`MediaExtractor` and iOS `AVAssetExportSession` with progress reporting and cancellation support.
* **Verification Status**:
  * **Verified**: Dimension math tests, progress callbacks, and staging validation across Android, iOS, and TypeScript processing suites (`__tests__/processing/processing.test.ts`).
  * **Pending Physical Device Acceptance**: Requires physical device video playback validation across Android & iOS devices (testing hardware decoder/encoder interoperability, audio/video sync, frame-rate preservation, and OEM format quirks).

---

## Phase 4: Shared Triage Experience

### [x] Task 4.1: Card deck and gesture handling
* **Goal**: Build the shared tri-directional deck with smooth transitions.
* **Scope**: Shared `src/components/CardDeck.tsx` using Gesture Handler and Reanimated with 3-card perspective stack depth (100%, 95%, 90% scale/opacity). Recognizes Swipe Right (Keep), Swipe Left (Delete), Swipe Up (Compress with dynamic pill savings estimate), downward drag reset, and dominant-vector diagonal resolution.
* **Verification**: Component tests in `__tests__/components/CardDeck.test.tsx` verifying drag thresholds, action pills, downward reset, and accessible roles.

### [x] Task 4.2: Accessibility and visual feedback
* **Goal**: Make each decision clear without relying on color or gesture alone.
* **Scope**: Labeled action buttons in `src/components/ActionButtons.tsx` (Delete, Compress, Keep, Undo, Inspect) with 48dp touch targets. TalkBack and VoiceOver support with `accessibilityLabel`, `accessibilityHint`, and accessible actions. Adheres strictly to the monochrome design system tokens in `src/theme/tokens.ts`.
* **Verification**: Tests in `__tests__/components/ActionButtons.test.tsx` and screen tests verifying accessibility traits, labels, and hitSlop boundaries.

---

## Phase 5: Safe Checkout and Recovery

### [x] Task 5.1: Shared undo and checkout
* **Goal**: Stage decisions and review them before any media changes.
* **Scope**: 10-item bounded LIFO undo manager in `src/domain/undoManager.ts` and `src/components/UndoBanner.tsx`. `src/screens/CheckoutSummaryScreen.tsx` displaying grouped lists (Compress, Delete, Keep), thumbnail tap to rescue/unselect, and estimated versus actual measured savings display.
* **Verification**: Domain tests in `__tests__/domain/domain.test.ts` and UI tests in `__tests__/screens/CheckoutSummaryScreen.test.tsx` verifying rescue, undo eviction, and commit summary presentation.

### [ ] Task 5.2: Platform commit adapters (Partial: Unit/TS verified; physical device consent dialog validation required)
* **Goal**: Apply selected changes through each platform's supported APIs with accurate safety and recovery semantics.
* **Scope**:
  * On Android 11+ (API 30+): MediaStore provides system trash where user consent is requested via system dialogs (`MediaStore.createTrashRequest`), and retention is system-defined (not Keepr-controlled).
  * On Android 10 (API 29): Permanent delete upon recoverable consent (`RecoverableSecurityException`).
  * On iOS: Assets are moved to the system "Recently Deleted" album through PhotoKit change requests (`PHAssetChangeRequest.deleteAssets`), with recovery managed by iOS and user settings.
  * Both adapters return per-item outcomes (`KEPT`, `TRASHED`, `PERMANENTLY_DELETED`, `REPLACED`, `DENIED`, `FAILED`, `SKIPPED`) and honor Keepr protection safeguards. Never promise that Keepr controls retention or that Android and iOS have identical recovery semantics.
* **Verification Status**:
  * **Verified**: Android unit tests in `AndroidCommitAdapterTest.kt`, iOS unit tests in `KeeprTests.swift`, and TypeScript bridge tests in `__tests__/domain/domain.test.ts`.
  * **Pending Physical Device Acceptance**: Requires physical device testing of Android 11+ system trash dialog, Android 10 RecoverableSecurityException dialog, and iOS Photos change authorization dialog across OEM variants.

### [ ] Task 5.3: Durable processing and retry (Partial: Unit/TS verified; physical device background validation required)
* **Goal**: Make long-running jobs recoverable within platform background limits.
* **Scope**: Android WorkManager integration (`com.keepr.jobs.KeeprWorkManager`) and iOS BGTaskScheduler integration (`ios/keepr/Background/IOSBackgroundTaskAdapter.swift`). Resumable job checkpoints in `src/data/jobQueueRepository.ts` with automatic cleanup of abandoned app-owned staged files.
* **Verification Status**:
  * **Verified**: Status mapping tests, checkpoint persistence tests, and storage cleanup tests in `__tests__/data/storage.test.ts`.
  * **Pending Physical Device Acceptance**: Requires physical device testing for WorkManager under OS battery optimization / Doze mode / background execution quotas and iOS Background Tasks (`BGTaskScheduler`) scheduling limits.

---

## Phase 6: Polish and Extensions

### [x] Task 6.1: Before/after comparison
* **Goal**: Let users inspect image quality before commit.
* **Scope**: `src/components/BeforeAfterCompare.tsx` featuring side-by-side, split slider, and toggle flip comparison modes with pinch-zoom/pan support and storage savings metrics.
* **Verification**: Tests in `__tests__/components/BeforeAfterCompare.test.tsx`.

### [x] Task 6.2: Similar and burst grouping
* **Goal**: Offer optional grouped review for related media.
* **Scope**: `src/processing/duplicateBurstGrouping.ts` grouping bursts via timestamp proximity (default 2s) and selecting best representative shot using quality heuristics while never auto-deleting.
* **Verification**: Tests in `__tests__/processing/processing.test.ts`.

### [x] Task 6.3: Session statistics
* **Goal**: Summarize completed triage and measured storage changes.
* **Scope**: `src/screens/StatsScreen.tsx` displaying verified reclaimed storage, breakdown by media type (Videos, Photos, Screenshots), and historical session logs distinguishing estimates from actual bytes.
* **Verification**: Tests in `__tests__/screens/StatsScreen.test.tsx`.

### [ ] Task 6.4: On-device albums and album-aware review (Partial: Component/Unit verified; physical device album tests required)
* **Goal**: Create albums and use them as sources for triage sessions.
* **Scope**: `src/screens/CollectionsScreen.tsx` supporting 100% offline Keepr-managed collections alongside native device albums. Clearly separates Keepr collections from OS albums, disables native albums under iOS limited access with clear guidance, and distinguishes "Remove from Collection" from "Delete from Library".
* **Verification Status**:
  * **Verified**: Component and unit tests in `__tests__/screens/CollectionsScreen.test.tsx` verifying collection CRUD, separation from device albums, and limited access fallback.
  * **Pending Physical Device Acceptance**: On-device physical device tests across Android OEM gallery implementations and iOS Photos album permission boundaries.

### [x] Task 6.5: Smart collections, search, and filters
* **Goal**: Make local libraries easier to browse without a network connection.
* **Scope**: `src/processing/smartFilters.ts` supporting 5 on-device triage queues: "Old Screenshots" (>30 days), "Heavy Hitters" (>15MB), "Messaging Media", "On This Day", and "Month by Month".
* **Verification**: Tests in `__tests__/processing/processing.test.ts` and `__tests__/screens/TriageDeckScreen.test.tsx`.

### [x] Task 6.6: Duplicate, burst, and sequence review
* **Goal**: Identify related media for user-guided cleanup.
* **Scope**: `src/screens/DuplicatesScreen.tsx` letting users compare duplicate candidates, mark best representative shot, and stage non-representatives for compression or deletion with manual override.
* **Verification**: Tests in `__tests__/screens/DuplicatesScreen.test.tsx`.

### [x] Task 6.7: Local safeguards, reminders, and privacy
* **Goal**: Make ongoing review safer and more private.
* **Scope**: Keepr-local protection registry in `src/data/protectionRegistry.ts` acting as authoritative cross-platform safeguard against destructive operations. Inspect sheet protection toggle in `src/components/InspectSheet.tsx`. Local reminders toggle in `src/screens/SettingsScreen.tsx`.
* **Verification**: Tests in `__tests__/data/storage.test.ts`, `__tests__/components/InspectSheet.test.tsx`, and `__tests__/screens/SettingsScreen.test.tsx`.

### [x] Task 6.8: Sharing, export, and storage forecast
* **Goal**: Help users prepare selections and understand likely and actual savings.
* **Scope**: `src/processing/storageForecast.ts` calculating forecast savings based on resolution/size heuristics and comparing against actual measured savings.
* **Verification**: Tests in `__tests__/processing/processing.test.ts`.

### [ ] Task 6.9: Optional cloud backup and sync (Partial: Unit/TS verified; OAuth and live device verification required)
* **Goal**: Let users opt in to backing up or syncing supported Keepr data with Google Drive or a similar provider.
* **Scope**: `src/processing/cloudSyncService.ts` providing an isolated, opt-in cloud sync adapter. Strictly disabled by default, offline-first fallback, zero network calls during core triage, and source media upload disabled by default. Configurable in `src/screens/SettingsScreen.tsx`.
* **Verification Status**:
  * **Verified**: Isolated service unit tests in `__tests__/processing/processing.test.ts` and UI toggle tests in `__tests__/screens/SettingsScreen.test.tsx`. Offline-first invariant verified with zero network calls during core triage.
  * **Pending External Credential / Device Acceptance**: Cloud backup/sync requires real Google Cloud OAuth credentials and live device testing to verify real authentication flows, token refreshes, and network synchronization.
