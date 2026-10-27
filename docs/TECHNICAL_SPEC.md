# Technical Specification — Keepr

This specification describes shared media behavior and the iOS/Android platform integrations required by the React Native application. Verify OS behavior against current platform documentation when implementation begins.

## Offline-First & Privacy Requirements

Core app operations (triage, compression, undo, stats, albums, duplicate/burst analysis, search, reminders) are **100% offline with zero network dependencies**. All media browsing, filtering, decoding, downscaling, metadata processing, decision staging, checkout, and local analytics execute entirely on-device using local media and metadata.

Keepr enforces strict privacy and security invariants:
1. **Zero Telemetry & Analytics**: There are no telemetry collectors, tracking SDKs, or background analytics pings.
2. **Zero Automatic Cloud Syncing**: Cloud sync (e.g., Google Drive backup/sync) is strictly opt-in, disabled by default, and fully decoupled from core app workflows. When disabled, the app makes zero network requests. Cloud availability, sign-in status, token expiration, or sync failures must never interrupt, degrade, or block local triage operations. Source media is never uploaded as part of metadata/session sync unless the user separately enables an explicit, dedicated media-backup feature.
3. **Zero Secrets in Repository**: No API keys, credentials, signing certificates, or keystores may be committed to version control. All credentials must remain externalized and git-ignored.

## 1. Media Access and Authorization

The shared app asks the platform adapter for authorization state and media pages; it does not assume that access covers the full library. Handle denied, limited/selected, and full access where the OS supports them. Re-check authorization when returning to the foreground and refresh affected queries.

### Android

* Query shared images/videos through `MediaStore`; do not depend on raw shared-storage paths or the `DATA` column. Query on a worker thread, page results, and refresh when the app resumes or permission state changes.
* Request only the media types used. Android 10–12L (API 29–32) uses `READ_EXTERNAL_STORAGE` capped at API 32; Android 13 (API 33) uses `READ_MEDIA_IMAGES` and/or `READ_MEDIA_VIDEO`; apps targeting Android 14+ (API 34+) must also handle `READ_MEDIA_VISUAL_USER_SELECTED` and selected-item access. Do not persist permission state as authoritative.
* A platform Photo Picker is appropriate when the user chooses individual assets. It does not replace library access for broad library triage, filters, or album browsing. Do not configure a cloud media provider in the picker if strict offline behavior is required.
* Android 10 supports MediaStore scoped storage. On API 29, deleting another app's media requires per-item recoverable consent via `RecoverableSecurityException` system dialog and results in permanent deletion upon user approval; it cannot be recovered and must never be called trash.
* Android 11+ (API 30+) supports user-consented batch trash and permanent-delete requests. MediaStore provides system trash where user consent is requested via system dialogs (`MediaStore.createTrashRequest`), and retention is system-defined (managed by the OS/OEM; Keepr does not manage or guarantee retention duration). Permanent deletion (`MediaStore.createDeleteRequest`) requires separate user-consented system prompts. Avoid requesting broad `MANAGE_MEDIA`; it is not required for the normal user-confirmed flow.
* Never make misleading promises that Keepr controls retention or that Android and iOS have identical "30 days" or "trash" semantics.
* Treat content URIs and access grants as revocable. A URI previously seen may become unreadable after access changes or process restart; surface an unavailable-item result and refresh the library.

| Android OS range | Library access behavior | Keepr requirement |
|---|---|---|
| Android 10 (API 29) | Shared-media read permission; scoped-storage behavior applies. | Test query and per-item permanent-delete consent (`RecoverableSecurityException`); permanent deletion upon approval (no system trash). |
| Android 11–12L (API 30–32) | `READ_EXTERNAL_STORAGE`; scoped MediaStore access. | Use system trash consent dialog (`createTrashRequest`) for other apps' media (retention is system-defined); never raw-delete. |
| Android 13 (API 33) | Granular image/video read permissions. | Request only image/video permissions needed by the active feature. |
| Android 14+ (API 34+) | Full, selected, or denied access; selected-media permission supports reselection. | Refresh results after foregrounding/reselection; explain that filters cover only visible items. |

Select the `minSdk`, `targetSdk`, and exact permission declarations during app scaffolding based on the supported device policy and current Play requirements. This matrix documents runtime behavior; it is not a substitute for reviewing current target-SDK rules.

### iOS

