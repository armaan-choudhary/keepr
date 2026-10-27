import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, touchTargets, radii, typography } from '../theme';
import { LibraryAuthorizationState } from '../platform/contracts';
import { LoadingState } from './LoadingState';

export interface PermissionGateProps {
  authState: LibraryAuthorizationState | null;
  itemCount?: number;
  onRequestPermission: () => void;
  onOpenSettings: () => void;
  onSelectMore?: () => void;
  onContinueLimited?: () => void;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  authState,
  itemCount = 0,
  onRequestPermission,
  onOpenSettings,
  onSelectMore,
  onContinueLimited,
}) => {
  if (!authState) {
    return <LoadingState message="Checking media permissions..." />;
  }

  // Limited access state (Android 14+ selected or iOS PhotoKit limited)
  if (authState.status === 'limited' || authState.scope === 'selected') {
    return (
      <View
        style={styles.container}
        accessible={true}
        accessibilityRole="none"
        accessibilityLabel={`Limited photo access. ${itemCount} items available to Keepr.`}
      >
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={styles.scopeBadge}>
              <Text style={styles.scopeBadgeText}>LIMITED ACCESS</Text>
            </View>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            Items Available to Keepr
          </Text>

          <View style={styles.countContainer}>
            <Text style={styles.countNumber}>{itemCount}</Text>
            <Text style={styles.countLabel}>
              {itemCount === 1 ? 'photo or video available' : 'photos & videos available'}
            </Text>
          </View>

          <Text style={styles.description}>
            You have granted access to selected media. Keepr can only inspect,
            compress, or clean the items explicitly chosen. Native user albums
            are restricted in limited mode.
          </Text>

          <View style={styles.actions}>
            {authState.canSelectMore && onSelectMore && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onSelectMore}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Select more photos from device"
                accessibilityHint="Opens system picker to grant Keepr access to additional photos"
              >
                <Text style={styles.primaryButtonText}>Select More Photos</Text>
              </TouchableOpacity>
            )}

            {onContinueLimited && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onContinueLimited}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Review ${itemCount} available items`}
              >
                <Text style={styles.secondaryButtonText}>
                  Continue with {itemCount} Items
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.tertiaryButton}
              onPress={onOpenSettings}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
              accessibilityHint="Opens device settings to grant full photo library access"
            >
              <Text style={styles.tertiaryButtonText}>Open Settings for Full Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Denied or restricted state
  if (authState.status === 'denied' || authState.status === 'restricted') {
    return (
      <View
        style={styles.container}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel="Media library access denied. Access required in Settings to triage media."
      >
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.lockIcon}>✕</Text>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            Media Access Required
          </Text>

          <Text style={styles.description}>
            Keepr is an on-device media manager. To discover heavy files,
            duplicate bursts, and screenshots, it needs permission to read your
            photo library.
          </Text>

          <View style={styles.offlinePill}>
            <Text style={styles.offlinePillText}>
              🔒 100% On-Device • Zero Network Uploads
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onOpenSettings}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
              accessibilityHint="Navigates to device settings where you can allow photo access"
            >
              <Text style={styles.primaryButtonText}>Open Device Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Not determined / initial state
  if (authState.status === 'notDetermined') {
    return (
      <View
        style={styles.container}
        accessible={true}
        accessibilityRole="none"
        accessibilityLabel="Grant media access to start reviewing"
      >
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.lockIcon}>◻</Text>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            Review Your Device Media
          </Text>

          <Text style={styles.description}>
            Keepr helps you reclaim storage by triaging screenshots, heavy
            videos, and duplicate photos. Everything runs locally on your
            device.
          </Text>

          <View style={styles.offlinePill}>
            <Text style={styles.offlinePillText}>
              ● Private & Offline • Originals Never Overwritten
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onRequestPermission}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Grant photo library permission"
            >
              <Text style={styles.primaryButtonText}>Grant Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.gutter,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.outline,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  lockIcon: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  badgeRow: {
    marginBottom: spacing.md,
  },
  scopeBadge: {
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  scopeBadgeText: {
    ...typography.labelBadge,
    color: colors.textPrimary,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  countContainer: {
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    width: '100%',
  },
  countNumber: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 46,
  },
  countLabel: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  offlinePill: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xl,
  },
  offlinePillText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontSize: 11,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: touchTargets.min,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  secondaryButton: {
    minHeight: touchTargets.min,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    ...typography.labelMedium,
    color: colors.textPrimary,
  },
  tertiaryButton: {
    minHeight: touchTargets.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  tertiaryButtonText: {
    ...typography.labelMedium,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
