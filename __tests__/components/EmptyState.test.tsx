import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { EmptyState } from '../../src/components/EmptyState';

describe('EmptyState Component', () => {
  it('renders title, message, and executes action button callback', () => {
    const onAction = jest.fn();
    const onSecondary = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <EmptyState
          title="All Caught Up"
          message="No more photos to triage."
          actionLabel="Switch Queue"
          onAction={onAction}
          secondaryActionLabel="Check Duplicates"
          onSecondaryAction={onSecondary}
        />
      );
    });

    const root = tree.root;
    const actionBtn = root.findByProps({ accessibilityLabel: 'Switch Queue' });
    expect(actionBtn).toBeDefined();

    act(() => {
      actionBtn.props.onPress();
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    const secondaryBtn = root.findByProps({
      accessibilityLabel: 'Check Duplicates',
    });
    act(() => {
      secondaryBtn.props.onPress();
    });
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
