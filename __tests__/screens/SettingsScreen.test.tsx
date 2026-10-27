import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

describe('SettingsScreen', () => {
  it('renders offline guarantee, handles reminders toggle, and clears staging cache', async () => {
    const onToggleReminders = jest.fn();
    const onClearStagingCache = jest.fn().mockResolvedValue(undefined);
    const onOpenSettings = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <SettingsScreen
          onToggleReminders={onToggleReminders}
          onClearStagingCache={onClearStagingCache}
          onOpenSettings={onOpenSettings}
        />
      );
    });

    const root = tree.root;

    // Offline guarantee check
    const guarantee = root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Offline Guarantee')
    );
    expect(guarantee).toBeDefined();

    // Toggle reminders
    const reminderSwitch = root.findByProps({
      accessibilityLabel: 'Toggle weekly review reminders',
    });
    act(() => {
      reminderSwitch.props.onValueChange(true);
    });
    expect(onToggleReminders).toHaveBeenCalledWith(true);

    // Open settings button
    const settingsBtn = root.findByProps({
      accessibilityLabel: 'Open device settings to manage photo permissions',
    });
    act(() => {
      settingsBtn.props.onPress();
    });
    expect(onOpenSettings).toHaveBeenCalled();

    // Clear cache button
    const clearCacheBtn = root.findByProps({
      accessibilityLabel: 'Clear temporary staging cache',
    });
    await act(async () => {
      await clearCacheBtn.props.onPress();
    });
    expect(onClearStagingCache).toHaveBeenCalled();
  });
});
