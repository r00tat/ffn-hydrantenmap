import { Capacitor } from '@capacitor/core';
import type { BugReportContext } from '../../common/bugReport';
import type { Firecall } from '../firebase/firestore';

interface CollectContextArgs {
  pathname: string;
  firecall?: Firecall;
  buildId: string;
  database: string;
}

export function collectContext({
  pathname,
  firecall,
  buildId,
  database,
}: CollectContextArgs): BugReportContext {
  const w = typeof window !== 'undefined' ? window : (undefined as any);
  const nav = w?.navigator;
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  const context: BugReportContext = {
    url: w?.location?.href ?? '',
    pathname,
    buildId,
    database,
    userAgent: nav?.userAgent ?? '',
    platform,
    isNative,
    viewport: {
      width: w?.innerWidth ?? 0,
      height: w?.innerHeight ?? 0,
    },
    locale: nav?.language ?? '',
  };

  if (firecall?.id && firecall.id !== 'unknown') {
    context.firecallId = firecall.id;
    context.firecallName = firecall.name;
  }
  return context;
}
