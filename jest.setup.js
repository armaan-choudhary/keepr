/* eslint-env jest */
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: ({ children, style }: any) => React.createElement(View, { style }, children),
    Gesture: {
      Pan: () => {
        const pan: any = {
          onBegin: (fn: any) => { pan._onBegin = fn; return pan; },
          onStart: (fn: any) => { pan._onStart = fn; return pan; },
          onUpdate: (fn: any) => { pan._onUpdate = fn; return pan; },
          onEnd: (fn: any) => { pan._onEnd = fn; return pan; },
          onFinalize: (fn: any) => { pan._onFinalize = fn; return pan; },
          enabled: (_val: any) => pan,
        };
        return pan;
      },
    },
    GestureDetector: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => children,
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: {
      View: (props: any) => React.createElement(View, props, props.children),
      Text: (props: any) => React.createElement(require('react-native').Text, props, props.children),
      createAnimatedComponent: (comp: any) => comp,
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

jest.mock('react-native-worklets', () => ({}));

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock').default;
  return mock;
});
