import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PermissionGate } from '../../src/components/PermissionGate';
import { LibraryAuthorizationState } from '../../src/platform/contracts';

describe('PermissionGate Component', () => {
  it('renders limited access view with count and select more button', () => {
    const onSelectMore = jest.fn();
    const onContinueLimited = jest.fn();
    const onOpenSettings = jest.fn();

    const limitedState: LibraryAuthorizationState = {
      status: 'limited',
      scope: 'selected',
      canSelectMore: true,
    };

    let tree: any;
    act(() => {
      tree = renderer.create(
        <PermissionGate
          authState={limitedState}
          itemCount={42}
          onRequestPermission={() => {}}
          onOpenSettings={onOpenSettings}
          onSelectMore={onSelectMore}
          onContinueLimited={onContinueLimited}
        />
      );
    });

    const root = tree.root;
    const selectMoreBtn = root.findByProps({
      accessibilityLabel: 'Select more photos from device',
    });
    expect(selectMoreBtn).toBeDefined();

    act(() => {
      selectMoreBtn.props.onPress();
    });
    expect(onSelectMore).toHaveBeenCalled();

    const continueBtn = root.findByProps({
      accessibilityLabel: 'Review 42 available items',
    });
    act(() => {
      continueBtn.props.onPress();
    });
    expect(onContinueLimited).toHaveBeenCalled();
  });

  it('renders denied access state with open settings button', () => {
    const onOpenSettings = jest.fn();

    const deniedState: LibraryAuthorizationState = {
      status: 'denied',
      scope: 'none',
      canSelectMore: false,
    };

    let tree: any;
    act(() => {
      tree = renderer.create(
        <PermissionGate
          authState={deniedState}
          onRequestPermission={() => {}}
          onOpenSettings={onOpenSettings}
        />
      );
    });

    const settingsBtn = tree.root.findByProps({
      accessibilityLabel: 'Open device settings',
    });
    expect(settingsBtn).toBeDefined();

    act(() => {
      settingsBtn.props.onPress();
    });
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
