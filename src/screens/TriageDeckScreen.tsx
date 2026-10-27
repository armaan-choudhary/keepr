import React, { useState, useCallback, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  touchTargets,
  radii,
  typography,
  formatBytes,
  calculateEstimatedSavings,
} from '../theme';
import {
  MediaItem,
  TriageDecision,
  LibraryAuthorizationState,
  MediaAvailability,
  CompressionCandidate,
} from '../platform/contracts';
import {
  CardDeck,
  ActionButtons,
  UndoBanner,
  InspectSheet,
  BeforeAfterCompare,
  PermissionGate,
  EmptyState,
  LoadingState,
  StagedDecisionRecord,
} from '../components';
import { StagedItemDecision } from '../navigation/types';

export type QueueType =
  | 'SCREENSHOTS'
  | 'HEAVY'
  | 'MESSAGING'
  | 'ON_THIS_DAY'
  | 'MONTHLY';

export interface QueueOption {
  id: QueueType;
  label: string;
  badge: string;
  description: string;
}

export const QUEUE_OPTIONS: QueueOption[] = [
  {
    id: 'SCREENSHOTS',
    label: 'Old Screenshots',
    badge: 'Screenshots',
    description: 'Screenshots older than 30 days',
  },
  {
    id: 'HEAVY',
    label: 'Heavy Hitters',
    badge: '> 25 MB',
    description: 'Large video files and high-res RAWs',
  },
  {
    id: 'MESSAGING',
    label: 'Messaging Media',
    badge: 'WhatsApp/Telegram',
    description: 'Saved images and clips from chat apps',
  },
  {
    id: 'ON_THIS_DAY',
    label: 'On This Day',
    badge: 'Anniversary',
    description: 'Photos taken on this day in past years',
  },
  {
    id: 'MONTHLY',
    label: 'Month by Month',
    badge: 'Chronological',
    description: 'Systematic chronological sweep',
  },
];

export interface TriageDeckScreenProps {
  initialQueue?: QueueType;
  items?: MediaItem[];
  authState?: LibraryAuthorizationState;
  onRequestPermission?: () => void;
  onOpenSettings?: () => void;
  onNavigateToCheckout?: (staged: StagedItemDecision[]) => void;
  onNavigateToDuplicates?: () => void;
}

// Default fallback items for testing or initial state when no items provided
const SAMPLE_ITEMS: MediaItem[] = [
  {
    id: 'item-1',
    mediaType: 'IMAGE',
    assetRef: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800',
    sizeBytes: 7120000, // 6.8 MB
    capturedAt: Date.now() - 86400000 * 45,
    width: 3024,
    height: 4032,
    filename: 'IMG_4821_SCREENSHOT.PNG',
    mimeType: 'image/png',
    isFavorite: false,
    isProtected: false,
  },
  {
    id: 'item-2',
    mediaType: 'VIDEO',
    assetRef: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
    sizeBytes: 48500000, // 46.2 MB
    capturedAt: Date.now() - 86400000 * 20,
    width: 1920,
    height: 1080,
    durationSeconds: 38,
    filename: 'VID_20261012_HEAVY.MP4',
    mimeType: 'video/mp4',
    isFavorite: true,
    isProtected: false,
  },
  {
    id: 'item-3',
    mediaType: 'IMAGE',
    assetRef: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800',
    sizeBytes: 5400000, // 5.1 MB
    capturedAt: Date.now() - 86400000 * 12,
    width: 2400,
    height: 3200,
    filename: 'WA_20261015_MEME.JPG',
    mimeType: 'image/jpeg',
    isFavorite: false,
    isProtected: false,
  },
];

