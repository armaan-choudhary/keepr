# Agentic Development Guidelines — Keepr

Operational guidance for contributors building Keepr's React Native TypeScript app and its iOS/Android native modules.

## 1. Media Safety & Privacy Rules

1. Keep core media processing and product workflows 100% offline-capable. The only planned network feature is optional, user-enabled Google Drive or similar cloud backup/sync (disabled by default). Never add telemetry, analytics, or background network calls.
2. Do not make albums, search, filters, duplicate/burst analysis, reminders, session history, compression, or checkout depend on network access.
3. Never mutate or overwrite shared originals directly. Keep Delete and Compress decisions staged until checkout.
4. Validate staged outputs before presenting them. Check nonzero size, decodability/playability, supported metadata handling, and measured size.
5. Obtain platform authorization before changing library assets. Android MediaStore and iOS PhotoKit have different semantics; document and present their flows accurately.
6. Handle per-item partial results. Consent, source changes, and replacement publication are not one atomic transaction. Never claim rollback when some OS changes have already succeeded.
7. Use filesystem deletion only for app-owned temporary files in private storage.
8. Strictly avoid storing or committing secrets, API keys, credentials, or signing keys to the repository.

## 2. React Native, TypeScript & Expo Architecture

* **Expo Go is Unsupported**: Keepr relies on custom native modules (`MediaStoreAdapter`, `PhotoKitAdapter`, `AndroidCompressor`, `IOSCompressor`, WorkManager, and BackgroundTasks). Agents must NEVER instruct users to run Keepr via standard Expo Go, as native module linkage will fail at runtime.
* **Custom Development Builds Required**: Contributors and automated pipelines must use a Custom Development Build to run Keepr.
* **Canonical Build & Run Commands**:
  - Start Metro Bundler: `npx expo start` (or `npm start`)
  - Run Android Development Build: `npx expo run:android` (or `npm run android`)
  - Compile Android Debug APK: `cd android && ./gradlew assembleDebug && cd ..`
  - Run iOS Development Build (macOS with Xcode 15+): `npx expo run:ios` (or `npm run ios`)
* **Optional EAS Cloud Builds**: For environments without local Android SDK or macOS/Xcode, use EAS Build with the development profile: `eas build --profile development --platform android/ios/all`. Note EAS signing requirements (Android debug keystores; Apple Developer Program team ID, certificates, and provisioning profiles with registered UDIDs).
* Keep shared product behavior in typed TypeScript domain modules. Components render state and dispatch actions; they do not query or mutate media directly.
* Keep platform identifiers opaque in shared code. Do not parse Android content URIs, iOS asset identifiers, or shared-library filesystem paths.
* Put OS access, media encoding, and background execution behind narrow typed native-module interfaces. Validate inputs at the native boundary and return structured errors/outcomes.
* Keep state immutable and use one consistent state-management approach. Avoid coupling domain rules to React components or a state-library API.
* Use the repository's selected React Native libraries and pin dependencies through the established package manager. Do not introduce overlapping gesture, navigation, or persistence frameworks without need.
* Keep expensive IO, image decoding, database work, and encoding off the UI thread. Use native/background execution when platform limits require it.
* Isolate cloud provider integrations from local repositories and features. Keep providers disconnected and make no requests until explicit opt-in. Declare only the package permissions needed by a shipped provider; keep sync failures recoverable and never silently upload source media.

## 3. UI and Accessibility

Follow [UI Guidelines](./UI_GUIDELINES.md). Every swipe decision must also be available through a labeled button and assistive technology action. Support VoiceOver, TalkBack, font scaling, reduced motion, and clear confirmation before destructive operations.

## 4. Error Handling

Never swallow exceptions. Return typed failures and preserve enough context for recovery without exposing sensitive media details in logs. Report partial completion per item and distinguish estimated savings from measured results.

## 5. Verification

Use the checks appropriate to the change:

1. Type-check and lint shared TypeScript.
2. Run focused shared unit tests for domain behavior.
3. Build the affected iOS and Android targets.
4. Run native and device tests for permission prompts, PhotoKit/MediaStore changes, codec behavior, and background execution; mocks cannot validate OS behavior.
5. Verify 100% offline-first execution with zero network dependencies in core features, zero telemetry, and zero analytics.
6. Review `git status` and ensure no secrets, API keys, credentials, keystores (`*.keystore`, `*.jks`), temporary media, or generated build artifacts were added.

Do not claim a platform workflow is verified if it was only tested through mocks. If the app scaffold or required tooling is not yet present, report that limitation clearly.

## 6. Documentation Workflow

For architectural or platform behavior changes, update the README, [Architecture](./ARCHITECTURE.md), [Technical Specification](./TECHNICAL_SPEC.md), [UI Guidelines](./UI_GUIDELINES.md), and [Task Roadmap](./TASK_ROADMAP.md) as applicable. Keep planning status accurate; do not mark work complete without evidence.
