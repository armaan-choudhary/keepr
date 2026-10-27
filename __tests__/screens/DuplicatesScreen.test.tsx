import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { DuplicatesScreen } from '../../src/screens/DuplicatesScreen';

describe('DuplicatesScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders burst groups, allows changing best shot, and stages duplicates for deletion', () => {
    const onStageDuplicateDecision = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DuplicatesScreen
          onStageDuplicateDecision={onStageDuplicateDecision}
        />
      );
      jest.runOnlyPendingTimers();
    });

    const root = tree.root;

    // Trigger best shot selection for second duplicate
    const secondShot = root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Duplicate shot: BURST_002.JPG')
    );
    expect(secondShot).toBeDefined();

    act(() => {
      secondShot.props.onPress();
      jest.runOnlyPendingTimers();
    });

    // Stage delete remaining duplicates
    const deleteBtn = root.find(
      (node: any) =>
        typeof node.props?.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Delete 2 duplicate shots')
    );
    expect(deleteBtn).toBeDefined();

    act(() => {
      deleteBtn.props.onPress();
      jest.runOnlyPendingTimers();
    });

    expect(onStageDuplicateDecision).toHaveBeenCalledTimes(2);
    expect(onStageDuplicateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'BURST_001.JPG' }),
      'DELETE'
    );
    expect(onStageDuplicateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'BURST_003.JPG' }),
      'DELETE'
    );
  });
});