* Use PhotoKit (`PHPhotoLibrary`) for library enumeration and mutations. Request `.readWrite` access only when the user starts a feature that needs browsing or changing assets. Use `.addOnly` only for an add-only workflow; it is insufficient for Keepr's review and deletion flows.
* Handle `.notDetermined`, `.restricted`, `.denied`, `.limited`, and `.authorized` for the relevant access level. Re-check on foreground and observe PhotoKit library changes. Do not treat limited access as an empty library.
* Under limited access, the app can work with selected assets, but PhotoKit does not allow fetching or creating user albums. Disable those native-album operations with an explanation or use Keepr-managed local collections that store references only to assets the user has selected. Creating an asset does not grant general album access.
* For user-selected, one-off input, use the system Photos picker where appropriate. It provides selected assets without granting broad library access, but it is not a substitute for Keepr's broad local-library triage mode.
* PhotoKit assets may be backed by iCloud Photos and not stored locally. Strict offline processing must set resource/image requests to disallow network access, detect the “requires network” result, and mark the asset as unavailable offline. Never trigger an iCloud download silently. If the user explicitly chooses an online download, show progress and network use.
* On iOS, assets are moved to the system "Recently Deleted" album through PhotoKit change requests (`PHAssetChangeRequest.deleteAssets`), with recovery managed by iOS and user settings. The OS may prompt the user with a system authorization dialog before applying deletions. iOS deletion is not MediaStore trash: never promise a Keepr-controlled recovery period or Android-style trash semantics.

| PhotoKit access state | Keepr behavior |
|---|---|
| Not determined | Explain why access is needed, then request only when the user starts a library feature. |
| Full read/write | Offer supported library review and native album operations. |
| Limited | Review only selected assets; offer the limited-library picker and Keepr-local collections; do not fetch/create user albums. |
| Denied/restricted | Keep local Keepr data accessible; explain how to change access in Settings when appropriate. |

Check the `.readWrite` access-level status rather than older status APIs that do not distinguish limited access. Observe `PHPhotoLibraryChangeObserver` updates and reconcile only the affected references where practical.

### Shared query behavior

Only query the metadata needed for the current feature. Use opaque platform identifiers in TypeScript and avoid relying on filesystem paths or app-specific folder conventions. Screenshot and messaging filters are best effort because metadata visibility varies by platform and app.

Model media availability separately from authorization: `availableOffline`, `requiresNetwork`, `permissionRevoked`, and `assetMissing` are distinct states. Queue filters operate only over assets currently visible under the granted authorization. Label result counts as “items available to Keepr” when access is selected/limited.

## 2. Albums, Collections, and Favorites

Keep Keepr-managed collections distinct from albums in the system photo library.

* **Keepr collection**: local app database grouping of opaque asset references and a name. It is offline, app-private, and should still work with limited library access for references the user can access. If an asset becomes unavailable, preserve the collection entry and mark it unavailable; do not silently remove it.
* **Android device album**: typically a directory grouping represented through MediaStore metadata. For newly created output, use MediaStore insertion and `RELATIVE_PATH` where supported; do not create or move shared media with raw filesystem operations. Existing media can be added/moved only through supported URI operations and any required user consent. Capability-test OEM behavior.
* **iOS Photos album**: create/fetch user albums through PhotoKit only when authorization permits it. Limited-library mode cannot create or fetch user albums, so offer Keepr collections or a route to adjust access instead. Distinguish removing an asset from an album from deleting it from the Photos library; the latter is destructive.
* **Favorites/protection**: use a Keepr-local “protected” flag as the cross-platform safety source of truth. Reading/writing native favorite flags is optional and platform-specific; any write must use the OS API and consent where required. Never infer that a favorite asset is safe to delete on the other platform.

## 3. Compression and Staging

Keep compression behind a shared TypeScript contract with native iOS and Android implementations. Both implementations should capability-check codecs and formats at runtime; never promise an output format or savings amount before measuring the produced file.

### Image targets

* Initial target: maximum dimension 2560 px, preserving aspect ratio; do not upscale smaller images.
* Preserve supported capture time, orientation, camera attributes, and GPS metadata when product policy and platform APIs allow. Normalize orientation if pixels are rotated. Do not fail solely because an optional metadata field cannot be copied.
* Use a supported platform encoder and select formats based on actual runtime capability and interoperability. Validate that the output decodes, has nonzero size, and is smaller than the original before offering replacement.

### Video targets

* Initial target: maximum 1920x1080, with codec and audio handling selected from available platform encoders.
* Probe source tracks, preserve audio when supported, expose progress, and support cancellation where practical.
* Validate playback and output size. If the result is not smaller or cannot be validated, keep the original and explain that no replacement will occur.

Write outputs to durable app-private staging for pending checkout or resumable work. Use cache only for disposable previews. Never overwrite a source asset.

