import React, { useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  touchTargets,
  radii,
  typography,
  formatBytes,
  formatDate,
  formatTime,
} from '../theme';
import { MediaItem, TriageDecision } from '../platform/contracts';
import { BeforeAfterCompare } from '../components/BeforeAfterCompare';
import { EmptyState } from '../components/EmptyState';

export interface DuplicateGroup {
  id: string;
  title: string;
  type: 'BURST' | 'SIMILAR' | 'EXACT';
  items: MediaItem[];
  bestItemId: string;
  totalSizeBytes: number;
}

export interface DuplicatesScreenProps {
  groups?: DuplicateGroup[];
  onStageDuplicateDecision?: (item: MediaItem, decision: TriageDecision) => void;
  onNavigateToCheckout?: () => void;
}

const SAMPLE_GROUPS: DuplicateGroup[] = [
  {
    id: 'grp-1',
    title: 'Burst Sequence (Oct 24, 2026)',
    type: 'BURST',
    bestItemId: 'dup-1',
    totalSizeBytes: 24800000, // ~23.6 MB
    items: [
      {
        id: 'dup-1',
        mediaType: 'IMAGE',
        assetRef: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800',
        sizeBytes: 8200000,
        capturedAt: Date.now() - 86400000 * 3,
        width: 3024,
        height: 4032,
        filename: 'BURST_001.JPG',
      },
      {
        id: 'dup-2',
        mediaType: 'IMAGE',
        assetRef: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800',
        sizeBytes: 8300000,
        capturedAt: Date.now() - 86400000 * 3 + 200,
        width: 3024,
        height: 4032,
        filename: 'BURST_002.JPG',
      },
      {
        id: 'dup-3',
        mediaType: 'IMAGE',
        assetRef: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800',
        sizeBytes: 8300000,
        capturedAt: Date.now() - 86400000 * 3 + 400,
        width: 3024,
        height: 4032,
        filename: 'BURST_003.JPG',
      },
    ],
  },
  {
    id: 'grp-2',
    title: 'Similar Sunset Shots (Oct 20, 2026)',
    type: 'SIMILAR',
    bestItemId: 'dup-4',
    totalSizeBytes: 14200000, // ~13.5 MB
    items: [
      {
        id: 'dup-4',
        mediaType: 'IMAGE',
        assetRef: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        sizeBytes: 7100000,
        capturedAt: Date.now() - 86400000 * 7,
        width: 3840,
        height: 2160,
        filename: 'SUNSET_A.JPG',
      },
      {
        id: 'dup-5',
        mediaType: 'IMAGE',
        assetRef: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800',
        sizeBytes: 7100000,
        capturedAt: Date.now() - 86400000 * 7 + 1500,
        width: 3840,
        height: 2160,
        filename: 'SUNSET_B.JPG',
      },
    ],
  },
];

