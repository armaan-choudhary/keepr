import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
} from '../theme';
import { AlbumInfo, MediaItem, LibraryAuthorizationStatus } from '../platform/contracts';
import { EmptyState } from '../components/EmptyState';

export interface KeeprCollection {
  id: string;
  name: string;
  itemIds: string[];
  coverAssetRef?: string;
  createdAt: number;
}

export interface CollectionsScreenProps {
  authStatus?: LibraryAuthorizationStatus;
  nativeAlbums?: AlbumInfo[];
  localCollections?: KeeprCollection[];
  itemsMap?: Record<string, MediaItem>;
  onCreateCollection?: (name: string) => void;
  onRemoveFromCollection?: (collectionId: string, itemId: string) => void;
  onDeleteFromLibrary?: (item: MediaItem) => void;
  onOpenSettings?: () => void;
}

const DEFAULT_COLLECTIONS: KeeprCollection[] = [
  {
    id: 'coll-1',
    name: 'Keepr Favorites & Protections',
    itemIds: ['item-1', 'item-2'],
    coverAssetRef: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800',
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: 'coll-2',
    name: 'Receipts & Documents',
    itemIds: ['item-3'],
    coverAssetRef: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800',
    createdAt: Date.now() - 86400000 * 10,
  },
];

const DEFAULT_NATIVE_ALBUMS: AlbumInfo[] = [
  {
    id: 'native-1',
    name: 'Camera Roll',
    type: 'NATIVE_SYSTEM',
    itemCount: 1420,
    isReadOnly: false,
  },
  {
    id: 'native-2',
    name: 'Screenshots',
    type: 'NATIVE_SYSTEM',
    itemCount: 184,
    isReadOnly: false,
  },
  {
    id: 'native-3',
    name: 'WhatsApp Images',
    type: 'NATIVE_SYSTEM',
    itemCount: 412,
    isReadOnly: false,
  },
];

