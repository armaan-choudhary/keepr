import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { UndoBanner } from '../../src/components/UndoBanner';
import { MediaItem } from '../../src/platform/contracts';

describe('UndoBanner Component', () => {
  const mockItem: MediaItem = {
    id: 'undo-item-1',
    mediaType: 'IMAGE',
    assetRef: 'file:///photo.jpg',
    sizeBytes: 8500000,
    filename: 'VACATION_01.JPG',
  };

  it('renders decision information and triggers undo callback on tap', () => {
    const onUndo = jest.fn();
    const onDismiss = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <UndoBanner
          lastDecision={{
            item: mockItem,
            decision: 'DELETE',
            timestamp: Date.now(),
          }}
          undoCount={4}
          maxUndo={10}
          onUndo={onUndo}
          onDismiss={onDismiss}
        />
      );
    });

    const root = tree.root;
    const undoBtn = root.findByProps({
      accessibilityLabel: 'Undo Delete',
    });
    expect(undoBtn).toBeDefined();

    act(() => {
      undoBtn.props.onPress();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);

    const dismissBtn = root.findByProps({
      accessibilityLabel: 'Dismiss undo notification',
    });
    act(() => {
      dismissBtn.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('returns null if undoCount is 0 or visible is false', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <UndoBanner
          lastDecision={{
            item: mockItem,
            decision: 'KEEP',
            timestamp: Date.now(),
          }}
          undoCount={0}
          onUndo={() => {}}
        />
      );
    });
    expect(tree.toJSON()).toBeNull();
  });
});
