import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Mock react-navigation
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: any) => children,
      Screen: ({ component: Component, ...props }: any) =>
        Component ? React.createElement(Component, { route: { params: {} }, navigation: { navigate: jest.fn(), goBack: jest.fn() }, ...props }) : null,
    }),
  };
});

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: {
      View: (props: any) => React.createElement(View, props, props.children),
    },
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withSpring: (toVal: any) => toVal,
    withTiming: (toVal: any) => toVal,
    runOnJS: (fn: any) => fn,
    interpolate: () => 1,
    Extrapolation: { CLAMP: 'clamp' },
  };
});

// Mock gesture handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    Gesture: {
      Pan: () => {
        const pan: any = {
          onStart: () => pan,
          onUpdate: () => pan,
          onEnd: () => pan,
        };
        return pan;
      },
    },
    GestureDetector: ({ children }: any) =>
      React.createElement(View, { testID: 'gesture-detector' }, children),
  };
});

import { MainTabsScreen, AppNavigator } from '../../src/navigation/AppNavigator';

describe('AppNavigator & MainTabsScreen Navigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders accessible tab bar and switches tabs', () => {
    const mockNavigation: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
    };

    let tree: any;
    act(() => {
      tree = renderer.create(
        <MainTabsScreen
          navigation={mockNavigation}
          route={{ key: 'main-tabs', name: 'MainTabs' }}
        />
      );
      jest.runOnlyPendingTimers();
    });

    const root = tree.root;

    // Check tab bar accessibility
    const tabList = root.findByProps({
      accessibilityRole: 'tablist',
      accessibilityLabel: 'Main app navigation tabs',
    });
    expect(tabList).toBeDefined();

    // Switch to Storage stats tab
    const statsTab = root.findByProps({
      accessibilityLabel: 'Storage statistics and history tab',
    });
    act(() => {
      statsTab.props.onPress();
      jest.runOnlyPendingTimers();
    });
    expect(statsTab.props.accessibilityState.selected).toBe(true);

    // Switch to Settings tab
    const settingsTab = root.findByProps({
      accessibilityLabel: 'Settings and privacy tab',
    });
    act(() => {
      settingsTab.props.onPress();
      jest.runOnlyPendingTimers();
    });
    expect(settingsTab.props.accessibilityState.selected).toBe(true);
  });

  it('renders root AppNavigator container without crashing', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<AppNavigator />);
      jest.runOnlyPendingTimers();
    });
    expect(tree).toBeDefined();
  });
});
