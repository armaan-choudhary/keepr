import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { colors, spacing, touchTargets, radii, typography } from '../theme';
import { RootStackParamList, StagedItemDecision } from './types';
import {
  TriageDeckScreen,
  CheckoutSummaryScreen,
  CollectionsScreen,
  StatsScreen,
  DuplicatesScreen,
  SettingsScreen,
} from '../screens';

export type TabKey = 'TRIAGE' | 'COLLECTIONS' | 'DUPLICATES' | 'STATS' | 'SETTINGS';

interface TabItem {
  key: TabKey;
  label: string;
  icon: string;
  accessibilityLabel: string;
}

const TABS: TabItem[] = [
  { key: 'TRIAGE', label: 'Triage', icon: '◫', accessibilityLabel: 'Triage card deck tab' },
  { key: 'COLLECTIONS', label: 'Collections', icon: '▤', accessibilityLabel: 'Keepr collections and albums tab' },
  { key: 'DUPLICATES', label: 'Duplicates', icon: '⧉', accessibilityLabel: 'Duplicate and burst review tab' },
  { key: 'STATS', label: 'Storage', icon: '▥', accessibilityLabel: 'Storage statistics and history tab' },
  { key: 'SETTINGS', label: 'Settings', icon: '⚙', accessibilityLabel: 'Settings and privacy tab' },
];

const Stack = createNativeStackNavigator<RootStackParamList>();

type MainTabsScreenProps = NativeStackScreenProps<RootStackParamList, 'MainTabs'>;

export const MainTabsScreen: React.FC<MainTabsScreenProps> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('TRIAGE');

  const handleNavigateToCheckout = (staged: StagedItemDecision[]) => {
    navigation.navigate('CheckoutSummary', {
      stagedDecisions: staged,
    });
  };

  const handleNavigateToDuplicates = () => {
    setActiveTab('DUPLICATES');
  };

  return (
    <View style={styles.container}>
      {/* Screen Viewport */}
      <View style={styles.contentViewport}>
        {activeTab === 'TRIAGE' && (
          <TriageDeckScreen
            onNavigateToCheckout={handleNavigateToCheckout}
            onNavigateToDuplicates={handleNavigateToDuplicates}
          />
        )}
        {activeTab === 'COLLECTIONS' && <CollectionsScreen />}
        {activeTab === 'DUPLICATES' && (
          <DuplicatesScreen
            onNavigateToCheckout={() =>
              navigation.navigate('CheckoutSummary', { stagedDecisions: [] })
            }
          />
        )}
        {activeTab === 'STATS' && <StatsScreen />}
        {activeTab === 'SETTINGS' && <SettingsScreen />}
      </View>

      {/* Accessible Bottom Tab Bar */}
      <SafeAreaView style={styles.tabBarSafeArea}>
        <View
          style={styles.tabBar}
          accessible={true}
          accessibilityRole="tablist"
          accessibilityLabel="Main app navigation tabs"
        >
          {TABS.map((tab) => {
            const isSelected = activeTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
                accessible={true}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={tab.accessibilityLabel}
                hitSlop={touchTargets.hitSlop8}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabIcon, isSelected && styles.tabIconActive]}
                >
                  {tab.icon}
                </Text>
                <Text
                  style={[styles.tabLabel, isSelected && styles.tabLabelActive]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
};

type CheckoutScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CheckoutSummary'
>;

const CheckoutSummaryScreenWrapper: React.FC<CheckoutScreenProps> = ({
  route,
  navigation,
}) => {
  const staged = route?.params?.stagedDecisions || [];

  return (
    <CheckoutSummaryScreen
      stagedDecisions={staged}
      onNavigateBack={() => navigation?.goBack?.()}
      onDone={() => {
        route?.params?.onCommitSuccess?.();
        navigation?.navigate?.('MainTabs');
      }}
    />
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabsScreen} />
        <Stack.Screen
          name="CheckoutSummary"
          component={CheckoutSummaryScreenWrapper}
          options={{
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentViewport: {
    flex: 1,
  },
  tabBarSafeArea: {
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    minHeight: touchTargets.min,
    minWidth: touchTargets.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  tabButtonActive: {
    backgroundColor: '#181818',
  },
  tabIcon: {
    fontSize: 16,
    color: '#666666',
  },
  tabIconActive: {
    color: '#FFFFFF',
  },
  tabLabel: {
    ...typography.labelBadge,
    fontSize: 10,
    marginTop: 2,
    color: '#666666',
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
