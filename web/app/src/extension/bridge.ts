import { isDesktopApp, desktopBridge, type Bridge, type DetectedExtension } from '@bitchord/shared/bridge';
import { queryClient } from '@/lib/queryClient';
import { extensionQueryKey } from './useExtension';

/** The detected extension's bridge, for code outside React; null when it isn't installed. */
export function getBridge(): Bridge | null {
  const fromQuery = queryClient.getQueryData<DetectedExtension | null>(extensionQueryKey)?.bridge;
  if (fromQuery) return fromQuery;
  if (isDesktopApp()) return desktopBridge();
  return null;
}
