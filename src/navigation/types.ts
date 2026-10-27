import { MediaItem, CompressionCandidate, TriageDecision } from '../platform/contracts';

export type RootTabParamList = {
  TriageTab: undefined;
  CollectionsTab: undefined;
  DuplicatesTab: undefined;
  StatsTab: undefined;
  SettingsTab: undefined;
};

export interface StagedItemDecision {
  item: MediaItem;
  decision: TriageDecision;
  candidate?: CompressionCandidate;
  timestamp: number;
}

export type RootStackParamList = {
  MainTabs: undefined;
  TriageDeck: { initialQueue?: string };
  CheckoutSummary: {
    stagedDecisions: StagedItemDecision[];
    onCommitSuccess?: () => void;
  };
  BeforeAfterCompareModal: {
    original: MediaItem;
    candidate?: CompressionCandidate;
  };
};
