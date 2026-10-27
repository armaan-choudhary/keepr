import React from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  radii,
  typography,
  formatBytes,
  formatDate,
  formatTime,
} from '../theme';

export interface SessionHistoryEntry {
  id: string;
  timestamp: number;
  queueName: string;
  totalReviewed: number;
  itemsKept: number;
  itemsCompressed: number;
  itemsDeleted: number;
  measuredReclaimedBytes: number;
}

export interface StatsScreenProps {
  measuredReclaimedTotal?: number;
  estimatedPotentialSavings?: number;
  imageReclaimedBytes?: number;
  videoReclaimedBytes?: number;
  screenshotReclaimedBytes?: number;
  sessions?: SessionHistoryEntry[];
}

const DEFAULT_SESSIONS: SessionHistoryEntry[] = [
  {
    id: 'sess-1',
    timestamp: Date.now() - 3600000 * 2,
    queueName: 'Old Screenshots',
    totalReviewed: 32,
    itemsKept: 4,
    itemsCompressed: 0,
    itemsDeleted: 28,
    measuredReclaimedBytes: 142000000, // ~135 MB
  },
  {
    id: 'sess-2',
    timestamp: Date.now() - 86400000 * 1,
    queueName: 'Heavy Hitters',
    totalReviewed: 14,
    itemsKept: 2,
    itemsCompressed: 8,
    itemsDeleted: 4,
    measuredReclaimedBytes: 980000000, // ~934 MB
  },
  {
    id: 'sess-3',
    timestamp: Date.now() - 86400000 * 4,
    queueName: 'Messaging Media',
    totalReviewed: 55,
    itemsKept: 12,
    itemsCompressed: 22,
    itemsDeleted: 21,
    measuredReclaimedBytes: 410000000, // ~391 MB
  },
];

