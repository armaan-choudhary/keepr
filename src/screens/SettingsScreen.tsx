import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
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
} from '../theme';
import { LibraryAuthorizationState } from '../platform/contracts';

export interface SettingsScreenProps {
  authState?: LibraryAuthorizationState;
  stagingCacheSizeBytes?: number;
  onOpenSettings?: () => void;
  onClearStagingCache?: () => Promise<void>;
  onToggleCloudSync?: (enabled: boolean) => void;
  onToggleReminders?: (enabled: boolean) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  authState = {
    status: 'authorized',
    scope: 'full',
    canSelectMore: false,
  },
  stagingCacheSizeBytes = 68000000, // 64.8 MB
  onOpenSettings = () => {},
  onClearStagingCache,
  onToggleCloudSync,
  onToggleReminders,
}) => {
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState<boolean>(false);
  const [cacheBytes, setCacheBytes] = useState<number>(stagingCacheSizeBytes);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);

  const handleCloudSyncToggle = (val: boolean) => {
    if (val) {
      Alert.alert(
        'Enable Optional Cloud Sync?',
        'Keepr operates 100% on-device by default. If enabled, only triage metadata (session history and collection names) can sync with your Google Drive account. Source media is NEVER uploaded.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable Sync',
            onPress: () => {
              setCloudSyncEnabled(true);
              onToggleCloudSync?.(true);
            },
          },
        ]
      );
    } else {
      setCloudSyncEnabled(false);
      onToggleCloudSync?.(false);
    }
  };

  const handleRemindersToggle = (val: boolean) => {
    setRemindersEnabled(val);
    onToggleReminders?.(val);
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      if (onClearStagingCache) {
        await onClearStagingCache();
      }
      setCacheBytes(0);
      Alert.alert('Staging Cleaned', 'Temporary compression cache has been cleared.');
    } catch {
      Alert.alert('Error', 'Could not clear staging cache.');
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Settings & Privacy
          </Text>
          <Text style={styles.headerSubtitle}>
            Privacy guarantees, permissions, and app preferences
          </Text>
        </View>

        {/* Offline Guarantee Hero */}
        <View
          style={styles.offlineGuaranteeCard}
          accessible={true}
          accessibilityLabel="Offline Guarantee: 100% on-device processing. No background tracking or uploads."
        >
          <View style={styles.badgeRow}>
            <View style={styles.offlinePill}>
              <Text style={styles.offlinePillText}>● 100% ON-DEVICE</Text>
            </View>
          </View>
          <Text style={styles.guaranteeTitle}>Strict Privacy Architecture</Text>
          <Text style={styles.guaranteeBody}>
            Keepr scans, triages, and compresses media entirely on your hardware.
            No photo, video, GPS coordinate, or thumbnail is ever transmitted over
            a network. Zero analytics or background trackers.
          </Text>
        </View>

        {/* Media Library Permission Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEVICE MEDIA ACCESS</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <Text style={styles.settingLabel}>Library Permission</Text>
                <Text style={styles.settingSub}>
                  Current OS Status:{' '}
                  <Text style={styles.highlightText}>
                    {authState.status.toUpperCase()} ({authState.scope.toUpperCase()})
                  </Text>
                </Text>
              </View>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onOpenSettings}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Open device settings to manage photo permissions"
                hitSlop={touchTargets.hitSlop8}
              >
                <Text style={styles.actionBtnText}>Manage in Settings</Text>
              </TouchableOpacity>
            </View>

            {authState.scope === 'selected' && (
              <View style={styles.limitedNote}>
                <Text style={styles.limitedNoteText}>
                  Limited access is enabled. Keepr can only see the photos you
                  have selected. To review the full device library, grant Full
                  Access in Settings.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Local Notifications & Reminders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REVIEW REMINDERS</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <Text style={styles.settingLabel}>Weekly Review Reminders</Text>
                <Text style={styles.settingSub}>
                  Scheduled local notifications alerting you to old screenshots
                  and heavy files. Uses device OS alarms only.
                </Text>
              </View>

              <Switch
                value={remindersEnabled}
                onValueChange={handleRemindersToggle}
                trackColor={{ false: colors.surfacePressed, true: colors.textPrimary }}
                thumbColor={remindersEnabled ? colors.background : colors.textSecondary}
                accessibilityLabel="Toggle weekly review reminders"
              />
            </View>
          </View>
        </View>

        {/* Optional Cloud Sync (Off by default) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPTIONAL CLOUD SYNC</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <Text style={styles.settingLabel}>Google Drive Metadata Sync</Text>
                <Text style={styles.settingSub}>
                  {cloudSyncEnabled
                    ? 'Syncs triage session history and collection names. Source media is never synced.'
                    : 'Disabled. Keepr is running in strict offline mode with zero network access.'}
                </Text>
              </View>

              <Switch
                value={cloudSyncEnabled}
                onValueChange={handleCloudSyncToggle}
                trackColor={{ false: colors.surfacePressed, true: colors.textPrimary }}
                thumbColor={cloudSyncEnabled ? colors.background : colors.textSecondary}
                accessibilityLabel="Toggle optional Google Drive metadata sync"
              />
            </View>
          </View>
        </View>

        {/* Temporary Staging Cache Cleanup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STORAGE & STAGING</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextGroup}>
                <Text style={styles.settingLabel}>Staged Candidates Cache</Text>
                <Text style={styles.settingSub}>
                  Durable staging space used for verified compressed files
                  awaiting checkout: {formatBytes(cacheBytes)}.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (cacheBytes === 0 || isClearingCache) && styles.actionBtnDisabled,
                ]}
                onPress={handleClearCache}
                disabled={cacheBytes === 0 || isClearingCache}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Clear temporary staging cache"
                hitSlop={touchTargets.hitSlop8}
              >
                <Text style={styles.actionBtnText}>
                  {isClearingCache ? 'Clearing...' : 'Clear Cache'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
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
  },
  scrollContent: {
    padding: spacing.gutter,
    gap: spacing.lg,
  },
  header: {
    paddingVertical: spacing.xs,
  },
  headerTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  offlineGuaranteeCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  badgeRow: {
    marginBottom: 4,
  },
  offlinePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  offlinePillText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: colors.textPrimary,
  },
  guaranteeTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  guaranteeBody: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.labelBadge,
    color: colors.textSecondary,
  },
  settingCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  settingTextGroup: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  settingSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  highlightText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  actionBtn: {
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  limitedNote: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  limitedNoteText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
});
