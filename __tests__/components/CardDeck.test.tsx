import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CardDeck, resolveGestureAction } from '../../src/components/CardDeck';
import { MediaItem } from '../../src/platform/contracts';

// Mock react-native-reanimated
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

// Mock react-native-gesture-handler
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

describe('CardDeck Gesture & Threshold Resolution', () => {
  const screenWidth = 390;
  const screenHeight = 844;

  it('resolves swipe right beyond horizontal threshold (0.35 * screenWidth) as KEEP', () => {
    const result = resolveGestureAction({
      translationX: 390 * 0.36,
      translationY: 0,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('KEEP');
  });

  it('resolves high velocity horizontal right swipe as KEEP', () => {
    const result = resolveGestureAction({
      translationX: 20,
      translationY: 0,
      velocityX: 1200,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('KEEP');
  });

  it('resolves swipe left beyond horizontal threshold as DELETE', () => {
    const result = resolveGestureAction({
      translationX: -390 * 0.36,
      translationY: 0,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('DELETE');
  });

  it('resolves high velocity horizontal left swipe as DELETE', () => {
    const result = resolveGestureAction({
      translationX: -20,
      translationY: 0,
      velocityX: -1100,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('DELETE');
  });

  it('resolves upward swipe beyond vertical threshold (0.25 * screenHeight) as COMPRESS when abs(y) > 1.2 * abs(x)', () => {
    const result = resolveGestureAction({
      translationX: 10,
      translationY: -844 * 0.26,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('COMPRESS');
  });

  it('resolves high velocity upward drag as COMPRESS', () => {
    const result = resolveGestureAction({
      translationX: 10,
      translationY: -50,
      velocityY: -1000,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('COMPRESS');
  });

  it('resets downward motion without committing', () => {
    const result = resolveGestureAction({
      translationX: 10,
      translationY: 150,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('RESET');
  });

  it('resolves diagonal drag with dominant horizontal vector to KEEP or DELETE rather than COMPRESS', () => {
    // abs(y) <= 1.2 * abs(x)
    const result = resolveGestureAction({
      translationX: 390 * 0.4,
      translationY: -844 * 0.26, // abs(y) = 219, abs(x) = 156. 1.2 * 156 = 187.2 => here abs(y) > 1.2 * abs(x)
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('COMPRESS');

    const horizontalDominated = resolveGestureAction({
      translationX: 390 * 0.4, // 156
      translationY: -100, // 100 < 1.2 * 156
      screenWidth,
      screenHeight,
    });
    expect(horizontalDominated).toBe('KEEP');
  });

  it('resets sub-threshold motion', () => {
    const result = resolveGestureAction({
      translationX: 20,
      translationY: -20,
      screenWidth,
      screenHeight,
    });
    expect(result).toBe('RESET');
  });
});

describe('CardDeck Component Rendering & Accessibility', () => {
  const mockItems: MediaItem[] = [
    {
      id: 'media-1',
      mediaType: 'IMAGE',
      assetRef: 'file:///path/to/img1.jpg',
      sizeBytes: 6800000,
      capturedAt: 1729000000000,
      width: 3024,
      height: 4032,
      filename: 'IMG_001.JPG',
      isProtected: true,
    },
    {
      id: 'media-2',
      mediaType: 'VIDEO',
      assetRef: 'file:///path/to/vid2.mp4',
      sizeBytes: 42000000,
      capturedAt: 1729100000000,
      durationSeconds: 45,
      filename: 'VID_002.MP4',
    },
    {
      id: 'media-3',
      mediaType: 'IMAGE',
      assetRef: 'file:///path/to/img3.jpg',
      sizeBytes: 3100000,
    },
  ];

  it('renders active card with accessible properties and depth cue cards', () => {
    const onDecision = jest.fn();
    const onInspect = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <CardDeck
          items={mockItems}
          onDecision={onDecision}
          onInspect={onInspect}
        />
      );
    });

    const root = tree.root;
    // Active card element has accessible=true
    const activeCard = root.findByProps({ accessibilityRole: 'imagebutton' });
    expect(activeCard).toBeDefined();
    expect(activeCard.props.accessibilityLabel).toContain('IMG_001.JPG');
    expect(activeCard.props.accessibilityActions).toHaveLength(4);

    // Test accessibility action handler
    act(() => {
      activeCard.props.onAccessibilityAction({
        nativeEvent: { actionName: 'keep' },
      });
    });
    expect(onDecision).toHaveBeenCalledWith(mockItems[0], 'KEEP');

    act(() => {
      activeCard.props.onAccessibilityAction({
        nativeEvent: { actionName: 'inspect' },
      });
    });
    expect(onInspect).toHaveBeenCalledWith(mockItems[0]);
  });
});
