# UI Guidelines — Keepr

Keepr uses a monochrome, dark-first interface. The media being reviewed supplies the color; the surrounding UI stays quiet, legible, and consistent. These guidelines apply to shared React Native screens and components, platform dialogs, previews, and product imagery. Native UI may be used when required by an OS workflow while preserving the same principles.

## 1. Visual Direction

- Use near-black and charcoal surfaces with neutral gray borders and white-to-gray typography.
- Do not assign red, green, or teal as the permanent color for Delete, Keep, or Compress. Communicate each action with its text label, icon, position, and gesture direction. Color may reinforce a state only if the whole system remains monochrome.
- Avoid gradients, decorative color glows, colorful shadows, and unnecessary ornament.
- Keep the photo or video as the main visual focus. Use scrims only behind controls or text that need separation from the media.
- Prefer clear hierarchy and generous spacing over extra borders, cards, or dividers.

## 2. Color Tokens

Use centralized design-system tokens rather than inline color literals. These are starting values; check rendered contrast before shipping.

| Token | Hex | Use |
| --- | --- | --- |
| `background` | `#0A0A0A` | App background and system edge-to-edge canvas |
| `surface` | `#141414` | Main cards, sheets, and navigation surfaces |
| `surfaceElevated` | `#1D1D1D` | Menus, dialogs, and raised controls |
| `surfacePressed` | `#292929` | Pressed or selected neutral surface |
| `outline` | `#383838` | Subtle separators and control boundaries |
| `textPrimary` | `#F5F5F5` | Main text and essential icons |
| `textSecondary` | `#B3B3B3` | Supporting text and metadata |
| `textDisabled` | `#737373` | Disabled content; never use for essential information |
| `scrim` | `#000000` | Modal and media-control scrims with opacity applied separately |

Keep opacity as a separate token or parameter so the same base color remains predictable. Use fills and outlines to show hierarchy; do not rely on subtle shade differences alone to indicate an actionable control.

## 3. Action Feedback

Keep and Delete actions use the same monochrome visual language as Compress. Distinguish them through:

- Persistent labels: **Keep**, **Compress**, and **Delete**.
- Familiar, distinct icons paired with labels; never use an icon alone for a destructive action.
- Gesture direction and the matching on-screen action button position.
- A clear selected or armed state using a brighter neutral fill, stronger outline, and explicit label.
- A review summary that names each action and the number of affected items before commit.

During a drag, reveal the action label as soon as the gesture is recognized. Increase its opacity and scale smoothly toward the commit threshold. Keep the media visible and avoid tinting the full canvas with action colors. Haptics are optional reinforcement, never the only signal.

## 4. Typography and Information Hierarchy

- Use the platform typography scale and respect user font scaling.
- Use high-emphasis text for the active action, item count, and storage estimate; use secondary text for date, dimensions, and file size.
- Keep metadata concise on the deck. Put complete details in the Inspect view.
- Format sizes and dates consistently and in the user's locale.
- Avoid all-caps body copy. Reserve compact uppercase labels for short gesture badges where legible.

## 5. Components and Layout

- The active media card receives the strongest visual emphasis. Background cards are partially visible only as a depth cue and must not compete with it.
- Place the three labeled action buttons in a stable order: Delete, Compress, Keep. Keep Undo separate and easy to reach.
- Make touch targets at least 48 dp and leave enough spacing to prevent accidental activation.
- Use neutral outlines and surface changes to define controls against the background. Provide visible focus indicators for keyboard and switch access.
- Keep sheets and dialogs on the same dark neutral surfaces. Do not use color alone to distinguish warning, error, success, or selection states; add a title, icon, and explanatory text.
- Respect safe areas, display cutouts, platform navigation, and system bar contrast on iOS and Android.

## 6. Accessibility

- Meet WCAG contrast targets: at least 4.5:1 for normal text and 3:1 for large text and meaningful UI boundaries or graphics.
- Support VoiceOver and TalkBack with meaningful labels, action descriptions, and traversal order. Expose Keep, Compress, Delete, Inspect, and Undo as accessible actions in addition to gestures.
- Do not encode action meaning through color, position, or haptics alone.
- Respect font scaling, reduced-motion settings, and touch exploration. Ensure swipe actions have button alternatives.
- Confirm destructive selections in the checkout summary and clearly explain the platform-specific operation before invoking the OS authorization flow.

## 7. Motion and Haptics

- Use short, direct transitions that keep the current media anchored while the deck advances.
- Use motion to clarify drag direction, threshold, undo, and sheet transitions. Avoid decorative loops and bounce that slows repeated review.
- Make undo visually clear and available immediately after a decision.
- Respect system animation scale and reduced-motion preferences. Haptic feedback should be brief, distinct where useful, and suppressible.

## 8. React Native Implementation

- Define palette, typography, shapes, and motion in shared design tokens; do not scatter raw values across features.
- Use the selected React Native component library consistently and theme it with Keepr's tokens.
- Keep reusable components state-driven and expose labels and accessibility semantics as props.
- Provide previews or story states for default, pressed, disabled, loading, empty, error, and large font scale.
- Check the interface with grayscale screenshots and platform accessibility tooling. The monochrome design must remain understandable without color.

## 9. Platform-Specific States

- **Permission scope**: State how many items are visible to Keepr when access is selected/limited. Provide a clear action to choose more items or open system settings; do not imply that a partial library is the whole library.
- **Offline availability**: Core operations (triage, compression, undo, stats, albums) are 100% offline with zero network dependencies. Distinguish “not on this device,” “needs network,” “permission changed,” and “item unavailable.” Do not silently download iCloud-backed assets or present them as locally processable. Make offline mode usable without sign-in, and ensure optional cloud sync is strictly opt-in and disabled by default.
- **Albums**: Label Keepr-managed local collections separately from Android folders/MediaStore albums and iOS Photos albums. On iOS with limited access, explain that native albums are unavailable and offer local collections for permitted items.
- **Destructive actions**: Clearly articulate the platform-specific behavior before invoking system consent dialogs:
  - On Android 11+: Explain that items will be moved to the MediaStore system trash via system dialog consent, with retention defined by the OS/OEM (not Keepr-controlled).
  - On Android 10: Warn explicitly that items will be permanently deleted upon user consent dialog approval, as no system trash exists on API 29.
  - On iOS: Explain that items will be moved to the system "Recently Deleted" album through PhotoKit authorization, with recovery managed by iOS and user settings.
  - Never make misleading promises that Keepr controls retention or that Android and iOS have identical "30 days" or "trash" semantics.
- **Native prompts**: Show context before requesting access or invoking OS confirmation. Avoid prompting at launch; ask when the user starts the feature that needs the capability.
- **Platform fit**: Keep React Native visual consistency while honoring native safe areas, sheets, pickers, permission prompts, status/navigation bars, and expected back-navigation behavior.
