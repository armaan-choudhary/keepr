import React, { useTransition } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  colors,
  spacing,
  touchTargets,
  radii,
  typography,
  formatBytes,
  formatDimensions,
  formatDate,
  formatDuration,
  calculateEstimatedSavings,
} from '../theme';
import { MediaItem, TriageDecision } from '../platform/contracts';

export interface CardDeckProps {
  items: MediaItem[];
  onDecision: (item: MediaItem, decision: TriageDecision) => void;
  onInspect: (item: MediaItem) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

export interface GestureParams {
  translationX: number;
  translationY: number;
  velocityX?: number;
  velocityY?: number;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Resolves triage gesture action according to Keepr Technical Specification:
 * - Upward commit: y < -0.25 * screenHeight or vy < -900, with abs(y) > 1.2 * abs(x)
 * - Horizontal commit: abs(x) > 0.35 * screenWidth or abs(vx) > 1000
 * - Downward motion: resets without committing
 * - Diagonal ambiguity: dominant vector resolves action
 */
export function resolveGestureAction({
  translationX,
  translationY,
  velocityX = 0,
  velocityY = 0,
  screenWidth,
  screenHeight,
}: GestureParams): TriageDecision | 'RESET' {
  'worklet';
  const absX = Math.abs(translationX);
  const absY = Math.abs(translationY);

  // Downward motion never commits
  if (translationY > 0 && absY > absX) {
    return 'RESET';
  }

  // Upward compress threshold check
  const isUpwardCommit =
    (translationY < -0.25 * screenHeight || velocityY < -900) &&
    absY > 1.2 * absX &&
    translationY < 0;

  if (isUpwardCommit) {
    return 'COMPRESS';
  }

  // Horizontal commit check
  const isHorizontalCommit =
    absX > 0.35 * screenWidth || Math.abs(velocityX) > 1000;

  if (isHorizontalCommit) {
    return translationX > 0 ? 'KEEP' : 'DELETE';
  }

  return 'RESET';
}

export const CardDeck: React.FC<CardDeckProps> = ({
  items,
  onDecision,
  onInspect,
}) => {
  const windowDimensions = Dimensions.get('window');
  const screenWidth = windowDimensions.width;
  const screenHeight = windowDimensions.height;

  const cardWidth = Math.min(screenWidth - spacing.gutter * 2, 420);
  const cardHeight = Math.min(screenHeight * 0.62, 580);

  const activeItem = items[0] || null;
  const secondItem = items[1] || null;
  const thirdItem = items[2] || null;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isInteracting = useSharedValue(false);

  const handleActionCommitted = (decision: TriageDecision) => {
    if (!activeItem) return;
    onDecision(activeItem, decision);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isInteracting.value = true;
    })
    .onUpdate((event) => {
      'worklet';
      // If dragging downward, apply resistance
      if (event.translationY > 0 && Math.abs(event.translationY) > Math.abs(event.translationX)) {
        translateX.value = event.translationX * 0.4;
        translateY.value = event.translationY * 0.35;
      } else {
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      'worklet';
      isInteracting.value = false;

      const action = resolveGestureAction({
        translationX: event.translationX,
        translationY: event.translationY,
        velocityX: event.velocityX,
        velocityY: event.velocityY,
        screenWidth,
        screenHeight,
      });

      if (action === 'RESET') {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      } else if (action === 'KEEP') {
        translateX.value = withTiming(screenWidth * 1.5, { duration: 220 });
        runOnJS(handleActionCommitted)('KEEP');
        translateX.value = 0;
        translateY.value = 0;
      } else if (action === 'DELETE') {
        translateX.value = withTiming(-screenWidth * 1.5, { duration: 220 });
        runOnJS(handleActionCommitted)('DELETE');
        translateX.value = 0;
        translateY.value = 0;
      } else if (action === 'COMPRESS') {
        translateY.value = withTiming(-screenHeight * 1.2, { duration: 220 });
        runOnJS(handleActionCommitted)('COMPRESS');
        translateX.value = 0;
        translateY.value = 0;
      }
    });

  // Animated styles for active Card 1
  const card1AnimatedStyle = useAnimatedStyle(() => {
    const rotateZ = interpolate(
      translateX.value,
      [-screenWidth * 0.6, 0, screenWidth * 0.6],
      [-12, 0, 12],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotateZ}deg` },
      ],
    };
  });

  // Action badge opacity and scale calculations for smooth gesture reveal
  const keepBadgeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [20, screenWidth * 0.3],
      [0, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [20, screenWidth * 0.35],
      [0.85, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const deleteBadgeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-20, -screenWidth * 0.3],
      [0, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [-20, -screenWidth * 0.35],
      [0.85, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const compressBadgeStyle = useAnimatedStyle(() => {
    const isUpward = translateY.value < -20 && Math.abs(translateY.value) > Math.abs(translateX.value);
    const opacity = isUpward
      ? interpolate(
          translateY.value,
          [-20, -screenHeight * 0.22],
          [0, 1],
          Extrapolation.CLAMP
        )
      : 0;
    const scale = isUpward
      ? interpolate(
          translateY.value,
          [-20, -screenHeight * 0.22],
          [0.85, 1],
          Extrapolation.CLAMP
        )
      : 0.85;

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  if (!activeItem) {
    return null;
  }

  const savings = calculateEstimatedSavings(activeItem.sizeBytes);

  return (
    <View style={styles.deckContainer} pointerEvents="box-none">
      {/* CARD 3 (Bottom depth cue: 90% scale, 0.90 opacity, +24 offset) */}
      {thirdItem && (
        <View
          style={[
            styles.cardBase,
            styles.card3,
            { width: cardWidth, height: cardHeight },
          ]}
          accessible={false}
          importantForAccessibility="no"
        >
          {thirdItem.assetRef ? (
            <Image
              source={{ uri: thirdItem.assetRef }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardFallback} />
          )}
        </View>
      )}

      {/* CARD 2 (Middle depth cue: 95% scale, 0.95 opacity, +12 offset) */}
      {secondItem && (
        <View
          style={[
            styles.cardBase,
            styles.card2,
            { width: cardWidth, height: cardHeight },
          ]}
          accessible={false}
          importantForAccessibility="no"
        >
          {secondItem.assetRef ? (
            <Image
              source={{ uri: secondItem.assetRef }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardFallback} />
          )}
        </View>
      )}

      {/* CARD 1 (Top Active Card: 100% scale and full gesture interaction) */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.cardBase,
            styles.card1,
            { width: cardWidth, height: cardHeight },
            card1AnimatedStyle,
          ]}
          accessible={true}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Media item: ${activeItem.filename || activeItem.id}, size ${formatBytes(
            activeItem.sizeBytes
          )}, captured on ${formatDate(activeItem.capturedAt)}`}
          accessibilityHint="Swipe right to keep, swipe left to delete, swipe up to compress, or tap inspect"
          accessibilityActions={[
            { name: 'keep', label: 'Keep original resolution' },
            { name: 'compress', label: 'Compress staged copy' },
            { name: 'delete', label: 'Delete item' },
            { name: 'inspect', label: 'Inspect technical metadata' },
          ]}
          onAccessibilityAction={(event) => {
            switch (event.nativeEvent.actionName) {
              case 'keep':
                onDecision(activeItem, 'KEEP');
                break;
              case 'compress':
                onDecision(activeItem, 'COMPRESS');
                break;
              case 'delete':
                onDecision(activeItem, 'DELETE');
                break;
              case 'inspect':
                onInspect(activeItem);
                break;
            }
          }}
        >
          {/* Card Media Preview */}
          {activeItem.assetRef ? (
            <Image
              source={{ uri: activeItem.assetRef }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardFallback}>
              <Text style={styles.cardFallbackText}>
                {activeItem.mediaType === 'VIDEO' ? '▶ Video' : '◻ Photo'}
              </Text>
            </View>
          )}

          {/* Top Scrim & Metadata Overlay */}
          <View style={styles.topScrim}>
            <View style={styles.metaBadgeGroup}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>
                  {activeItem.mediaType === 'VIDEO'
                    ? `VIDEO ${formatDuration(activeItem.durationSeconds)}`
                    : 'PHOTO'}
                </Text>
              </View>

              {activeItem.isProtected && (
                <View style={styles.protectedBadge}>
                  <Text style={styles.protectedBadgeText}>🔒 PROTECTED</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.inspectIconButton}
              onPress={() => onInspect(activeItem)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Inspect item details"
              hitSlop={touchTargets.hitSlop12}
            >
              <Text style={styles.inspectIconText}>ⓘ</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Scrim & File Info */}
          <View style={styles.bottomScrim}>
            <View style={styles.fileInfo}>
              <Text style={styles.fileTitle} numberOfLines={1}>
                {activeItem.filename || activeItem.id}
              </Text>
              <Text style={styles.fileDetails}>
                {formatBytes(activeItem.sizeBytes)} •{' '}
                {formatDimensions(activeItem.width, activeItem.height)} •{' '}
                {formatDate(activeItem.capturedAt)}
              </Text>
            </View>
          </View>

          {/* Tri-Directional Gesture Badges */}
          {/* KEEP (Right Gesture Badge) */}
          <Animated.View
            style={[styles.gesturePill, styles.keepPill, keepBadgeStyle]}
            pointerEvents="none"
          >
            <Text style={styles.keepPillText}>✓ KEEP FULL RES</Text>
          </Animated.View>

          {/* DELETE (Left Gesture Badge) */}
          <Animated.View
            style={[styles.gesturePill, styles.deletePill, deleteBadgeStyle]}
            pointerEvents="none"
          >
            <Text style={styles.deletePillText}>✕ DELETE</Text>
          </Animated.View>

          {/* COMPRESS (Upward Gesture Badge) */}
          <Animated.View
            style={[styles.gesturePill, styles.compressPill, compressBadgeStyle]}
            pointerEvents="none"
          >
            <Text style={styles.compressPillText}>
              ⬇ COMPRESS {formatBytes(activeItem.sizeBytes)} ➔{' '}
              {formatBytes(savings.targetBytes)}
            </Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  deckContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minHeight: 380,
  },
  cardBase: {
    borderRadius: 8,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
    position: 'absolute',
  },
  card3: {
    transform: [{ scale: 0.92 }, { translateY: 16 }],
    opacity: 0.5,
    zIndex: 1,
    borderColor: '#1A1A1A',
  },
  card2: {
    transform: [{ scale: 0.96 }, { translateY: 8 }],
    opacity: 0.8,
    zIndex: 2,
    borderColor: '#1E1E1E',
  },
  card1: {
    transform: [{ scale: 1.0 }, { translateY: 0 }],
    opacity: 1.0,
    zIndex: 3,
    borderColor: '#2A2A2A',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  cardFallback: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFallbackText: {
    ...typography.bodyMedium,
    color: '#666666',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  typeBadge: {
    backgroundColor: '#161616',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    ...typography.labelBadge,
    fontSize: 10,
    color: '#D4D4D4',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    letterSpacing: 0.5,
  },
  protectedBadge: {
    backgroundColor: '#161616',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  protectedBadgeText: {
    ...typography.labelBadge,
    fontSize: 10,
    color: '#EAB308',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    letterSpacing: 0.5,
  },
  inspectIconButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectIconText: {
    color: '#D4D4D4',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#0D0D0D',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  fileInfo: {
    gap: 2,
  },
  fileTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: '#EDEDED',
    letterSpacing: 0.2,
  },
  fileDetails: {
    ...typography.labelSmall,
    color: '#888888',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  gesturePill: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#0A0A0A',
  },
  keepPill: {
    top: spacing.xl,
    right: spacing.md,
    borderColor: colors.textPrimary,
  },
  keepPillText: {
    ...typography.labelBadge,
    color: colors.textPrimary,
    fontSize: 13,
  },
  deletePill: {
    top: spacing.xl,
    left: spacing.md,
    borderColor: colors.textPrimary,
  },
  deletePillText: {
    ...typography.labelBadge,
    color: colors.textPrimary,
    fontSize: 13,
  },
  compressPill: {
    bottom: 80,
    alignSelf: 'center',
    borderColor: colors.textPrimary,
  },
  compressPillText: {
    ...typography.labelBadge,
    color: colors.textPrimary,
    fontSize: 12,
  },
});