export const TriageDeckScreen: React.FC<TriageDeckScreenProps> = ({
  initialQueue = 'SCREENSHOTS',
  items: propItems,
  authState = {
    status: 'authorized',
    scope: 'full',
    canSelectMore: false,
  },
  onRequestPermission = () => {},
  onOpenSettings = () => {},
  onNavigateToCheckout,
  onNavigateToDuplicates,
}) => {
  const [selectedQueue, setSelectedQueue] = useState<QueueType>(initialQueue);
  const [deckItems, setDeckItems] = useState<MediaItem[]>(
    propItems && propItems.length > 0 ? propItems : SAMPLE_ITEMS
  );
  const [stagedDecisions, setStagedDecisions] = useState<StagedItemDecision[]>([]);
  const [undoStack, setUndoStack] = useState<StagedDecisionRecord[]>([]);
  const [inspectItem, setInspectItem] = useState<MediaItem | null>(null);
  const [inspectAvailability, setInspectAvailability] = useState<MediaAvailability>(
    'availableOffline'
  );
  const [compareOriginal, setCompareOriginal] = useState<MediaItem | null>(null);
  const [compareCandidate, setCompareCandidate] = useState<CompressionCandidate | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Active top item
  const currentItem = deckItems[0] || null;

  // Staged metrics
  const stagedSummary = useMemo(() => {
    let count = stagedDecisions.length;
    let deleteCount = 0;
    let compressCount = 0;
    let keepCount = 0;
    let estimatedSavingsBytes = 0;

    for (const d of stagedDecisions) {
      if (d.decision === 'DELETE') {
        deleteCount++;
        estimatedSavingsBytes += d.item.sizeBytes;
      } else if (d.decision === 'COMPRESS') {
        compressCount++;
        const s = calculateEstimatedSavings(d.item.sizeBytes);
        estimatedSavingsBytes += s.savedBytes;
      } else {
        keepCount++;
      }
    }

    return {
      count,
      deleteCount,
      compressCount,
      keepCount,
      estimatedSavingsBytes,
    };
  }, [stagedDecisions]);

  // Handle decision from CardDeck or ActionButtons
  const handleDecision = useCallback(
    (item: MediaItem, decision: TriageDecision) => {
      // Safety rule: Protected items cannot be deleted
      if (decision === 'DELETE' && item.isProtected) {
        return;
      }

      // 1. Remove from active deck
      setDeckItems((prev) => prev.filter((i) => i.id !== item.id));

      // 2. Stage decision
      const stagedRecord: StagedItemDecision = {
        item,
        decision,
        timestamp: Date.now(),
      };
      setStagedDecisions((prev) => [...prev, stagedRecord]);

      // 3. Push to undo buffer (bounded to 10 items)
      setUndoStack((prev) => {
        const next = [stagedRecord, ...prev];
        return next.slice(0, 10);
      });
    },
    []
  );

  // Undo most recent decision (up to 10)
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const [lastAction, ...remainingStack] = undoStack;
    setUndoStack(remainingStack);

    // Remove from staged decisions
    setStagedDecisions((prev) =>
      prev.filter(
        (d) => !(d.item.id === lastAction.item.id && d.timestamp === lastAction.timestamp)
      )
    );

    // Place item back on top of deck
    setDeckItems((prev) => [lastAction.item, ...prev]);
  }, [undoStack]);

  // Toggle item protection
  const handleToggleProtect = useCallback((item: MediaItem) => {
    const updated = { ...item, isProtected: !item.isProtected };
    setDeckItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    if (inspectItem?.id === item.id) {
      setInspectItem(updated);
    }
  }, [inspectItem]);

  // Check permission gating
  if (authState.status !== 'authorized') {
    return (
      <PermissionGate
        authState={authState}
        itemCount={deckItems.length}
        onRequestPermission={onRequestPermission}
        onOpenSettings={onOpenSettings}
        onContinueLimited={() => {}}
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Scanning media queue..." />;
  }

  const compressSavingsLabel = currentItem
    ? `${formatBytes(calculateEstimatedSavings(currentItem.sizeBytes).targetBytes)} (-85%)`
    : undefined;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.titleGroup}>
            <Text style={styles.appTitle} accessibilityRole="header">
              KEEPR
            </Text>
            <View style={styles.offlineTag}>
              <Text style={styles.offlineTagText}>● ON-DEVICE</Text>
            </View>
          </View>

          {/* Staged review CTA button */}
          {stagedSummary.count > 0 && (
            <TouchableOpacity
              style={styles.reviewStagedButton}
              onPress={() => onNavigateToCheckout?.(stagedDecisions)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={`Review ${stagedSummary.count} staged decisions. Estimated savings ${formatBytes(
                stagedSummary.estimatedSavingsBytes
              )}`}
              hitSlop={touchTargets.hitSlop8}
            >
              <Text style={styles.reviewStagedBadge}>
                {stagedSummary.count}
              </Text>
              <Text style={styles.reviewStagedText}>Review</Text>
              <Text style={styles.reviewStagedSavings}>
                {formatBytes(stagedSummary.estimatedSavingsBytes)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Queue Category Selector */}
        <View style={styles.queueSelectorContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.queueScrollList}
            accessible={true}
            accessibilityRole="tablist"
            accessibilityLabel="Queue categories"
          >
            {QUEUE_OPTIONS.map((q) => {
              const isSelected = selectedQueue === q.id;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={[
                    styles.queuePill,
                    isSelected && styles.queuePillActive,
                  ]}
                  onPress={() => setSelectedQueue(q.id)}
                  accessible={true}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${q.label}, ${q.description}`}
                  hitSlop={touchTargets.hitSlop8}
                >
                  <Text
                    style={[
                      styles.queuePillText,
                      isSelected && styles.queuePillTextActive,
                    ]}
                  >
                    {q.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Content: Card Deck or Empty State */}
        <View style={styles.deckArea}>
          {deckItems.length > 0 ? (
            <CardDeck
              items={deckItems}
              onDecision={handleDecision}
              onInspect={(item) => {
                setInspectItem(item);
                setInspectAvailability('availableOffline');
              }}
              onUndo={handleUndo}
              canUndo={undoStack.length > 0}
            />
          ) : (
            <EmptyState
              icon="✓"
              title="Queue Reviewed!"
              message="You have reviewed all available items in this queue. Proceed to checkout to review staged actions."
              actionLabel={
                stagedSummary.count > 0
                  ? `Review Staged Changes (${stagedSummary.count})`
                  : 'Check Other Queues'
              }
              onAction={() => {
                if (stagedSummary.count > 0) {
                  onNavigateToCheckout?.(stagedDecisions);
                } else {
                  setSelectedQueue('HEAVY');
                }
              }}
              secondaryActionLabel={
                onNavigateToDuplicates ? 'Inspect Duplicates' : undefined
              }
              onSecondaryAction={onNavigateToDuplicates}
            />
          )}

          {/* Floating Undo Banner */}
          {undoStack.length > 0 && (
            <UndoBanner
              lastDecision={undoStack[0]}
              undoCount={undoStack.length}
              maxUndo={10}
              onUndo={handleUndo}
              onDismiss={() => setUndoStack([])}
            />
          )}
        </View>

        {/* Action Buttons (Delete, Compress, Keep, Undo, Inspect) */}
        {deckItems.length > 0 && currentItem && (
          <ActionButtons
            onDelete={() => handleDecision(currentItem, 'DELETE')}
            onCompress={() => handleDecision(currentItem, 'COMPRESS')}
            onKeep={() => handleDecision(currentItem, 'KEEP')}
            onUndo={handleUndo}
            onInspect={() => {
              setInspectItem(currentItem);
              setInspectAvailability('availableOffline');
            }}
            canUndo={undoStack.length > 0}
            undoCount={undoStack.length}
            disabled={!currentItem}
            compressEstimateLabel={compressSavingsLabel}
          />
        )}

        {/* Inspect Sheet Modal */}
        <InspectSheet
          visible={inspectItem !== null}
          item={inspectItem}
          availability={inspectAvailability}
          onClose={() => setInspectItem(null)}
          onToggleProtect={handleToggleProtect}
          onDecision={(item, decision) => {
            handleDecision(item, decision);
            setInspectItem(null);
          }}
        />

        {/* Before / After Quality Compare Modal */}
        <BeforeAfterCompare
          visible={compareOriginal !== null}
          original={compareOriginal}
          candidate={compareCandidate}
          onClose={() => {
            setCompareOriginal(null);
            setCompareCandidate(null);
          }}
          onConfirmCompress={(cand) => {
            if (compareOriginal) {
              handleDecision(compareOriginal, 'COMPRESS');
            }
          }}
          onKeepOriginal={(orig) => {
            handleDecision(orig, 'KEEP');
          }}
        />
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appTitle: {
    ...typography.titleLarge,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2.0,
    color: '#FFFFFF',
  },
  offlineTag: {
    backgroundColor: '#141414',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#262626',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  offlineTagText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: '#888888',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    letterSpacing: 0.5,
  },
  reviewStagedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#383838',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    gap: spacing.xs,
  },
  reviewStagedBadge: {
    ...typography.labelBadge,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  reviewStagedText: {
    ...typography.labelMedium,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  reviewStagedSavings: {
    ...typography.labelSmall,
    color: '#10B981',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  queueSelectorContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    paddingBottom: spacing.xs,
  },
  queueScrollList: {
    paddingHorizontal: spacing.gutter,
    gap: spacing.sm,
  },
  queuePill: {
    minHeight: 32,
    borderRadius: 4,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#222222',
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queuePillActive: {
    backgroundColor: '#1E1E1E',
    borderColor: '#444444',
  },
  queuePillText: {
    ...typography.labelSmall,
    color: '#777777',
    letterSpacing: 0.2,
  },
  queuePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deckArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
});
