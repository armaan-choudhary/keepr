import React from 'react';
import { Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CheckoutSummaryScreen } from '../../src/screens/CheckoutSummaryScreen';
import { StagedItemDecision } from '../../src/navigation/types';
import { ICommitAdapter } from '../../src/platform/contracts';

describe('CheckoutSummaryScreen', () => {
  const stagedDecisions: StagedItemDecision[] = [
    {
      item: {
        id: 'del-1',
        mediaType: 'IMAGE',
        assetRef: 'file:///del1.jpg',
        sizeBytes: 10000000, // ~10 MB
        filename: 'DELETE_ME.JPG',
      },
      decision: 'DELETE',
      timestamp: Date.now(),
    },
    {
      item: {
        id: 'cmp-1',
        mediaType: 'IMAGE',
        assetRef: 'file:///cmp1.jpg',
        sizeBytes: 20000000, // ~20 MB
        filename: 'COMPRESS_ME.JPG',
      },
      decision: 'COMPRESS',
      timestamp: Date.now(),
    },
    {
      item: {
        id: 'keep-1',
        mediaType: 'IMAGE',
        assetRef: 'file:///keep1.jpg',
        sizeBytes: 4000000,
        filename: 'KEEP_ME.JPG',
      },
      decision: 'KEEP',
      timestamp: Date.now(),
    },
  ];

  it('renders categorized staged decisions and allows rescuing an item', () => {
    const onRescueItem = jest.fn();

    let tree: any;
    act(() => {
      tree = renderer.create(
        <CheckoutSummaryScreen
          stagedDecisions={stagedDecisions}
          onRescueItem={onRescueItem}
        />
      );
    });

    const root = tree.root;

    // Rescue DELETE_ME.JPG
    const rescueBtn = root.findByProps({
      accessibilityLabel: 'Rescue DELETE_ME.JPG from checkout',
    });
    expect(rescueBtn).toBeDefined();

    act(() => {
      rescueBtn.props.onPress();
    });
    expect(onRescueItem).toHaveBeenCalledWith(stagedDecisions[0].item);
  });

  it('executes commit and renders batch commit summary', async () => {
    const onCommitBatch = jest.fn().mockResolvedValue({
      totalRequested: 3,
      succeeded: 3,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 27000000,
      results: [],
    });

    let tree: any;
    act(() => {
      tree = renderer.create(
        <CheckoutSummaryScreen
          stagedDecisions={stagedDecisions}
          onCommitBatch={onCommitBatch}
        />
      );
    });

    const root = tree.root;
    const commitBtn = root.find(
      (node: any) =>
        typeof node.props?.accessibilityHint === 'string' &&
        node.props.accessibilityHint.includes('Applies platform mutations')
    );
    expect(commitBtn).toBeDefined();

    await act(async () => {
      await commitBtn.props.onPress();
    });

    expect(onCommitBatch).toHaveBeenCalledWith(stagedDecisions);

    // Summary screen should now render "Batch Commit Complete"
    const summaryTitle = root.findByProps({ children: 'Batch Commit Complete' });
    expect(summaryTitle).toBeDefined();
  });

  describe('UI Copy & Platform Disclosures', () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;

    afterEach(() => {
      (Platform as any).OS = originalOS;
      Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
    });

    it('renders platform-appropriate recovery warning for Android 11+ (API 30+)', () => {
      (Platform as any).OS = 'android';
      Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen stagedDecisions={stagedDecisions} />
        );
      });

      const root = tree.root;
      const warningTextNode = root.find(
        (node: any) =>
          typeof node.props?.children === 'string' &&
          node.props.children.includes('Android Storage:')
      );

      expect(warningTextNode).toBeDefined();
      const warning = warningTextNode.props.children;
      expect(warning).toContain('MediaStore System Trash');
      expect(warning).toContain('system permission dialog');
      expect(warning).not.toContain('30 days');
    });

    it('renders platform-appropriate recovery warning for Android 10 (API 29 permanent deletion)', () => {
      (Platform as any).OS = 'android';
      Object.defineProperty(Platform, 'Version', { value: 29, configurable: true });

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen stagedDecisions={stagedDecisions} />
        );
      });

      const root = tree.root;
      const warningTextNode = root.find(
        (node: any) =>
          typeof node.props?.children === 'string' &&
          node.props.children.includes('Android Storage:')
      );

      expect(warningTextNode).toBeDefined();
      const warning = warningTextNode.props.children;
      expect(warning).toContain('permanently deleted');
      expect(warning).toContain('Android 10 does not support system trash');
      expect(warning).toContain('system permission dialog');
      expect(warning).not.toContain('30 days');
    });

    it('renders platform-appropriate recovery warning for iOS', () => {
      Platform.OS = 'ios';

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen stagedDecisions={stagedDecisions} />
        );
      });

      const root = tree.root;
      const warningTextNode = root.find(
        (node: any) =>
          typeof node.props?.children === 'string' &&
          node.props.children.includes('Apple Photos:')
      );

      expect(warningTextNode).toBeDefined();
      const warning = warningTextNode.props.children;
      expect(warning).toContain('Recently Deleted');
      expect(warning).toContain('retention and recovery managed by iOS');
      expect(warning).not.toContain('30 days');
      expect(warning).not.toContain('MediaStore trash');
    });

    it('invokes commitAdapter.getPlatformRecoveryDescription when adapter is passed', () => {
      const mockAdapter: ICommitAdapter = {
        commitBatch: jest.fn(),
        canTrash: jest.fn().mockReturnValue(true),
        getPlatformRecoveryDescription: jest.fn().mockReturnValue('Adapter recovery copy'),
      };

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen
            stagedDecisions={stagedDecisions}
            commitAdapter={mockAdapter}
          />
        );
      });

      expect(mockAdapter.getPlatformRecoveryDescription).toHaveBeenCalled();
    });
  });

  describe('User Cancellation vs System Failure Banner Disclosures', () => {
    it('shows clear cancellation banner when user cancels OS consent dialog', async () => {
      const onCommitBatch = jest.fn().mockResolvedValue({
        totalRequested: 2,
        succeeded: 0,
        failed: 0,
        denied: 2,
        totalReclaimedBytes: 0,
        results: [
          {
            mediaId: 'del-1',
            decision: 'DELETE',
            outcome: 'DENIED',
            reclaimedBytes: 0,
            error: 'User denied system permission prompt',
          },
        ],
      });

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen
            stagedDecisions={stagedDecisions}
            onCommitBatch={onCommitBatch}
          />
        );
      });

      const root = tree.root;
      const commitBtn = root.find(
        (node: any) =>
          typeof node.props?.accessibilityHint === 'string' &&
          node.props.accessibilityHint.includes('Applies platform mutations')
      );

      await act(async () => {
        await commitBtn.props.onPress();
      });

      // Verify cancellation banner
      const banner = root.findByProps({
        accessibilityLabel:
          'Changes were not applied because system authorization was cancelled. Your originals are untouched.',
      });
      expect(banner).toBeDefined();

      const bannerTextNode = root.findByProps({
        children:
          'Changes were not applied because system authorization was cancelled. Your originals are untouched.',
      });
      expect(bannerTextNode).toBeDefined();

      // Title shows Authorization Cancelled
      const cancelledTitles = root.findAllByProps({ children: 'Authorization Cancelled' });
      expect(cancelledTitles.length).toBeGreaterThanOrEqual(1);

      // Retry button is available
      const retryBtn = root.findByProps({
        accessibilityLabel: 'Review and adjust staged decisions to retry',
      });
      expect(retryBtn).toBeDefined();

      // Press retry returns to staged decisions list
      act(() => {
        retryBtn.props.onPress();
      });

      const checkoutTitle = root.findByProps({ children: 'Checkout Summary' });
      expect(checkoutTitle).toBeDefined();
    });

    it('differentiates system failure from user cancellation', async () => {
      const onCommitBatch = jest.fn().mockResolvedValue({
        totalRequested: 3,
        succeeded: 1,
        failed: 1,
        denied: 1,
        totalReclaimedBytes: 4000000,
        results: [
          {
            mediaId: 'keep-1',
            decision: 'KEEP',
            outcome: 'KEPT',
            reclaimedBytes: 0,
          },
          {
            mediaId: 'cmp-1',
            decision: 'COMPRESS',
            outcome: 'FAILED',
            reclaimedBytes: 0,
            error: 'IO Error encoding image',
          },
          {
            mediaId: 'del-1',
            decision: 'DELETE',
            outcome: 'DENIED',
            reclaimedBytes: 0,
            error: 'OS Consent Denied',
          },
        ],
      });

      let tree: any;
      act(() => {
        tree = renderer.create(
          <CheckoutSummaryScreen
            stagedDecisions={stagedDecisions}
            onCommitBatch={onCommitBatch}
          />
        );
      });

      const root = tree.root;
      const commitBtn = root.find(
        (node: any) =>
          typeof node.props?.accessibilityHint === 'string' &&
          node.props.accessibilityHint.includes('Applies platform mutations')
      );

      await act(async () => {
        await commitBtn.props.onPress();
      });

      // Shows cancellation banner
      const cancellationBanner = root.findByProps({
        accessibilityLabel:
          'Changes were not applied because system authorization was cancelled. Your originals are untouched.',
      });
      expect(cancellationBanner).toBeDefined();

      // Shows error banner
      const errorBanner = root.findByProps({
        accessibilityLabel:
          '1 item encountered a system error during processing. Originals remain untouched.',
      });
      expect(errorBanner).toBeDefined();

      // Breakdown table differentiates them
      const failureLabel = root.findByProps({ children: 'System Failure (Failed)' });
      expect(failureLabel).toBeDefined();

      const cancelledLabel = root.findByProps({
        children: 'Authorization Cancelled (Denied)',
      });
      expect(cancelledLabel).toBeDefined();
    });
  });
});
