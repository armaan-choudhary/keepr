import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  colors,
  spacing,
  touchTargets,
  radii,
  typography,
  formatBytes,
  formatDate,
  formatTime,
  formatDimensions,
  formatDuration,
  calculateEstimatedSavings,
} from '../theme';
import { MediaItem, MediaAvailability, TriageDecision } from '../platform/contracts';

export interface InspectSheetProps {
  visible: boolean;
  item: MediaItem | null;
  availability?: MediaAvailability;
  onClose: () => void;
  onToggleProtect?: (item: MediaItem) => void;
  onDecision?: (item: MediaItem, decision: TriageDecision) => void;
}

export const InspectSheet: React.FC<InspectSheetProps> = ({
  visible,
  item,
  availability = 'availableOffline',
  onClose,
  onToggleProtect,
  onDecision,
}) => {
  if (!item) return null;

  const estimated = calculateEstimatedSavings(item.sizeBytes);

  const getAvailabilityInfo = (status: MediaAvailability) => {
    switch (status) {
      case 'availableOffline':
        return {
          label: 'Available Offline',
          description: 'On-device bytes ready for immediate local processing.',
          symbol: '●',
        };
      case 'requiresNetwork':
        return {
          label: 'iCloud / Remote Only',
          description: 'Asset is not stored locally. Network download required to process.',
          symbol: '▲',
        };
      case 'permissionRevoked':
        return {
          label: 'Access Revoked',
          description: 'App authorization to this media item was removed.',
          symbol: '✕',
        };
      case 'assetMissing':
        return {
          label: 'Asset Missing',
          description: 'Item cannot be located in device media storage.',
          symbol: '?',
        };
      default:
        return {
          label: 'Status Unknown',
          description: 'Verifying on-device availability.',
          symbol: '○',
        };
    }
  };

  const availInfo = getAvailabilityInfo(availability);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.scrimTouch}
          activeOpacity={1}
          onPress={onClose}
          accessible={true}
          accessibilityLabel="Close inspect details sheet"
          accessibilityRole="button"
        />

        <View
          style={styles.sheetContainer}
          accessible={true}
          accessibilityRole="none"
          accessibilityLabel="Media item technical inspection drawer"
        >
          {/* Header handle & Title */}
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerTitle} accessibilityRole="header">
                Media Details
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {item.filename || item.id}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Close inspector"
              hitSlop={touchTargets.hitSlop12}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollInner}
            showsVerticalScrollIndicator={false}
          >
            {/* Offline & Protection Status Cards */}
            <View style={styles.statusRow}>
              <View style={styles.statusCard}>
                <View style={styles.statusHeader}>
                  <Text style={styles.statusDot}>{availInfo.symbol}</Text>
                  <Text style={styles.statusTitle}>{availInfo.label}</Text>
                </View>
                <Text style={styles.statusDescription}>
                  {availInfo.description}
                </Text>
              </View>

              {/* Protection Toggle */}
              <TouchableOpacity
                style={[
                  styles.protectCard,
                  item.isProtected && styles.protectCardActive,
                ]}
                onPress={() => onToggleProtect?.(item)}
                accessible={true}
                accessibilityRole="switch"
                accessibilityState={{ checked: !!item.isProtected }}
                accessibilityLabel="Protect from deletion"
                accessibilityHint="Toggles Keepr-local protection override to prevent accidental deletion"
              >
                <Text style={styles.protectIcon}>
                  {item.isProtected ? '🔒' : '🔓'}
                </Text>
                <Text style={styles.protectTitle}>
                  {item.isProtected ? 'Protected' : 'Unprotected'}
                </Text>
                <Text style={styles.protectSubtext}>
                  {item.isProtected
                    ? 'Cannot be deleted in Keepr'
                    : 'Tap to safeguard'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Technical Metadata Table */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TECHNICAL SPECIFICATIONS</Text>

              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>Media Type</Text>
                  <Text style={styles.rowValue}>{item.mediaType}</Text>
                </View>

                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>File Size</Text>
                  <Text style={styles.rowValue}>{formatBytes(item.sizeBytes)}</Text>
                </View>

                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>Estimated After Compression</Text>
                  <Text style={styles.rowValueHighlight}>
                    {formatBytes(estimated.targetBytes)} (-{estimated.percent}%)
                  </Text>
                </View>

                {item.width && item.height ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowLabel}>Resolution</Text>
                    <Text style={styles.rowValue}>
                      {formatDimensions(item.width, item.height)}
                    </Text>
                  </View>
                ) : null}

                {item.durationSeconds !== undefined ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowLabel}>Duration</Text>
                    <Text style={styles.rowValue}>
                      {formatDuration(item.durationSeconds)}
                    </Text>
                  </View>
                ) : null}

                {item.mimeType ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowLabel}>MIME Type</Text>
                    <Text style={styles.rowValue}>{item.mimeType}</Text>
                  </View>
                ) : null}

                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>Captured Date</Text>
                  <Text style={styles.rowValue}>
                    {formatDate(item.capturedAt)}
                  </Text>
                </View>

                {item.capturedAt ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowLabel}>Captured Time</Text>
                    <Text style={styles.rowValue}>
                      {formatTime(item.capturedAt)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>Platform Ref</Text>
                  <Text
                    style={[styles.rowValue, styles.monoValue]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {item.assetRef}
                  </Text>
                </View>
              </View>
            </View>

            {/* In-drawer decision actions */}
            {onDecision && (
              <View style={styles.actionSection}>
                <Text style={styles.sectionTitle}>TRIAGE FROM INSPECTOR</Text>
                <View style={styles.actionButtonRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => {
                      onDecision(item, 'DELETE');
                      onClose();
                    }}
                    disabled={!!item.isProtected}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Delete item"
                  >
                    <Text
                      style={[
                        styles.actionBtnText,
                        item.isProtected && styles.disabledText,
                      ]}
                    >
                      Delete
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.compressBtn]}
                    onPress={() => {
                      onDecision(item, 'COMPRESS');
                      onClose();
                    }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Compress item"
                  >
                    <Text style={styles.actionBtnText}>Compress</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.keepBtn]}
                    onPress={() => {
                      onDecision(item, 'KEEP');
                      onClose();
                    }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Keep item"
                  >
                    <Text style={styles.actionBtnText}>Keep</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  scrimTouch: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.outline,
    maxHeight: '85%',
    paddingBottom: spacing.xxl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.outline,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  headerTextGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  headerTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    width: touchTargets.min,
    height: touchTargets.min,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: spacing.gutter,
  },
  scrollInner: {
    paddingVertical: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusCard: {
    flex: 2,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    color: colors.textPrimary,
    fontSize: 14,
    marginRight: spacing.xs,
  },
  statusTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  statusDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  protectCard: {
    flex: 1.2,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectCardActive: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.surfacePressed,
  },
  protectIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  protectTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  protectSubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.labelBadge,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  table: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    flex: 1,
  },
  rowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  rowValueHighlight: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  monoValue: {
    ...typography.mono,
    fontSize: 11,
  },
  actionSection: {
    marginTop: spacing.xs,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: touchTargets.min,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  deleteBtn: {
    backgroundColor: colors.surface,
  },
  compressBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.textSecondary,
  },
  keepBtn: {
    backgroundColor: colors.surface,
  },
  actionBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  disabledText: {
    color: colors.textDisabled,
  },
});
