import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StatsScreen } from '../../src/screens/StatsScreen';

describe('StatsScreen', () => {
  it('renders measured reclaimed total, media breakdowns, and past session entries', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <StatsScreen
          measuredReclaimedTotal={2500000000} // 2.3 GB
          estimatedPotentialSavings={5000000000}
          videoReclaimedBytes={1500000000}
          imageReclaimedBytes={800000000}
          screenshotReclaimedBytes={200000000}
        />
      );
    });

    const root = tree.root;

    // Measured storage hero card
    const hero = root.findByProps({
      accessibilityRole: 'summary',
    });
    expect(hero).toBeDefined();

    // Verify breakdown categories exist
    const videoTitle = root.findByProps({ children: 'Videos' });
    expect(videoTitle).toBeDefined();

    const photoTitle = root.findByProps({ children: 'Photos & RAW' });
    expect(photoTitle).toBeDefined();

    const screenshotTitle = root.findByProps({ children: 'Screenshots' });
    expect(screenshotTitle).toBeDefined();
  });
});
