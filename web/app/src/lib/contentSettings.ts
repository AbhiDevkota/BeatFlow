import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StreamingQuality = 'high' | 'normal' | 'saver';

export interface ContentSettingsState {
  streamingQuality: StreamingQuality;
  directSource: boolean;
  setStreamingQuality: (quality: StreamingQuality) => void;
  setDirectSource: (enabled: boolean) => void;
}

export const useContentSettings = create<ContentSettingsState>()(
  persist(
    (set) => ({
      streamingQuality: 'high',
      directSource: true,
      setStreamingQuality: (streamingQuality) => set({ streamingQuality }),
      setDirectSource: (directSource) => set({ directSource }),
    }),
    {
      name: 'beatflow:content-settings',
    },
  ),
);