export const StatsScreen: React.FC<StatsScreenProps> = ({
  measuredReclaimedTotal = 1532000000, // ~1.46 GB
  estimatedPotentialSavings = 4200000000, // ~3.9 GB
  imageReclaimedBytes = 412000000,
  videoReclaimedBytes = 980000000,
  screenshotReclaimedBytes = 140000000,
  sessions = DEFAULT_SESSIONS,
}) => {
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
            Storage & History
          </Text>
          <Text style={styles.headerSubtitle}>
            Local on-device measurements • Zero telemetry
          </Text>
        </View>

        {/* Hero Card: Measured Reclaimed Storage */}
        <View
          style={styles.heroCard}
          accessible={true}
          accessibilityRole="summary"
          accessibilityLabel={`Total measured storage reclaimed: ${formatBytes(
            measuredReclaimedTotal
          )}`}
        >
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>VERIFIED RECLAIMED</Text>
            </View>
          </View>

          <Text style={styles.heroValue}>
            {formatBytes(measuredReclaimedTotal)}
          </Text>
          <Text style={styles.heroDescription}>
            Total bytes safely released back to device storage through committed
            deletions and verified WebP/H.264 compressions.
          </Text>
        </View>

        {/* Distinction Banner: Measured vs Estimated */}
        <View style={styles.forecastCard}>
          <View style={styles.forecastHeader}>
            <Text style={styles.forecastLabel}>
              ESTIMATED UNREVIEWED POTENTIAL
            </Text>
            <Text style={styles.forecastValue}>
              ~{formatBytes(estimatedPotentialSavings)}
            </Text>
          </View>
          <Text style={styles.forecastSub}>
            Estimated potential storage reclaimable across pending queues
            (Screenshots, Duplicate Bursts, and Heavy Videos). Measured bytes
            only update after changes are verified and committed.
          </Text>
        </View>

        {/* Breakdown by Media Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECLAIMED BY MEDIA TYPE</Text>

          <View style={styles.breakdownList}>
            {/* Videos */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownIconBox}>
                <Text style={styles.breakdownIcon}>▶</Text>
              </View>
              <View style={styles.breakdownDetails}>
                <Text style={styles.breakdownTitle}>Videos</Text>
                <Text style={styles.breakdownSub}>
                  Large 1080p/4K recordings & clips
                </Text>
              </View>
              <Text style={styles.breakdownValue}>
                {formatBytes(videoReclaimedBytes)}
              </Text>
            </View>

            {/* Photos & Images */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownIconBox}>
                <Text style={styles.breakdownIcon}>◻</Text>
              </View>
              <View style={styles.breakdownDetails}>
                <Text style={styles.breakdownTitle}>Photos & RAW</Text>
                <Text style={styles.breakdownSub}>
                  High-res camera captures & WebP transforms
                </Text>
              </View>
              <Text style={styles.breakdownValue}>
                {formatBytes(imageReclaimedBytes)}
              </Text>
            </View>

            {/* Screenshots */}
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownIconBox}>
                <Text style={styles.breakdownIcon}>⧉</Text>
              </View>
              <View style={styles.breakdownDetails}>
                <Text style={styles.breakdownTitle}>Screenshots</Text>
                <Text style={styles.breakdownSub}>
                  Temporary grabs & receipts older than 30 days
                </Text>
              </View>
              <Text style={styles.breakdownValue}>
                {formatBytes(screenshotReclaimedBytes)}
              </Text>
            </View>
          </View>
        </View>

        {/* Session History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRIAGE SESSION HISTORY</Text>

          <View style={styles.sessionList}>
            {sessions.map((sess) => (
              <View
                key={sess.id}
                style={styles.sessionCard}
                accessible={true}
                accessibilityLabel={`Session in ${sess.queueName} on ${formatDate(
                  sess.timestamp
                )}. ${sess.totalReviewed} reviewed, reclaimed ${formatBytes(
                  sess.measuredReclaimedBytes
                )}.`}
              >
                <View style={styles.sessionTopRow}>
                  <Text style={styles.sessionQueueTitle}>{sess.queueName}</Text>
                  <Text style={styles.sessionDate}>
                    {formatDate(sess.timestamp)} • {formatTime(sess.timestamp)}
                  </Text>
                </View>

                <View style={styles.sessionMetricsRow}>
                  <View style={styles.sessionPill}>
                    <Text style={styles.sessionPillText}>
                      {sess.totalReviewed} reviewed
                    </Text>
                  </View>
                  <Text style={styles.sessionBreakdownText}>
                    {sess.itemsDeleted} deleted • {sess.itemsCompressed} compressed •{' '}
                    {sess.itemsKept} kept
                  </Text>
                </View>

                <View style={styles.sessionReclaimedRow}>
                  <Text style={styles.sessionReclaimedLabel}>
                    Storage Reclaimed:
                  </Text>
                  <Text style={styles.sessionReclaimedValue}>
                    +{formatBytes(sess.measuredReclaimedBytes)}
                  </Text>
                </View>
              </View>
            ))}
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.xl,
    alignItems: 'center',
  },
  heroBadgeRow: {
    marginBottom: spacing.xs,
  },
  heroBadge: {
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  heroBadgeText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: colors.textPrimary,
  },
  heroValue: {
    fontSize: 42,
    fontWeight: '700',
    color: colors.textPrimary,
    marginVertical: spacing.xs,
  },
  heroDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  forecastCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.xs,
  },
  forecastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forecastLabel: {
    ...typography.labelBadge,
    fontSize: 10,
    color: colors.textSecondary,
  },
  forecastValue: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  forecastSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.labelBadge,
    color: colors.textSecondary,
  },
  breakdownList: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    overflow: 'hidden',
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
    gap: spacing.md,
  },
  breakdownIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownIcon: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  breakdownDetails: {
    flex: 1,
    gap: 2,
  },
  breakdownTitle: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  breakdownSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  breakdownValue: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  sessionList: {
    gap: spacing.sm,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionQueueTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  sessionDate: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  sessionMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionPill: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  sessionPillText: {
    ...typography.labelBadge,
    fontSize: 9,
    color: colors.textPrimary,
  },
  sessionBreakdownText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  sessionReclaimedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  sessionReclaimedLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  sessionReclaimedValue: {
    ...typography.labelMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
