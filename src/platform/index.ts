import { Platform } from 'react-native';
import {
  IMediaLibraryAdapter,
  ICompressorAdapter,
  ICommitAdapter,
  IBackgroundJobAdapter,
} from './contracts';

// Lazy loader for platform adapters
export function getPlatformMediaLibrary(): IMediaLibraryAdapter {
  if (Platform.OS === 'android') {
    const { AndroidMediaLibraryAdapter } = require('./android');
    return new AndroidMediaLibraryAdapter();
  } else if (Platform.OS === 'ios') {
    const { IOSMediaLibraryAdapter } = require('./ios');
    return new IOSMediaLibraryAdapter();
  }
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}

export function getPlatformCompressor(): ICompressorAdapter {
  if (Platform.OS === 'android') {
    const { AndroidCompressorAdapter } = require('./android');
    return new AndroidCompressorAdapter();
  } else if (Platform.OS === 'ios') {
    const { IOSCompressorAdapter } = require('./ios');
    return new IOSCompressorAdapter();
  }
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}

export function getPlatformCommit(): ICommitAdapter {
  if (Platform.OS === 'android') {
    const { AndroidCommitAdapter } = require('./android');
    return new AndroidCommitAdapter();
  } else if (Platform.OS === 'ios') {
    const { IOSCommitAdapter } = require('./ios');
    return new IOSCommitAdapter();
  }
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}

export function getPlatformBackgroundJob(): IBackgroundJobAdapter {
  if (Platform.OS === 'android') {
    const { AndroidBackgroundJobAdapter } = require('./android');
    return new AndroidBackgroundJobAdapter();
  } else if (Platform.OS === 'ios') {
    const { IOSBackgroundJobAdapter } = require('./ios');
    return new IOSBackgroundJobAdapter();
  }
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}

export * from './contracts';
