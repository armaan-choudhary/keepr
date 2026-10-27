import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  AccessibilityRole,
} from 'react-native';
import { colors, spacing, touchTargets, radii, typography } from '../theme';

export interface ActionButtonsProps {
  onDelete: () => void;
  onCompress: () => void;
  onKeep: () => void;
  onUndo?: () => void;
  onInspect?: () => void;
  canUndo?: boolean;
  undoCount?: number;
  disabled?: boolean;
  compressEstimateLabel?: string;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onDelete,
  onCompress,
  onKeep,
  onUndo,
  onInspect,
  canUndo = false,
  undoCount = 0,
  disabled = false,
  compressEstimateLabel,
}) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Top row secondary utility actions: Undo & Inspect */}
      <View style={styles.utilityRow} pointerEvents="box-none">
        {onUndo && (
          <TouchableOpacity
            style={[
              styles.utilityButton,
              !canUndo && styles.utilityButtonDisabled,
            ]}
            onPress={onUndo}
            disabled={!canUndo || disabled}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Undo last triage decision${
              undoCount > 0 ? `, ${undoCount} available to undo` : ''
            }`}
            accessibilityHint="Reverses the most recent triage action back to the deck"
            hitSlop={touchTargets.hitSlop8}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.utilityIcon,
                !canUndo && styles.utilityTextDisabled,
              ]}
            >
              ↺
            </Text>
            <Text
              style={[
                styles.utilityLabel,
                !canUndo && styles.utilityTextDisabled,
              ]}
            >
              {undoCount > 0 ? `Undo (${undoCount})` : 'Undo'}
            </Text>
          </TouchableOpacity>
        )}

        {onInspect && (
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={onInspect}
            disabled={disabled}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Inspect photo details and metadata"
            accessibilityHint="Opens technical drawer with EXIF, dimensions, and offline state"
            hitSlop={touchTargets.hitSlop8}
            activeOpacity={0.7}
          >
            <Text style={styles.utilityIcon}>ⓘ</Text>
            <Text style={styles.utilityLabel}>Inspect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main 3-Action floating row: Delete, Compress, Keep in stable order */}
      <View
        style={styles.mainActionsRow}
        accessible={true}
        accessibilityRole="toolbar"
        accessibilityLabel="Triage action bar"
      >
        {/* DELETE (Left Action) */}
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={onDelete}
          disabled={disabled}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Delete item"
          accessibilityHint="Stages item to be trashed or deleted upon checkout"
          activeOpacity={0.75}
        >
          <View style={styles.buttonInner}>
            <Text style={styles.actionIcon}>✕</Text>
            <Text style={styles.actionLabel}>Delete</Text>
          </View>
        </TouchableOpacity>

        {/* COMPRESS (Center / Upward Action) */}
        <TouchableOpacity
          style={[styles.actionButton, styles.compressButton]}
          onPress={onCompress}
          disabled={disabled}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Compress item"
          accessibilityHint="Stages item for quality-preserving compression"
          activeOpacity={0.75}
        >
          <View style={styles.buttonInner}>
            <Text style={styles.actionIcon}>⬇</Text>
            <Text style={styles.actionLabel}>Compress</Text>
            {compressEstimateLabel ? (
              <Text style={styles.compressSubtext} numberOfLines={1}>
                {compressEstimateLabel}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {/* KEEP (Right Action) */}
        <TouchableOpacity
          style={[styles.actionButton, styles.keepButton]}
          onPress={onKeep}
          disabled={disabled}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Keep item full resolution"
          accessibilityHint="Marks item to keep at original resolution"
          activeOpacity={0.75}
        >
          <View style={styles.buttonInner}>
            <Text style={styles.actionIcon}>✓</Text>
            <Text style={styles.actionLabel}>Keep</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  utilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: spacing.md,
    backgroundColor: '#121212',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#242424',
  },
  utilityButtonDisabled: {
    opacity: 0.35,
    backgroundColor: '#0D0D0D',
    borderColor: '#1A1A1A',
  },
  utilityIcon: {
    color: '#D4D4D4',
    fontSize: 14,
    marginRight: spacing.xs,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontWeight: '700',
  },
  utilityLabel: {
    ...typography.labelSmall,
    color: '#D4D4D4',
    letterSpacing: 0.3,
  },
  utilityTextDisabled: {
    color: '#555555',
  },
  mainActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: radii.sm,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: '#131111',
    borderColor: '#281E1E',
  },
  compressButton: {
    flex: 1.25,
    backgroundColor: '#111418',
    borderColor: '#1E2633',
  },
  keepButton: {
    backgroundColor: '#111613',
    borderColor: '#1E2B22',
  },
  actionIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  actionLabel: {
    ...typography.labelMedium,
    color: '#F5F5F5',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  compressSubtext: {
    ...typography.labelSmall,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    color: '#7AA2F7',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
});
