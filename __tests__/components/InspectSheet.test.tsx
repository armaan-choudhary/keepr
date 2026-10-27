import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { InspectSheet } from '../../src/components/InspectSheet';
import { MediaItem } from '../../src/platform/contracts';

describe('InspectSheet Component', () => {
  const mockItem: MediaItem = {
    id: 'inspect-1',
    mediaType: 'IMAGE',
    assetRef: 'ph://asset-9988',
    sizeBytes: 9400000,
    capturedAt: 1729100000000,
    width: 4032,
    height: 3024,
    mimeType: 'image/heic',
    filename: 'IMG_9988.HEIC',
    isProtected: false,
  };

  it('renders technical metadata and handles close and protection toggle', () => {
    const onClose = jest.fn();
    const onToggleProtect = jest.fn();
    const onDecision = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <InspectSheet
          visible={true}
          item={mockItem}
          availability="availableOffline"
          onClose={onClose}
          onToggleProtect={onToggleProtect}
          onDecision={onDecision}
        />
      );
    });

    const root = tree.root;

    // Protection switch
    const protectBtn = root.findByProps({
      accessibilityLabel: 'Protect from deletion',
    });
    expect(protectBtn).toBeDefined();
    act(() => {
      protectBtn.props.onPress();
    });
    expect(onToggleProtect).toHaveBeenCalledWith(mockItem);

    // Close button
    const closeBtn = root.findByProps({
      accessibilityLabel: 'Close inspector',
    });
    act(() => {
      closeBtn.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // In-drawer decision button
    const compressBtn = root.findByProps({
      accessibilityLabel: 'Compress item',
    });
    act(() => {
      compressBtn.props.onPress();
    });
    expect(onDecision).toHaveBeenCalledWith(mockItem, 'COMPRESS');
  });

  it('displays offline availability states correctly', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <InspectSheet
          visible={true}
          item={mockItem}
          availability="requiresNetwork"
          onClose={() => {}}
        />
      );
    });

    const instanceStr = JSON.stringify(tree.toJSON());
    expect(instanceStr).toContain('iCloud / Remote Only');
  });
});
