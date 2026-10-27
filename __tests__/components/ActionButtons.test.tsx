import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ActionButtons } from '../../src/components/ActionButtons';

describe('ActionButtons Component', () => {
  it('renders Delete, Compress, Keep in stable order and triggers callbacks', () => {
    const onDelete = jest.fn();
    const onCompress = jest.fn();
    const onKeep = jest.fn();
    const onUndo = jest.fn();
    const onInspect = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <ActionButtons
          onDelete={onDelete}
          onCompress={onCompress}
          onKeep={onKeep}
          onUndo={onUndo}
          onInspect={onInspect}
          canUndo={true}
          undoCount={3}
          compressEstimateLabel="850 KB (-87%)"
        />
      );
    });

    const root = tree.root;

    // Delete button
    const deleteBtn = root.findByProps({ accessibilityLabel: 'Delete item' });
    expect(deleteBtn).toBeDefined();
    act(() => {
      deleteBtn.props.onPress();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);

    // Compress button
    const compressBtn = root.findByProps({ accessibilityLabel: 'Compress item' });
    expect(compressBtn).toBeDefined();
    act(() => {
      compressBtn.props.onPress();
    });
    expect(onCompress).toHaveBeenCalledTimes(1);

    // Keep button
    const keepBtn = root.findByProps({ accessibilityLabel: 'Keep item full resolution' });
    expect(keepBtn).toBeDefined();
    act(() => {
      keepBtn.props.onPress();
    });
    expect(onKeep).toHaveBeenCalledTimes(1);

    // Undo button
    const undoBtn = root.findByProps({
      accessibilityLabel: 'Undo last triage decision, 3 available to undo',
    });
    expect(undoBtn).toBeDefined();
    act(() => {
      undoBtn.props.onPress();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);

    // Inspect button
    const inspectBtn = root.findByProps({
      accessibilityLabel: 'Inspect photo details and metadata',
    });
    expect(inspectBtn).toBeDefined();
    act(() => {
      inspectBtn.props.onPress();
    });
    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it('disables undo button when canUndo is false', () => {
    const onUndo = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <ActionButtons
          onDelete={() => {}}
          onCompress={() => {}}
          onKeep={() => {}}
          onUndo={onUndo}
          canUndo={false}
          undoCount={0}
        />
      );
    });

    const undoBtn = tree.root.findByProps({
      accessibilityLabel: 'Undo last triage decision',
    });
    expect(undoBtn.props.disabled).toBe(true);
  });
});
