import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, touchTargets, radii, typography, formatBytes } from '../theme';
import { MediaItem, TriageDecision } from '../platform/contracts';

export interface StagedDecisionRecord {
  item: MediaItem;
  decision: TriageDecision;
  timestamp: number;
}

export interface UndoBannerProps {
  lastDecision?: StagedDecisionRecord;
  undoCount: number;
  maxUndo?: number;
  onUndo: () => void;
  onDismiss?: () => void;
  visible?: boolean;
}

export const UndoBanner: React.FC<UndoBannerProps> = ({
  lastDecision,
  undoCount,
  maxUndo = 10,
  onUndo,
  onDismiss,
  visible = true,
}) => {
  if (!visible || undoCount <= 0 || !lastDecision) {
    return null;
  }

  const decisionLabel =
    lastDecision.decision === 'DELETE'
      ? 'Delete'
      : lastDecision.decision === 'COMPRESS'
      ? 'Compress'
      : 'Keep';

  const itemInfo =
    lastDecision.item.filename ||
    formatBytes(lastDecision.item.sizeBytes) ||
    lastDecision.item.id;

  const accessibleLabel = `Undo ${decisionLabel} for ${itemInfo}. ${undoCount} of ${maxUndo} actions can be undone.`;

  return (
    <View style={styles.floatingWrapper} pointerEvents="box-none">
      <View
        style={styles.bannerContainer}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel={accessibleLabel}
      >
        <TouchableOpacity
          style={styles.mainAction}
          onPress={onUndo}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Undo ${decisionLabel}`}
          accessibilityHint="Restores this media item back to the triage deck"
          hitSlop={touchTargets.hitSlop8}
          activeOpacity={0.7}
        >
          <Text style={styles.undoIcon}>↺</Text>
          <View style={styles.textContainer}>
            <Text style={styles.actionText}>
              Undo <Text style={styles.decisionHighlight}>{decisionLabel}</Text>
            </Text>
            <Text style={styles.itemSubtext} numberOfLines={1} ellipsizeMode="middle">
              {itemInfo}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.badgeContainer}>
          <Text style={styles.counterBadge}>
            {undoCount}/{maxUndo}
          </Text>
        </View>

        {onDismiss && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onDismiss}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Dismiss undo notification"
            hitSlop={touchTargets.hitSlop8}
          >
            <Text style={styles.dismissIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.gutter,
    right: spacing.gutter,
    alignItems: 'center',
    zIndex: 999,
  },
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.outline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: touchTargets.min,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    maxWidth: 420,
    width: '100%',
  },
  mainAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTargets.min,
  },
  undoIcon: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  actionText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  decisionHighlight: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  itemSubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  badgeContainer: {
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.outline,
    marginLeft: spacing.xs,
  },
  counterBadge: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
  },
  dismissButton: {
    marginLeft: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dismissIcon: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
