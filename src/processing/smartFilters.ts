import { MediaItem } from '../platform/contracts';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const HEAVY_HITTER_THRESHOLD_BYTES = 15 * 1024 * 1024; // 15MB

const SCREENSHOT_PATTERNS = [
  /screenshot/i,
  /screen_shot/i,
  /screencap/i,
  /capture/i,
];

const MESSAGING_PATTERNS = [
  /whatsapp/i,
  /telegram/i,
  /signal/i,
  /wechat/i,
  /messenger/i,
  /viber/i,
  /img-\d{8}-wa/i,
  /vid-\d{8}-wa/i,
];

export class SmartFilters {
  /**
   * Filter 1: "Old Screenshots" (>30 days old)
   * Matches if flagged as screenshot or filename/mime suggests screenshot,
   * AND capturedAt was over 30 days ago.
   */
  static filterOldScreenshots(items: MediaItem[], now = Date.now()): MediaItem[] {
    const cutoff = now - THIRTY_DAYS_MS;

    return items.filter((item) => {
      if (!item.capturedAt || item.capturedAt >= cutoff) {
        return false;
      }

      // Check explicit property or filename/mime heuristic
      const isScreenshot =
        item.filename &&
        SCREENSHOT_PATTERNS.some((pattern) => pattern.test(item.filename!));

      const isMimeScreenshot =
        item.mimeType?.toLowerCase().includes('screenshot');

      return Boolean(isScreenshot || isMimeScreenshot);
    });
  }

  /**
   * Filter 2: "Heavy Hitters" (>15MB)
   * Identifies large media files taking up significant local storage.
   */
  static filterHeavyHitters(
    items: MediaItem[],
    thresholdBytes = HEAVY_HITTER_THRESHOLD_BYTES
  ): MediaItem[] {
    return items
      .filter((item) => typeof item.sizeBytes === 'number' && item.sizeBytes > thresholdBytes)
      .sort((a, b) => b.sizeBytes - a.sizeBytes); // Largest first
  }

  /**
   * Filter 3: "Messaging Media"
   * Best-effort detection of media imported from messaging apps (WhatsApp, Telegram, etc.)
   */
  static filterMessagingMedia(items: MediaItem[]): MediaItem[] {
    return items.filter((item) => {
      const source = (item.sourceAlbumId ?? '').toLowerCase();
      const filename = (item.filename ?? '').toLowerCase();

      return MESSAGING_PATTERNS.some(
        (pattern) => pattern.test(source) || pattern.test(filename)
      );
    });
  }

  /**
   * Filter 4: "On This Day"
   * Media items captured on the same month and day in previous years.
   */
  static filterOnThisDay(items: MediaItem[], referenceDate = new Date()): MediaItem[] {
    const targetMonth = referenceDate.getMonth();
    const targetDay = referenceDate.getDate();
    const targetYear = referenceDate.getFullYear();

    return items.filter((item) => {
      if (!item.capturedAt) return false;

      const itemDate = new Date(item.capturedAt);
      if (isNaN(itemDate.getTime())) return false;

      return (
        itemDate.getFullYear() < targetYear &&
        itemDate.getMonth() === targetMonth &&
        itemDate.getDate() === targetDay
      );
    });
  }

  /**
   * Filter 5: "Month by Month"
   * Groups items into buckets keyed by 'YYYY-MM'.
   */
  static groupByMonth(items: MediaItem[]): Map<string, MediaItem[]> {
    const buckets = new Map<string, MediaItem[]>();

    for (const item of items) {
      if (!item.capturedAt) {
        const unknownList = buckets.get('Unknown') ?? [];
        unknownList.push(item);
        buckets.set('Unknown', unknownList);
        continue;
      }

      const date = new Date(item.capturedAt);
      if (isNaN(date.getTime())) {
        const unknownList = buckets.get('Unknown') ?? [];
        unknownList.push(item);
        buckets.set('Unknown', unknownList);
        continue;
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;

      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }

    return buckets;
  }

  /**
   * Filter by a specific year and month (1-indexed month: 1 = Jan, 12 = Dec).
   */
  static filterByMonth(items: MediaItem[], year: number, month: number): MediaItem[] {
    const targetKey = `${year}-${String(month).padStart(2, '0')}`;
    const grouped = this.groupByMonth(items);
    return grouped.get(targetKey) ?? [];
  }
}