### Offline source policy

Offline mode must never silently download cloud-only assets. On Android, library queries target local MediaStore content; picker/provider results that require a network fetch must be shown as unavailable offline. On iOS, PhotoKit resource requests must disallow network access by default. Compression and duplicate analysis run only on source bytes available locally. Let the user explicitly choose to fetch a cloud-backed iOS asset, and clearly label that as an online action outside strict offline mode.

## 4. Safe Commit Protocol

1. Stage and validate a candidate output while leaving the source untouched.
2. Show the user the original and proposed output, with measured sizes and clear estimated-versus-actual savings labels.
3. Request only the platform authorization needed for the selected originals.
4. Apply the platform change and publish/create replacements using native APIs:
   - **On Android 11+ (API 30+)**: Request user consent via the MediaStore system trash dialog (`MediaStore.createTrashRequest`); retention is system-defined (managed by OS/OEM; Keepr does not manage retention duration).
   - **On Android 10 (API 29)**: Request per-item consent via `RecoverableSecurityException` system prompt, resulting in permanent delete upon user approval.
   - **On iOS**: Request authorization via PhotoKit change requests (`PHAssetChangeRequest.deleteAssets`), moving assets to the system "Recently Deleted" album with recovery managed by iOS and user settings.
5. Record success or failure per item. Consent, source mutation, and replacement publication may not be atomic; expose partial completion and preserve retryable staged output.

For Delete, do not mutate files on swipe. Stage the decision and include it in checkout. For Compress, do not publish a replacement if source removal/trashing was denied or failed. Never use raw filesystem deletion on shared media.

## 5. Gesture Behavior

Use a 2D coordinate system centered at `(0, 0)`:

```text
                    Up -> COMPRESS
                     |
DELETE  <------------+------------> KEEP
                     |
                Down -> reset
```

Initial tuning targets (adjust after device testing):

* Horizontal commit: `abs(x) > 0.35 * screenWidth` or horizontal velocity above `1000 dp/s`.
* Upward commit: `y < -0.25 * screenHeight` or upward velocity above `900 dp/s`.
* Resolve upward compress only when `abs(y) > 1.2 * abs(x)` and `y < 0`; otherwise the dominant horizontal vector selects Keep/Delete. Ambiguous or sub-threshold drags return to center. Downward motion never commits.
* Inspect is an explicit tap/action, not a swipe decision.

Use React Native Gesture Handler and Reanimated for gesture recognition and animation. The gesture system must not be the only way to choose an action; provide labeled buttons and accessible Inspect/Undo actions.

## 6. Session and Local Data

Persist enough local state to recover sessions safely:

* Reviewed media: opaque platform ID, decision, timestamp, and optional content identity.
* Triage session: mode, counts by decision, estimated and actual bytes, status, and completion time.
* Pending jobs: source ID, media type, staged output reference, progress/status, and recoverable error.
* Collections: local collection ID, name, ordered member references, and per-member availability. Store whether a collection is Keepr-managed or a platform album; do not treat them as interchangeable.

Apply the 10-item undo buffer only to uncommitted decisions. Mark items reviewed only after their operation reaches a recorded terminal outcome. Keep all records local unless a future product requirement explicitly changes that policy.

## 7. Background Work and Notifications

* **Android**: use WorkManager for durable, retryable work where appropriate. User-visible long processing may use a foreground worker and notification, subject to current foreground-service types, job quotas, and OS restrictions. Persist checkpoints; cancellation or process death must leave originals intact and staged outputs recoverable or cleanly disposable.
* **iOS**: do not promise indefinite background execution. Use a supported user-initiated continued-processing or background task strategy when available and appropriate; otherwise process in the foreground, checkpoint frequently, and resume when the app returns. Treat scheduling as best effort and honor expiration/cancellation callbacks.
* Local reminders use platform local-notification APIs and require the relevant user permission. Declined notifications must not disable app features; provide in-app reminders/status as a fallback.
* Background behavior is tested on real devices. Simulator and unit-test success do not prove OS scheduling guarantees.

## 8. Development & Build Specification (Expo & Native Toolchains)

### Expo Go Incompatibility
**Expo Go CANNOT run Keepr.** Keepr integrates custom native modules and platform capabilities that cannot be resolved in standard Expo Go:
- **Android Native Modules**: `MediaStoreAdapter` (handling scoped cursor queries, API 29-35+ permission variations, `createTrashRequest`, and `RecoverableSecurityException`), `AndroidCompressor` (hardware-accelerated codecs, `androidx.exifinterface`), and Jetpack WorkManager background workers.
- **iOS Native Modules**: `PhotoKitAdapter` (PhotoKit queries, change requests via `PHAssetChangeRequest`, `PHPhotoLibraryChangeObserver`), `IOSCompressor` (`ImageIO`, `AVAssetExportSession`), and iOS BackgroundTasks framework.

