import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TriageDeckScreen } from '../../src/screens/TriageDeckScreen';
import { MediaItem } from '../../src/platform/contracts';

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

describe('TriageDeckScreen', () => {
  const mockItems: MediaItem[] = [
    {
      id: 'screen-item-1',
      mediaType: 'IMAGE',
      assetRef: 'file:///item1.jpg',
      sizeBytes: 5000000,
      filename: 'SCREEN_1.JPG',
      isProtected: false,
    },
    {
      id: 'screen-item-2',
      mediaType: 'IMAGE',
      assetRef: 'file:///item2.jpg',
      sizeBytes: 8000000,
      filename: 'SCREEN_2.JPG',
      isProtected: false,
    },
  ];

  it('renders queue options, advances deck on action button decision, and updates staged counter', () => {
    const onNavigateToCheckout = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <TriageDeckScreen
          items={mockItems}
          onNavigateToCheckout={onNavigateToCheckout}
        />
      );
    });

    const root = tree.root;

    // Press Delete button
    const deleteBtn = root.findByProps({ accessibilityLabel: 'Delete item' });
    act(() => {
      deleteBtn.props.onPress();
    });

    // Staged review button should appear with count 1
    const reviewBtn = root.find(
      (node: any) =>
        node.props?.accessibilityRole === 'button' &&
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Review 1 staged decisions')
    );
    expect(reviewBtn).toBeDefined();

    act(() => {
      reviewBtn.props.onPress();
    });
    expect(onNavigateToCheckout).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          decision: 'DELETE',
          item: mockItems[0],
        }),
      ])
    );
  });

  it('handles undo action restoring item back to deck', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<TriageDeckScreen items={mockItems} />);
    });

    const root = tree.root;

    // Delete item 1
    const deleteBtn = root.findByProps({ accessibilityLabel: 'Delete item' });
    act(() => {
      deleteBtn.props.onPress();
    });

    // Undo banner appears
    const undoBannerBtn = root.findByProps({
      accessibilityLabel: 'Undo Delete',
    });
    expect(undoBannerBtn).toBeDefined();

    // Trigger undo
    act(() => {
      undoBannerBtn.props.onPress();
    });

    // Undo banner should disappear as buffer is now empty
    const undoButtons = root.findAllByProps({
      accessibilityLabel: 'Undo Delete',
    });
    expect(undoButtons).toHaveLength(0);
  });
});