export const DuplicatesScreen: React.FC<DuplicatesScreenProps> = ({
  groups: propGroups,
  onStageDuplicateDecision,
  onNavigateToCheckout,
}) => {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>(
    propGroups || SAMPLE_GROUPS
  );
  const [compareItems, setCompareItems] = useState<{
    original: MediaItem;
    candidateMedia: MediaItem;
  } | null>(null);

  // Set best shot in a group
  const handleSelectBest = (groupId: string, itemId: string) => {
    setDuplicateGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, bestItemId: itemId } : g))
    );
  };

  // Stage all non-best duplicates in a group for deletion
  const handleStageDeleteDuplicates = (group: DuplicateGroup) => {
    const duplicates = group.items.filter((i) => i.id !== group.bestItemId);
    for (const dup of duplicates) {
      onStageDuplicateDecision?.(dup, 'DELETE');
    }
    // Remove group after staging
    setDuplicateGroups((prev) => prev.filter((g) => g.id !== group.id));
  };

  // Stage all non-best duplicates for compression
  const handleStageCompressDuplicates = (group: DuplicateGroup) => {
    const duplicates = group.items.filter((i) => i.id !== group.bestItemId);
    for (const dup of duplicates) {
      onStageDuplicateDecision?.(dup, 'COMPRESS');
    }
    // Remove group after staging
    setDuplicateGroups((prev) => prev.filter((g) => g.id !== group.id));
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Duplicates & Bursts
            </Text>
            <Text style={styles.headerSubtitle}>
              User-guided review • Never automatically deleted
            </Text>
          </View>

          {duplicateGroups.length > 0 && onNavigateToCheckout && (
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={onNavigateToCheckout}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View staged checkout summary"
              hitSlop={touchTargets.hitSlop8}
            >
              <Text style={styles.checkoutBtnText}>Checkout</Text>
            </TouchableOpacity>
          )}
        </View>

        {duplicateGroups.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No Duplicate Groups"
            message="No duplicate photos or burst sequences found in your local library."
          />
        ) : (
          <FlatList
            data={duplicateGroups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: group }) => {
              const bestItem =
                group.items.find((i) => i.id === group.bestItemId) ||
                group.items[0];
              const duplicates = group.items.filter(
                (i) => i.id !== group.bestItemId
              );
              const duplicateBytes = duplicates.reduce(
                (acc, curr) => acc + curr.sizeBytes,
                0
              );

              return (
                <View
                  style={styles.groupCard}
                  accessible={true}
                  accessibilityLabel={`${group.title}, ${group.items.length} shots, reclaimable ${formatBytes(
                    duplicateBytes
                  )}`}
                >
                  {/* Group Header */}
                  <View style={styles.groupHeader}>
                    <View style={styles.groupBadge}>
                      <Text style={styles.groupBadgeText}>{group.type}</Text>
                    </View>
                    <Text style={styles.groupTitle} numberOfLines={1}>
                      {group.title}
                    </Text>
                    <Text style={styles.groupTotalSize}>
                      {formatBytes(group.totalSizeBytes)}
                    </Text>
                  </View>

                  {/* Thumbnail Row */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbScrollList}
                  >
                    {group.items.map((media) => {
                      const isBest = media.id === group.bestItemId;

                      return (
                        <TouchableOpacity
                          key={media.id}
                          style={[
                            styles.thumbWrapper,
                            isBest && styles.thumbWrapperBest,
                          ]}
                          onPress={() => handleSelectBest(group.id, media.id)}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={`${
                            isBest ? 'Selected best shot: ' : 'Duplicate shot: '
                          }${media.filename || media.id}`}
                          accessibilityHint="Tap to designate this as the best shot"
                        >
                          {media.assetRef ? (
                            <Image
                              source={{ uri: media.assetRef }}
                              style={styles.thumbImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.thumbFallback}>
                              <Text style={styles.thumbFallbackText}>◻</Text>
                            </View>
                          )}

                          {isBest && (
                            <View style={styles.bestPill}>
                              <Text style={styles.bestPillText}>★ BEST SHOT</Text>
                            </View>
                          )}

                          <View style={styles.thumbSizeBadge}>
                            <Text style={styles.thumbSizeText}>
                              {formatBytes(media.sizeBytes)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Group Action Footer */}
                  <View style={styles.groupActionFooter}>
                    <Text style={styles.actionPromptText}>
                      Keep Best Shot ({formatBytes(bestItem.sizeBytes)}) and:
                    </Text>

                    <View style={styles.actionBtnRow}>
                      <TouchableOpacity
                        style={[styles.groupActionBtn, styles.deleteActionBtn]}
                        onPress={() => handleStageDeleteDuplicates(group)}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${duplicates.length} duplicate shots, reclaiming ${formatBytes(
                          duplicateBytes
                        )}`}
                      >
                        <Text style={styles.actionBtnText}>
                          Delete {duplicates.length} Duplicates (-{formatBytes(duplicateBytes)})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.groupActionBtn, styles.compressActionBtn]}
                        onPress={() => handleStageCompressDuplicates(group)}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={`Compress ${duplicates.length} duplicate shots`}
                      >
                        <Text style={styles.actionBtnText}>
                          Compress {duplicates.length} Duplicates
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  checkoutBtn: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  checkoutBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  listContent: {
    padding: spacing.gutter,
    gap: spacing.md,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupBadge: {
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  groupBadgeText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: colors.textPrimary,
  },
  groupTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    flex: 1,
  },
  groupTotalSize: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  thumbScrollList: {
    gap: spacing.sm,
    paddingVertical: 4,
  },
  thumbWrapper: {
    width: 110,
    height: 140,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.outline,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceElevated,
  },
  thumbWrapperBest: {
    borderColor: colors.textPrimary,
    borderWidth: 2,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbFallbackText: {
    color: colors.textSecondary,
    fontSize: 24,
  },
  bestPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  bestPillText: {
    ...typography.labelBadge,
    fontSize: 8,
    color: colors.textPrimary,
  },
  thumbSizeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: radii.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  thumbSizeText: {
    ...typography.bodySmall,
    fontSize: 9,
    color: colors.textPrimary,
  },
  groupActionFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  actionPromptText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  groupActionBtn: {
    flex: 1,
    minHeight: touchTargets.min,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  deleteActionBtn: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.outline,
  },
  compressActionBtn: {
    backgroundColor: colors.surface,
  },
  actionBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
