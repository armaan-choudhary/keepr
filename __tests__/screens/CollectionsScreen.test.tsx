import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CollectionsScreen } from '../../src/screens/CollectionsScreen';

describe('CollectionsScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('switches between Keepr Collections and Native Albums tabs', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<CollectionsScreen />);
      jest.runOnlyPendingTimers();
    });

    const root = tree.root;

    // Switch to Native Albums tab
    const nativeTab = root.findByProps({
      accessibilityLabel: 'Native Albums tab',
    });
    act(() => {
      nativeTab.props.onPress();
      jest.runOnlyPendingTimers();
    });
    expect(nativeTab.props.accessibilityState.selected).toBe(true);

    // Switch back to Keepr Collections
    const keeprTab = root.findByProps({
      accessibilityLabel: 'Keepr Collections tab',
    });
    act(() => {
      keeprTab.props.onPress();
      jest.runOnlyPendingTimers();
    });
    expect(keeprTab.props.accessibilityState.selected).toBe(true);
  });

  it('shows limited access restriction notice on native albums under limited permissions', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<CollectionsScreen authStatus="limited" />);
      jest.runOnlyPendingTimers();
    });

    const root = tree.root;
    const nativeTab = root.findByProps({
      accessibilityLabel: 'Native Albums tab',
    });
    act(() => {
      nativeTab.props.onPress();
      jest.runOnlyPendingTimers();
    });

    const warningText = root.findByProps({
      children: 'Native Albums Unavailable',
    });
    expect(warningText).toBeDefined();
  });

  it('opens new collection modal and triggers create', () => {
    const onCreateCollection = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <CollectionsScreen onCreateCollection={onCreateCollection} />
      );
      jest.runOnlyPendingTimers();
    });

    const root = tree.root;
    const newBtn = root.findByProps({
      accessibilityLabel: 'Create new Keepr collection',
    });
    act(() => {
      newBtn.props.onPress();
    });

    // Enter collection name in text field
    const input = root.findByProps({ accessibilityLabel: 'Collection name input' });
    act(() => {
      input.props.onChangeText('Vacation RAWs');
    });

    // Press Create
    const createBtn = root.findByProps({
      accessibilityLabel: 'Create collection',
    });
    act(() => {
      createBtn.props.onPress();
      jest.runOnlyPendingTimers();
    });

    expect(onCreateCollection).toHaveBeenCalledWith('Vacation RAWs');
  });
});
