import { MediaItem, TriageDecision } from '../platform/contracts';

export type GroupType = 'BURST' | 'EXACT_DUPLICATE' | 'SIMILAR';

export interface GroupMember {
  item: MediaItem;
  recommendedDecision: TriageDecision;
  isRepresentative: boolean;
  userOverride?: TriageDecision;
}

export interface MediaGroup {
  id: string;
  type: GroupType;
  members: GroupMember[];
  representativeItem: MediaItem;
  createdAt: number;
}

export interface GroupingOptions {
  burstProximityMs?: number; // default: 2000ms (2 seconds)
  similarSizeRatioThreshold?: number; // default: 0.05 (5% size difference)
}

export class DuplicateBurstGrouping {
  private readonly burstProximityMs: number;
  private readonly similarSizeRatioThreshold: number;
  private readonly groups: Map<string, MediaGroup> = new Map();

  constructor(options?: GroupingOptions) {
    this.burstProximityMs = options?.burstProximityMs ?? 2000;
    this.similarSizeRatioThreshold = options?.similarSizeRatioThreshold ?? 0.05;
  }

  /**
   * Evaluates a quality/priority score for an item to recommend the best representative.
   * Higher score = better candidate to KEEP.
   */
  private scoreItem(item: MediaItem): number {
    let score = 0;

    // Protected items get highest priority
    if (item.isProtected) score += 1_000_000_000;

    // Favorites get high priority
    if (item.isFavorite) score += 10_000_000;

    // Higher resolution is preferred (pixels)
    if (item.width && item.height) {
      score += item.width * item.height;
    }

    // Larger file size (more detail / bitrate) in KB
    if (item.sizeBytes > 0) {
      score += Math.floor(item.sizeBytes / 1024);
    }

    // Has captured timestamp
    if (item.capturedAt) {
      score += 100;
    }

    return score;
  }