export const CollectionsScreen: React.FC<CollectionsScreenProps> = ({
  authStatus = 'authorized',
  nativeAlbums = DEFAULT_NATIVE_ALBUMS,
  localCollections: propCollections,
  itemsMap = {},
  onCreateCollection,
  onRemoveFromCollection,
  onDeleteFromLibrary,
  onOpenSettings,
}) => {
  const [collections, setCollections] = useState<KeeprCollection[]>(
    propCollections || DEFAULT_COLLECTIONS
  );
  const [activeTab, setActiveTab] = useState<'KEEPR' | 'NATIVE'>('KEEPR');
  const [selectedCollection, setSelectedCollection] = useState<KeeprCollection | null>(
    null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newCollectionName, setNewCollectionName] = useState<string>('');

  // Item deletion vs removal confirmation modal state
  const [activeItemAction, setActiveItemAction] = useState<{
    item: MediaItem;
    collectionId: string;
  } | null>(null);

  const isLimitedAccess = authStatus === 'limited';

  const handleCreateConfirm = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;

    const newColl: KeeprCollection = {
      id: `coll-${Date.now()}`,
      name: trimmed,
      itemIds: [],
      createdAt: Date.now(),
    };

    setCollections((prev) => [newColl, ...prev]);
    onCreateCollection?.(trimmed);
    setNewCollectionName('');
    setIsCreateModalOpen(false);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Collections & Albums
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'KEEPR'
                ? 'Local app database groups • 100% offline'
                : 'Native OS library albums'}
            </Text>
          </View>

          {activeTab === 'KEEPR' && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setIsCreateModalOpen(true)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Create new Keepr collection"
              hitSlop={touchTargets.hitSlop8}
            >
              <Text style={styles.createButtonText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Selector: Keepr Collections vs Native Albums */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === 'KEEPR' && styles.tabPillActive,
            ]}
            onPress={() => {
              setActiveTab('KEEPR');
              setSelectedCollection(null);
            }}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'KEEPR' }}
            accessibilityLabel="Keepr Collections tab"
          >
            <Text
              style={[
                styles.tabPillText,
                activeTab === 'KEEPR' && styles.tabPillTextActive,
              ]}
            >
              Keepr Collections ({collections.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === 'NATIVE' && styles.tabPillActive,
            ]}
            onPress={() => {
              setActiveTab('NATIVE');
              setSelectedCollection(null);
            }}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'NATIVE' }}
            accessibilityLabel="Native Albums tab"
          >
            <Text
              style={[
                styles.tabPillText,
                activeTab === 'NATIVE' && styles.tabPillTextActive,
              ]}
            >
              Native Albums ({nativeAlbums.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* If in iOS limited access mode and user taps Native Albums */}
        {activeTab === 'NATIVE' && isLimitedAccess ? (
          <View style={styles.limitedAccessWarning}>
            <Text style={styles.warningIcon}>🔒</Text>
            <Text style={styles.limitedTitle}>Native Albums Unavailable</Text>
            <Text style={styles.limitedText}>
              In Limited Photo Library access mode, Apple PhotoKit restricts
              fetching or creating user albums. Keepr local collections remain
              fully operational for your selected photos.
            </Text>
            {onOpenSettings && (
              <TouchableOpacity
                style={styles.openSettingsBtn}
                onPress={onOpenSettings}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Open Settings to grant full library access"
              >
                <Text style={styles.openSettingsBtnText}>
                  Open Device Settings for Full Access
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : selectedCollection ? (
          /* Collection Details / Member Viewer */
          <View style={styles.memberViewerContainer}>
            <View style={styles.collectionDetailHeader}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setSelectedCollection(null)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Back to collections list"
                hitSlop={touchTargets.hitSlop8}
              >
                <Text style={styles.backBtnText}>← All Collections</Text>
              </TouchableOpacity>

              <Text style={styles.collectionDetailTitle} numberOfLines={1}>
                {selectedCollection.name}
              </Text>

              <Text style={styles.collectionDetailCount}>
                {selectedCollection.itemIds.length} items
              </Text>
            </View>

            {selectedCollection.itemIds.length === 0 ? (
              <EmptyState
                icon="◻"
                title="Collection is Empty"
                message="No items have been added to this collection yet. Add items from the triage deck."
              />
            ) : (
              <FlatList
                data={selectedCollection.itemIds}
                keyExtractor={(id) => id}
                numColumns={3}
                contentContainerStyle={styles.gridContent}
                renderItem={({ item: id }) => {
                  const mediaItem = itemsMap[id] || {
                    id,
                    mediaType: 'IMAGE',
                    assetRef: '',
                    sizeBytes: 3200000,
                  };

                  return (
                    <TouchableOpacity
                      style={styles.gridItem}
                      onPress={() =>
                        setActiveItemAction({
                          item: mediaItem,
                          collectionId: selectedCollection.id,
                        })
                      }
                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel={`Media item ${id}, tap for options`}
                    >
                      {mediaItem.assetRef ? (
                        <Image
                          source={{ uri: mediaItem.assetRef }}
                          style={styles.gridThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.gridThumbFallback}>
                          <Text style={styles.gridThumbFallbackText}>◻</Text>
                        </View>
                      )}
                      <Text style={styles.gridItemSize}>
                        {formatBytes(mediaItem.sizeBytes)}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        ) : activeTab === 'KEEPR' ? (
          /* Keepr Collections List */
          <FlatList
            data={collections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.collectionCard}
                onPress={() => setSelectedCollection(item)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Collection ${item.name}, ${item.itemIds.length} items`}
              >
                <View style={styles.cardCoverContainer}>
                  {item.coverAssetRef ? (
                    <Image
                      source={{ uri: item.coverAssetRef }}
                      style={styles.cardCover}
                    />
                  ) : (
                    <View style={styles.cardCoverFallback}>
                      <Text style={styles.cardCoverFallbackText}>📁</Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardInfo}>
                  <View style={styles.badgeLabelRow}>
                    <View style={styles.keeprPill}>
                      <Text style={styles.keeprPillText}>KEEPR LOCAL</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSub}>
                    {item.itemIds.length}{' '}
                    {item.itemIds.length === 1 ? 'item' : 'items'} • Private App
                    Storage
                  </Text>
                </View>

                <Text style={styles.arrowIcon}>➔</Text>
              </TouchableOpacity>
            )}
          />
        ) : (
          /* Native System Albums List */
          <FlatList
            data={nativeAlbums}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View
                style={styles.collectionCard}
                accessible={true}
                accessibilityLabel={`Native album ${item.name}, ${item.itemCount} items`}
              >
                <View style={styles.cardCoverContainer}>
                  <View style={styles.cardCoverFallback}>
                    <Text style={styles.cardCoverFallbackText}>🖼</Text>
                  </View>
                </View>

                <View style={styles.cardInfo}>
                  <View style={styles.badgeLabelRow}>
                    <View style={styles.nativePill}>
                      <Text style={styles.nativePillText}>OS ALBUM</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSub}>
                    {item.itemCount} items • System Media Library
                  </Text>
                </View>
              </View>
            )}
          />
        )}

        {/* Create Collection Modal */}
        <Modal
          visible={isCreateModalOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsCreateModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalDialog}>
              <Text style={styles.modalTitle} accessibilityRole="header">
                New Keepr Collection
              </Text>
              <Text style={styles.modalSub}>
                Local collections exist only within Keepr and work fully offline
                even under limited media permissions.
              </Text>

              <TextInput
                style={styles.inputField}
                placeholder="Collection name"
                placeholderTextColor={colors.textDisabled}
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                autoFocus={true}
                accessibilityLabel="Collection name input"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsCreateModalOpen(false)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel creating collection"
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleCreateConfirm}
                  disabled={!newCollectionName.trim()}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Create collection"
                >
                  <Text style={styles.modalConfirmText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Member Action Dialog: Distinction between "Remove from collection" and "Delete from library" */}
        <Modal
          visible={activeItemAction !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setActiveItemAction(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalDialog}>
              <Text style={styles.modalTitle} accessibilityRole="header">
                Manage Collection Item
              </Text>
              <Text style={styles.modalSub}>
                Choose whether to remove this item from the local collection or
                delete it permanently from device storage.
              </Text>

              <View style={styles.actionMenu}>
                {/* 1. Remove from Collection */}
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => {
                    if (activeItemAction) {
                      onRemoveFromCollection?.(
                        activeItemAction.collectionId,
                        activeItemAction.item.id
                      );
                      setCollections((prev) =>
                        prev.map((c) =>
                          c.id === activeItemAction.collectionId
                            ? {
                                ...c,
                                itemIds: c.itemIds.filter(
                                  (id) => id !== activeItemAction.item.id
                                ),
                              }
                            : c
                        )
                      );
                      if (selectedCollection) {
                        setSelectedCollection({
                          ...selectedCollection,
                          itemIds: selectedCollection.itemIds.filter(
                            (id) => id !== activeItemAction.item.id
                          ),
                        });
                      }
                      setActiveItemAction(null);
                    }
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Remove from collection only"
                  accessibilityHint="Item remains intact in your device photo library"
                >
                  <Text style={styles.menuOptionTitle}>
                    Remove from Collection
                  </Text>
                  <Text style={styles.menuOptionSub}>
                    Safely unlinks from this collection. Original remains in
                    device photo library.
                  </Text>
                </TouchableOpacity>

                {/* 2. Delete from Library */}
                <TouchableOpacity
                  style={[styles.menuOption, styles.destructiveOption]}
                  onPress={() => {
                    if (activeItemAction) {
                      onDeleteFromLibrary?.(activeItemAction.item);
                      setActiveItemAction(null);
                    }
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Delete from photo library"
                  accessibilityHint="Destructive: Stages item for deletion from device storage"
                >
                  <Text style={styles.destructiveTitle}>
                    Delete from Device Library
                  </Text>
                  <Text style={styles.menuOptionSub}>
                    Stages item for platform deletion (moves to System Trash or
                    Recently Deleted).
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.dismissActionBtn}
                onPress={() => setActiveItemAction(null)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cancel action"
              >
                <Text style={styles.dismissActionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  createButton: {
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
  createButtonText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  tabPill: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.textPrimary,
  },
  tabPillText: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
  },
  tabPillTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.gutter,
    gap: spacing.sm,
  },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardCoverContainer: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  cardCoverFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardCoverFallbackText: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  badgeLabelRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  keeprPill: {
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  keeprPillText: {
    ...typography.labelBadge,
    fontSize: 8,
    color: colors.textPrimary,
  },
  nativePill: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  nativePillText: {
    ...typography.labelBadge,
    fontSize: 8,
    color: colors.textSecondary,
  },
  cardTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  cardSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  arrowIcon: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  limitedAccessWarning: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  limitedTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  limitedText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  openSettingsBtn: {
    minHeight: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openSettingsBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  memberViewerContainer: {
    flex: 1,
  },
  collectionDetailHeader: {
    padding: spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
    gap: spacing.xs,
  },
  backBtn: {
    minHeight: 32,
    justifyContent: 'center',
  },
  backBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  collectionDetailTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  collectionDetailCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  gridContent: {
    padding: spacing.gutter,
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 4,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
    position: 'relative',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  gridThumbFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridThumbFallbackText: {
    color: colors.textSecondary,
    fontSize: 20,
  },
  gridItemSize: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: radii.xs,
    paddingHorizontal: 4,
    fontSize: 9,
    color: colors.textPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.gutter,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.lg,
  },
  modalTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  inputField: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalCancelBtn: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCancelText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
  },
  modalConfirmBtn: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalConfirmText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  actionMenu: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  menuOption: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
  },
  menuOptionTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  menuOptionSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  destructiveOption: {
    borderColor: colors.textSecondary,
  },
  destructiveTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 2,
  },
  dismissActionBtn: {
    minHeight: touchTargets.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissActionText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
  },
});
