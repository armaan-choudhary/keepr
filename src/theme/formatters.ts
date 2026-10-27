/**
 * Utility formatters for Keepr's media metadata and storage calculations.
 */

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (isNaN(bytes) || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  const value = (bytes / Math.pow(k, index)).toFixed(dm);

  // Strip trailing zeros if decimals is positive, e.g. "6.0 MB" -> "6 MB"
  const formattedValue = value.replace(/\.0+$/, '');
  return `${formattedValue} ${sizes[index]}`;
}

export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return '—';
  return `${width} × ${height}`;
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(timestamp?: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || isNaN(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const padSecs = secs < 10 ? `0${secs}` : `${secs}`;

  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const padMins = remMins < 10 ? `0${remMins}` : `${remMins}`;
    return `${hours}:${padMins}:${padSecs}`;
  }

  return `${mins}:${padSecs}`;
}

export function calculateEstimatedSavings(
  originalBytes: number,
  compressionRatio: number = 0.85
): {
  targetBytes: number;
  savedBytes: number;
  percent: number;
  label: string;
} {
  const targetBytes = Math.max(0, Math.round(originalBytes * (1 - compressionRatio)));
  const savedBytes = Math.max(0, originalBytes - targetBytes);
  const percent = Math.round(compressionRatio * 100);

  return {
    targetBytes,
    savedBytes,
    percent,
    label: `${formatBytes(originalBytes)} ➔ ${formatBytes(targetBytes)} (-${percent}%)`,
  };
}
