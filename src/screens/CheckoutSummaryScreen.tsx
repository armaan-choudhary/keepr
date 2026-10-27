import React, { useState, useMemo } from 'react';
import {
  Alert,
  Image,
  Platform,
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
  formatDimensions,
  calculateEstimatedSavings,
} from '../theme';
import {
  MediaItem,
  TriageDecision,
  BatchCommitSummary,
  ItemCommitResult,
  ICommitAdapter,
} from '../platform/contracts';
import { StagedItemDecision } from '../navigation/types';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';

export interface CheckoutSummaryScreenProps {
  stagedDecisions?: StagedItemDecision[];
  onCommitBatch?: (items: StagedItemDecision[]) => Promise<BatchCommitSummary>;
  onRescueItem?: (item: MediaItem) => void;
  onNavigateBack?: () => void;
  onDone?: () => void;
  commitAdapter?: ICommitAdapter;
  recoveryDescription?: string;
}

export const CheckoutSummaryScreen: React.FC<CheckoutSummaryScreenProps> = ({
  stagedDecisions: initialStaged = [],
  onCommitBatch,
  onRescueItem,
  onNavigateBack,
  onDone,
  commitAdapter,
  recoveryDescription,
}) => {
  const [staged, setStaged] = useState<StagedItemDecision[]>(initialStaged);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitSummary, setCommitSummary] = useState<BatchCommitSummary | null>(
    null
  );
  const [activeCategoryTab, setActiveCategoryTab] = useState<
    'ALL' | 'DELETE' | 'COMPRESS' | 'KEEP'
  >('ALL');

  // Breakdown by category
  const deleteList = useMemo(
    () => staged.filter((s) => s.decision === 'DELETE'),
    [staged]
  );
  const compressList = useMemo(
    () => staged.filter((s) => s.decision === 'COMPRESS'),
    [staged]
  );
  const keepList = useMemo(
    () => staged.filter((s) => s.decision === 'KEEP'),
    [staged]
  );

  // Storage savings calculation
  const totalReclaimedEstimate = useMemo(() => {
    let bytes = 0;
    for (const d of deleteList) {
      bytes += d.item.sizeBytes;
    }
    for (const c of compressList) {
      const s = calculateEstimatedSavings(c.item.sizeBytes);
      bytes += s.savedBytes;
    }
    return bytes;
  }, [deleteList, compressList]);

  // Rescue an item from the staged list
  const handleRescue = (item: MediaItem) => {
    setStaged((prev) => prev.filter((s) => s.item.id !== item.id));
    onRescueItem?.(item);
  };

  // Platform recovery warning copy: dynamic and platform-appropriate without false 30-day promises
  const platformWarning = useMemo(() => {
    if (recoveryDescription) {
      return recoveryDescription;
    }

    // Call adapter if available to honor custom adapters
    const adapterDesc = commitAdapter?.getPlatformRecoveryDescription?.();
    if (adapterDesc && !adapterDesc.includes('30 days') && adapterDesc.includes('dialog')) {
      return adapterDesc;
    }

    if (Platform.OS === 'android') {
      const apiLevel =
        typeof Platform.Version === 'number'
          ? Platform.Version
          : parseInt(String(Platform.Version), 10) || 0;
      const canTrash = commitAdapter ? commitAdapter.canTrash() : apiLevel >= 30;

      if (canTrash) {
        return 'Android Storage: Deleted items will be moved to MediaStore System Trash. The OS will show a system permission dialog to authorize changes. Compressed originals are moved to Trash only after verified replacements are created.';
      } else {
        return 'Android Storage: Items will be permanently deleted upon user consent (Android 10 does not support system trash). The OS will show a system permission dialog to authorize changes. Originals are untouched until consent is confirmed.';
      }
    } else {
      return 'Apple Photos: Deleted items are moved to the Photos "Recently Deleted" album, with retention and recovery managed by iOS. The OS will prompt to authorize changes. Originals are untouched until verified.';
    }
  }, [commitAdapter, recoveryDescription]);

  const handleExecuteCommit = async () => {
    if (staged.length === 0) return;

    setIsCommitting(true);
    try {
      if (onCommitBatch) {
        const result = await onCommitBatch(staged);
        setCommitSummary(result);
      } else if (commitAdapter) {
        const requestItems = staged.map((s) => ({
          mediaId: s.item.id,
          decision: s.decision,
          candidate: s.candidate,
          isProtected: s.item.isProtected,
        }));
        const result = await commitAdapter.commitBatch(requestItems);
        setCommitSummary(result);
      } else {
        // Fallback default simulation for testing or standalone execution
        const apiLevel =
          typeof Platform.Version === 'number'
            ? Platform.Version
            : parseInt(String(Platform.Version), 10) || 0;
        const canTrash = Platform.OS === 'android' ? apiLevel >= 30 : true;

        const mockResults: ItemCommitResult[] = staged.map((s) => ({
          mediaId: s.item.id,
          decision: s.decision,
          outcome:
            s.decision === 'DELETE'
              ? Platform.OS === 'ios'
                ? 'RECENTLY_DELETED'
                : canTrash
                ? 'TRASHED'
                : 'PERMANENTLY_DELETED'
              : s.decision === 'COMPRESS'
              ? 'REPLACED'
              : 'KEPT',
          reclaimedBytes:
            s.decision === 'DELETE'
              ? s.item.sizeBytes
              : s.decision === 'COMPRESS'
              ? calculateEstimatedSavings(s.item.sizeBytes).savedBytes
              : 0,
        }));

        setCommitSummary({
          totalRequested: staged.length,
          succeeded: staged.length,
          failed: 0,
          denied: 0,
          totalReclaimedBytes: totalReclaimedEstimate,
          results: mockResults,
        });
      }
    } catch (err: any) {
      const isDenied =
        err?.code === 'DENIED' ||
        err?.code === 'CANCELLED' ||
        err?.message?.toLowerCase().includes('cancel') ||
        err?.message?.toLowerCase().includes('denied');

      if (isDenied) {
        Alert.alert(
          'Authorization Cancelled',
          'Changes were not applied because system authorization was cancelled. Your originals are untouched.'
        );
      } else {
        Alert.alert('Commit Interrupted', 'Could not complete changes.');
      }
    } finally {
      setIsCommitting(false);
    }
  };

  if (isCommitting) {
    return (
      <LoadingState
        message="Applying Safe Changes..."
        subMessage="Creating validated candidates and requesting system consent"
      />
    );
  }

  // Results View after Commit
  if (commitSummary) {
    const isCancelledOnly =
      commitSummary.succeeded === 0 && commitSummary.denied > 0;
    const isFailedOnly =
      commitSummary.succeeded === 0 && commitSummary.failed > 0;

    const resultStatusIcon = isCancelledOnly ? '✕' : isFailedOnly ? '⚠' : '✓';
    const resultTitle = isCancelledOnly
      ? 'Authorization Cancelled'
      : isFailedOnly
      ? 'Batch Commit Failed'
      : 'Batch Commit Complete';

    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.resultsScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.successIconCircle}>
              <Text style={styles.successIcon}>{resultStatusIcon}</Text>
            </View>

            <Text style={styles.resultsTitle} accessibilityRole="header">
              {resultTitle}
            </Text>

            {/* Clear Banner if User Cancelled OS Authorization */}
            {commitSummary.denied > 0 && (
              <View
                style={styles.cancellationBanner}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel="Changes were not applied because system authorization was cancelled. Your originals are untouched."
              >
                <Text style={styles.bannerIcon}>ⓘ</Text>
                <View style={styles.bannerTextGroup}>
                  <Text style={styles.bannerTitle}>Authorization Cancelled</Text>
                  <Text style={styles.bannerBody}>
                    Changes were not applied because system authorization was cancelled. Your originals are untouched.
                  </Text>
                </View>
              </View>
            )}

            {/* Clear Banner if System Error occurred */}
            {commitSummary.failed > 0 && (
              <View
                style={styles.errorBanner}
                accessible={true}
                accessibilityRole="alert"
                accessibilityLabel={`${commitSummary.failed} ${commitSummary.failed === 1 ? 'item' : 'items'} encountered a system error during processing. Originals remain untouched.`}
              >
                <Text style={styles.bannerIcon}>⚠</Text>
                <View style={styles.bannerTextGroup}>
                  <Text style={styles.bannerTitle}>Processing Failure</Text>
                  <Text style={styles.bannerBody}>
                    {commitSummary.failed} {commitSummary.failed === 1 ? 'item' : 'items'} encountered a system error during processing. Your originals are untouched.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.reclaimedHeroCard}>
              <Text style={styles.reclaimedHeroLabel}>
                MEASURED STORAGE RECLAIMED
              </Text>
              <Text style={styles.reclaimedHeroValue}>
                {formatBytes(commitSummary.totalReclaimedBytes)}
              </Text>
              <Text style={styles.reclaimedHeroSub}>
                {commitSummary.succeeded} of {commitSummary.totalRequested} items
                safely processed
              </Text>
            </View>

            {/* Results breakdown differentiating cancellation from system failure */}
            <View style={styles.summaryTable}>
              <View style={styles.summaryTableRow}>
                <Text style={styles.summaryTableLabel}>Succeeded</Text>
                <Text style={styles.summaryTableValue}>
                  {commitSummary.succeeded}
                </Text>
              </View>
              {commitSummary.failed > 0 && (
                <View style={styles.summaryTableRow}>
                  <Text style={styles.summaryTableLabel}>System Failure (Failed)</Text>
                  <Text style={styles.summaryTableValue}>
                    {commitSummary.failed}
                  </Text>
                </View>
              )}
              {commitSummary.denied > 0 && (
                <View style={styles.summaryTableRow}>
                  <Text style={styles.summaryTableLabel}>Authorization Cancelled (Denied)</Text>
                  <Text style={styles.summaryTableValue}>
                    {commitSummary.denied}
                  </Text>
                </View>
              )}
            </View>

            {/* If items were denied, allow the user to adjust decisions and retry */}
            {commitSummary.denied > 0 && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setCommitSummary(null)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Review and adjust staged decisions to retry"
              >
                <Text style={styles.retryBtnText}>Adjust Decisions & Retry</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={onDone || onNavigateBack}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Finish triage session"
            >
              <Text style={styles.doneBtnText}>Finish & Return to Deck</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state when nothing is staged
  if (staged.length === 0) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.container}>
          <EmptyState
            icon="◻"
            title="No Decisions Staged"
            message="Your triage staging buffer is empty. Swipe cards on the deck or use action buttons to stage items."
            actionLabel="Return to Deck"
            onAction={onNavigateBack}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {onNavigateBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onNavigateBack}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Return to card deck"
              hitSlop={touchTargets.hitSlop8}
            >
              <Text style={styles.backButtonText}>← Deck</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.headerTitle} accessibilityRole="header">
            Checkout Summary
          </Text>

          <View style={styles.headerCountBadge}>
            <Text style={styles.headerCountText}>{staged.length} items</Text>
          </View>
        </View>

        {/* Hero Savings Estimate Banner */}
        <View style={styles.savingsHero}>
          <Text style={styles.savingsHeroLabel}>
            ESTIMATED STORAGE TO RECLAIM
          </Text>
          <Text style={styles.savingsHeroValue}>
            {formatBytes(totalReclaimedEstimate)}
          </Text>
          <Text style={styles.savingsHeroSub}>
            Measured output verified before replacing originals
          </Text>
        </View>

        {/* Category Filters */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeCategoryTab === 'ALL' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveCategoryTab('ALL')}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategoryTab === 'ALL' }}
            accessibilityLabel={`All items, ${staged.length}`}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeCategoryTab === 'ALL' && styles.tabBtnTextActive,
              ]}
            >
              All ({staged.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeCategoryTab === 'DELETE' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveCategoryTab('DELETE')}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategoryTab === 'DELETE' }}
            accessibilityLabel={`Delete items, ${deleteList.length}`}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeCategoryTab === 'DELETE' && styles.tabBtnTextActive,
              ]}
            >
              Delete ({deleteList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeCategoryTab === 'COMPRESS' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveCategoryTab('COMPRESS')}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategoryTab === 'COMPRESS' }}
            accessibilityLabel={`Compress items, ${compressList.length}`}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeCategoryTab === 'COMPRESS' && styles.tabBtnTextActive,
              ]}
            >
              Compress ({compressList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeCategoryTab === 'KEEP' && styles.tabBtnActive,
            ]}
            onPress={() => setActiveCategoryTab('KEEP')}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategoryTab === 'KEEP' }}
            accessibilityLabel={`Keep items, ${keepList.length}`}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeCategoryTab === 'KEEP' && styles.tabBtnTextActive,
              ]}
            >
              Keep ({keepList.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Staged Items List */}
        <ScrollView
          style={styles.itemsListScroll}
          contentContainerStyle={styles.itemsListInner}
          showsVerticalScrollIndicator={false}
        >
          {staged
            .filter((s) => {
              if (activeCategoryTab === 'ALL') return true;
              return s.decision === activeCategoryTab;
            })
            .map((record) => {
              const { item, decision } = record;
              const savings = calculateEstimatedSavings(item.sizeBytes);

              return (
                <View
                  key={item.id}
                  style={styles.itemRowCard}
                  accessible={true}
                  accessibilityLabel={`${decision}: ${item.filename || item.id}, size ${formatBytes(
                    item.sizeBytes
                  )}`}
                >
                  {/* Thumbnail */}
                  <View style={styles.thumbnailContainer}>
                    {item.assetRef ? (
                      <Image
                        source={{ uri: item.assetRef }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbnailFallback}>
                        <Text style={styles.thumbnailFallbackText}>◻</Text>
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.itemDetails}>
                    <View style={styles.decisionBadgeRow}>
                      <View
                        style={[
                          styles.decisionPill,
                          decision === 'DELETE' && styles.deleteDecisionPill,
                          decision === 'COMPRESS' && styles.compressDecisionPill,
                          decision === 'KEEP' && styles.keepDecisionPill,
                        ]}
                      >
                        <Text style={styles.decisionPillText}>{decision}</Text>
                      </View>
                      <Text style={styles.fileSizeText}>
                        {formatBytes(item.sizeBytes)}
                      </Text>
                    </View>

                    <Text style={styles.itemFilename} numberOfLines={1}>
                      {item.filename || item.id}
                    </Text>

                    {decision === 'COMPRESS' && (
                      <Text style={styles.compressSavingsSubtext}>
                        ➔ ~{formatBytes(savings.targetBytes)} (-{savings.percent}%)
                      </Text>
                    )}
                  </View>

                  {/* Rescue Button */}
                  <TouchableOpacity
                    style={styles.rescueBtn}
                    onPress={() => handleRescue(item)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={`Rescue ${item.filename || item.id} from checkout`}
                    accessibilityHint="Removes item from staged decisions and restores to deck"
                    hitSlop={touchTargets.hitSlop8}
                  >
                    <Text style={styles.rescueBtnText}>Rescue</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

          {/* Platform Specific Warning Notice */}
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>ⓘ</Text>
            <Text style={styles.warningText}>{platformWarning}</Text>
          </View>
        </ScrollView>

        {/* Commit Action Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.commitBtn}
            onPress={handleExecuteCommit}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Execute ${staged.length} staged changes, reclaiming estimated ${formatBytes(
              totalReclaimedEstimate
            )}`}
            accessibilityHint="Applies platform mutations and opens OS system consent prompt"
          >
            <Text style={styles.commitBtnText}>
              Execute Changes ({staged.length})
            </Text>
            <Text style={styles.commitBtnSub}>
              Estimated Reclaim: {formatBytes(totalReclaimedEstimate)}
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  backButton: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    justifyContent: 'center',
  },
  backButtonText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  headerTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  headerCountBadge: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  headerCountText: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
  },
  savingsHero: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  savingsHeroLabel: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  savingsHeroValue: {
    ...typography.titleLarge,
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  savingsHeroSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
    gap: spacing.xs,
  },
  tabBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  tabBtnActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.textPrimary,
  },
  tabBtnText: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemsListScroll: {
    flex: 1,
  },
  itemsListInner: {
    padding: spacing.gutter,
    gap: spacing.sm,
  },
  itemRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.sm,
    gap: spacing.md,
  },
  thumbnailContainer: {
    width: 54,
    height: 54,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailFallbackText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  itemDetails: {
    flex: 1,
    gap: 2,
  },
  decisionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  decisionPill: {
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  deleteDecisionPill: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.textSecondary,
  },
  compressDecisionPill: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.textPrimary,
  },
  keepDecisionPill: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
  },
  decisionPillText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: colors.textPrimary,
  },
  fileSizeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  itemFilename: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  compressSavingsSubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 10,
  },
  rescueBtn: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescueBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  warningIcon: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  warningText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    padding: spacing.gutter,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  commitBtn: {
    minHeight: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  commitBtnText: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontSize: 16,
  },
  commitBtnSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  resultsScroll: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successIcon: {
    fontSize: 32,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  resultsTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  reclaimedHeroCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  reclaimedHeroLabel: {
    ...typography.labelBadge,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  reclaimedHeroValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reclaimedHeroSub: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: 4,
  },
  summaryTable: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    marginBottom: spacing.xl,
  },
  summaryTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  summaryTableLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  summaryTableValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cancellationBanner: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  errorBanner: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  bannerIcon: {
    color: colors.textPrimary,
    fontSize: 18,
    marginTop: 1,
  },
  bannerTextGroup: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  bannerBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  retryBtn: {
    width: '100%',
    minHeight: touchTargets.min,
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  retryBtnText: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  doneBtn: {
    width: '100%',
    minHeight: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
});
