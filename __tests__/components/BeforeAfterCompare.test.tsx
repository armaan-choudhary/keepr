import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { BeforeAfterCompare } from '../../src/components/BeforeAfterCompare';
import { MediaItem, CompressionCandidate } from '../../src/platform/contracts';

describe('BeforeAfterCompare Component', () => {
  const mockOriginal: MediaItem = {
    id: 'orig-1',
    mediaType: 'IMAGE',
    assetRef: 'file:///orig.jpg',
    sizeBytes: 10000000,
    width: 4000,
    height: 3000,
    filename: 'ORIGINAL.JPG',
  };

  const mockCandidate: CompressionCandidate = {
    originalId: 'orig-1',
    stagedPath: 'file:///staged.webp',
    stagedSizeBytes: 1500000,
    originalSizeBytes: 10000000,
    estimatedSavingsBytes: 8500000,
    measuredSavingsBytes: 8500000,
    width: 2560,
    height: 1920,
    mimeType: 'image/webp',
    isSmaller: true,
    isValid: true,
  };

  it('renders dual comparison and confirms staged compression', () => {
    const onClose = jest.fn();
    const onConfirmCompress = jest.fn();
    const onKeepOriginal = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <BeforeAfterCompare
          visible={true}
          original={mockOriginal}
          candidate={mockCandidate}
          onClose={onClose}
          onConfirmCompress={onConfirmCompress}
          onKeepOriginal={onKeepOriginal}
        />
      );
    });

    const root = tree.root;

    // Confirm compress button
    const confirmBtn = root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Confirm compression')
    );
    expect(confirmBtn).toBeDefined();

    act(() => {
      confirmBtn.props.onPress();
    });
    expect(onConfirmCompress).toHaveBeenCalledWith(mockCandidate);
    expect(onClose).toHaveBeenCalled();

    // Mode switching
    const splitTab = root.findByProps({
      accessibilityLabel: 'Split slider view',
    });
    act(() => {
      splitTab.props.onPress();
    });
    expect(splitTab.props.accessibilityState.selected).toBe(true);
  });
});