Attempting to launch Keepr inside Expo Go results in fatal `Native module not found` runtime crashes.

### Custom Development Build Requirement
All runtime verification and app execution require a **Custom Development Build**. Contributors build and run the application using either local native toolchains (`npx expo run:android` / `npx expo run:ios`) or EAS Build with a `development` profile.

### Local Android Build Environment
- **Toolchain**: Node.js v22+, OpenJDK 21, Android SDK platform 35, Build Tools 35.0.0 / 36.0.0, NDK 27.
- **Configuration**: Define SDK path in `android/local.properties` (`sdk.dir=/path/to/android/sdk`) or export `ANDROID_HOME`.
- **Commands**:
  - Start Metro Bundler: `npx expo start` (or `npm start`)
  - Build & Launch on connected device/emulator: `npx expo run:android` (or `npm run android`)
  - Assemble Debug APK directly: `cd android && ./gradlew assembleDebug && cd ..`
  - Output artifact: `android/app/build/outputs/apk/debug/app-debug.apk`
  - Install to device: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
  - Native JVM Unit Tests: `cd android && ./gradlew test && cd ..`

### Local iOS Build Environment (macOS only)
- **Toolchain**: macOS host, Xcode 15+, Command Line Tools, CocoaPods 1.14+.
- **Setup**: `cd ios && pod install && cd ..`
- **Commands**:
  - Start Metro Bundler: `npx expo start` (or `npm start`)
  - Build & Launch on iOS Simulator / connected device: `npx expo run:ios` (or `npm run ios`)
  - *Note*: Linux build environments cannot compile native iOS binaries or run the iOS Simulator, though all shared TypeScript and domain tests run cross-platform on Linux.

### EAS Cloud Build Specification
For contributors without local Android SDK or macOS/Xcode setups:
- **EAS CLI**: `npm install -g eas-cli && npx eas login`
- **Profile**: Use `"development": { "developmentClient": true, "distribution": "internal" }` in `eas.json`.
- **Build Commands**:
  - `eas build --profile development --platform android`
  - `eas build --profile development --platform ios`
  - `eas build --profile development --platform all`
- **Credentials & Signing**:
  - **Android**: Managed EAS keystore or uploaded custom keystore (`.keystore`/`.jks`, alias, password). Produces installable `.apk`.
  - **iOS**: Requires active Apple Developer Program account. EAS manages Team ID, certificates, and internal Ad Hoc provisioning profiles with registered device UDIDs. Produces installable internal build.
- **Parity**: EAS development builds compile the project's native `android/` and `ios/` folders, producing a custom development build identical in capability to local native builds.

### Privacy & Secret Invariants
- The app must function 100% offline in core triage mode with zero network requests.
- No analytics or telemetry libraries may be included or loaded.
- Cloud sync must remain strictly opt-in and disabled by default.
- Never commit credentials, API keys, tokens, or keystores to git.

## 9. Platform References

* [Expo Custom Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
* [EAS Build Overview](https://docs.expo.dev/build/introduction/)
* [Android 14 selected photos access](https://developer.android.com/about/versions/14/changes/partial-photo-video-access)
* [Android MediaStore reference](https://developer.android.com/reference/android/provider/MediaStore)
* [Android shared media storage use cases](https://developer.android.com/training/data-storage/use-cases)
* [Android shared media access](https://developer.android.com/training/data-storage/shared/media)
* [Android 13 media permissions](https://developer.android.com/about/versions/13/behavior-changes-13)
* [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker)
* [Android media permission reference](https://developer.android.com/reference/android/Manifest.permission)
* [Apple PhotoKit](https://developer.apple.com/documentation/photokit)
* [Apple photo library authorization](https://developer.apple.com/documentation/photokit/requesting-authorization-to-access-photos)
* [Apple limited-library behavior](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app)
* [Apple PhotoKit album changes](https://developer.apple.com/documentation/photokit/browsing-and-modifying-photo-albums)
* [Apple PhotoKit network access for asset resources](https://developer.apple.com/documentation/photos/phassetresourcerequestoptions/isnetworkaccessallowed)
* [Android long-running WorkManager tasks](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running)
* [Apple background tasks](https://developer.apple.com/documentation/backgroundtasks)
