/**
 * @format
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

// Guard against upstream expo-dev-menu race condition where syncAvailableAppKeys
// fires on setTimeout(0) before the Android Activity is attached to ReactContext.
try {
  const devMenu = requireOptionalNativeModule('ExpoDevMenu');
  if (devMenu && typeof devMenu.setAvailableAppKeys === 'function') {
    const originalSetAvailableAppKeys = devMenu.setAvailableAppKeys.bind(devMenu);
    devMenu.setAvailableAppKeys = function (keys) {
      return Promise.resolve(originalSetAvailableAppKeys(keys)).catch((error) => {
        if (
          error?.message?.includes('current activity is no longer available') ||
          String(error).includes('current activity is no longer available')
        ) {
          // Benign startup race condition: DevMenu re-syncs once activity is resumed.
          return null;
        }
        throw error;
      });
    };
  }
} catch {
  // ExpoDevMenu native module not available (e.g., release or test builds)
}

import 'expo-dev-client';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