  /**
   * Selects the best representative item from a list.
   */
  private selectRepresentative(items: MediaItem[]): MediaItem {
    if (items.length === 0) {
      throw new Error('Cannot select representative from empty list');
    }

    let best = items[0];
    let bestScore = this.scoreItem(best);

    for (let i = 1; i < items.length; i++) {
      const current = items[i];
      const score = this.scoreItem(current);
      if (score > bestScore) {
        best = current;
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * Groups items by exact duplicates (exact sizeBytes and matching dimensions/duration).
   */
  groupExactDuplicates(items: MediaItem[]): MediaGroup[] {
    const sizeMap = new Map<string, MediaItem[]>();

    for (const item of items) {
      const key = `${item.mediaType}_${item.sizeBytes}_${item.width ?? 0}x${item.height ?? 0}_${item.durationSeconds ?? 0}`;
      const list = sizeMap.get(key) ?? [];
      list.push(item);
      sizeMap.set(key, list);
    }

    const createdGroups: MediaGroup[] = [];

    for (const [key, groupItems] of sizeMap.entries()) {
      if (groupItems.length > 1) {
        const representative = this.selectRepresentative(groupItems);
        const groupId = `dup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const members: GroupMember[] = groupItems.map((item) => ({
          item,
          isRepresentative: item.id === representative.id,
          recommendedDecision: item.id === representative.id ? 'KEEP' : 'DELETE',
        }));

        const group: MediaGroup = {
          id: groupId,
          type: 'EXACT_DUPLICATE',
          members,
          representativeItem: representative,
          createdAt: Date.now(),
        };

        this.groups.set(groupId, group);
        createdGroups.push(group);
      }
    }

    return createdGroups;
  }

  /**
   * Groups consecutive burst photos captured within burstProximityMs (default 2s).
   */
  groupBursts(items: MediaItem[]): MediaGroup[] {
    // Only items with capturedAt can form timestamp bursts
    const timedItems = items
      .filter((item) => typeof item.capturedAt === 'number' && item.capturedAt > 0)
      .sort((a, b) => a.capturedAt! - b.capturedAt!);

    const createdGroups: MediaGroup[] = [];
    if (timedItems.length < 2) {
      return createdGroups;
    }

    let currentBurst: MediaItem[] = [timedItems[0]];

    for (let i = 1; i < timedItems.length; i++) {
      const prev = timedItems[i - 1];
      const curr = timedItems[i];

      const timeDiff = curr.capturedAt! - prev.capturedAt!;
      const sameType = curr.mediaType === prev.mediaType;

      if (sameType && timeDiff <= this.burstProximityMs) {
        currentBurst.push(curr);
      } else {
        if (currentBurst.length > 1) {
          const group = this.createBurstGroup(currentBurst);
          createdGroups.push(group);
        }
        currentBurst = [curr];
      }
    }

    if (currentBurst.length > 1) {
      const group = this.createBurstGroup(currentBurst);
      createdGroups.push(group);
    }

    return createdGroups;
  }

  private createBurstGroup(items: MediaItem[]): MediaGroup {
    const representative = this.selectRepresentative(items);
    const groupId = `burst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const members: GroupMember[] = items.map((item) => ({
      item,
      isRepresentative: item.id === representative.id,
      recommendedDecision: item.id === representative.id ? 'KEEP' : 'DELETE',
    }));

    const group: MediaGroup = {
      id: groupId,
      type: 'BURST',
      members,
      representativeItem: representative,
      createdAt: Date.now(),
    };

    this.groups.set(groupId, group);
    return group;
  }

  getGroup(groupId: string): MediaGroup | undefined {
    return this.groups.get(groupId);
  }

  getAllGroups(): MediaGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * User manual override: choose a different representative item in the group.
   */
  setRepresentativeItem(groupId: string, mediaId: string): MediaGroup {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const memberToRep = group.members.find((m) => m.item.id === mediaId);
    if (!memberToRep) {
      throw new Error(`Item ${mediaId} not in group ${groupId}`);
    }

    const updatedMembers = group.members.map((m) => {
      const isRep = m.item.id === mediaId;
      return {
        ...m,
        isRepresentative: isRep,
        recommendedDecision: isRep ? ('KEEP' as TriageDecision) : ('DELETE' as TriageDecision),
      };
    });

    const updatedGroup: MediaGroup = {
      ...group,
      members: updatedMembers,
      representativeItem: memberToRep.item,
    };

    this.groups.set(groupId, updatedGroup);
    return updatedGroup;
  }

  /**
   * User manual override: explicitly change the decision for an item in a group.
   */
  overrideDecision(
    groupId: string,
    mediaId: string,
    decision: TriageDecision
  ): MediaGroup {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const updatedMembers = group.members.map((m) => {
      if (m.item.id === mediaId) {
        return {
          ...m,
          userOverride: decision,
        };
      }
      return m;
    });

    const updatedGroup: MediaGroup = {
      ...group,
      members: updatedMembers,
    };

    this.groups.set(groupId, updatedGroup);
    return updatedGroup;
  }

  /**
   * Remove an item from a group.
   */
  removeFromGroup(groupId: string, mediaId: string): MediaGroup | undefined {
    const group = this.groups.get(groupId);
    if (!group) {
      return undefined;
    }

    const filtered = group.members.filter((m) => m.item.id !== mediaId);
    if (filtered.length <= 1) {
      // If only 1 or 0 items left, dissolve group
      this.groups.delete(groupId);
      return undefined;
    }

    // If representative was removed, pick a new representative
    let representative = group.representativeItem;
    if (representative.id === mediaId) {
      representative = this.selectRepresentative(filtered.map((m) => m.item));
    }

    const updatedMembers = filtered.map((m) => ({
      ...m,
      isRepresentative: m.item.id === representative.id,
      recommendedDecision:
        m.item.id === representative.id ? ('KEEP' as TriageDecision) : ('DELETE' as TriageDecision),
    }));

    const updatedGroup: MediaGroup = {
      ...group,
      members: updatedMembers,
      representativeItem: representative,
    };

    this.groups.set(groupId, updatedGroup);
    return updatedGroup;
  }

  /**
   * Dissolve a group.
   */
  dissolveGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  clear(): void {
    this.groups.clear();
  }
}
