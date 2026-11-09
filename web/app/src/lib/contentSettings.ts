import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StreamingQuality = 'high' | 'normal' | 'saver';
export type AppFontFamily = 'dm-sans' | 'sf-pro' | 'system';

export interface ContentSettingsState {
  streamingQuality: StreamingQuality;
  directSource: boolean;
  loudnessNormalization: boolean;
  skipSilence: boolean;
  preferAudioCuts: boolean;
  fontFamily: AppFontFamily;
  dynamicTint: boolean;
  reduceAnimation: boolean;

  setStreamingQuality: (quality: StreamingQuality) => void;
  setDirectSource: (enabled: boolean) => void;
  setLoudnessNormalization: (enabled: boolean) => void;
  setSkipSilence: (enabled: boolean) => void;
  setPreferAudioCuts: (enabled: boolean) => void;
  setFontFamily: (font: AppFontFamily) => void;
  setDynamicTint: (enabled: boolean) => void;
  setReduceAnimation: (enabled: boolean) => void;
}

export function applyFont(font: AppFontFamily) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-font', font);
}

export const useContentSettings = create<ContentSettingsState>()(
  persist(
    (set) => ({
      streamingQuality: 'high',
      directSource: true,
      loudnessNormalization: true,
      skipSilence: false,
      preferAudioCuts: true,
      fontFamily: 'dm-sans',
      dynamicTint: true,
      reduceAnimation: false,

      setStreamingQuality: (streamingQuality) => set({ streamingQuality }),
      setDirectSource: (directSource) => set({ directSource }),
      setLoudnessNormalization: (loudnessNormalization) => set({ loudnessNormalization }),
      setSkipSilence: (skipSilence) => set({ skipSilence }),
      setPreferAudioCuts: (preferAudioCuts) => set({ preferAudioCuts }),
      setFontFamily: (fontFamily) => {
        set({ fontFamily });
        applyFont(fontFamily);
      },
      setDynamicTint: (dynamicTint) => set({ dynamicTint }),
      setReduceAnimation: (reduceAnimation) => set({ reduceAnimation }),
    }),
    {
      name: 'beatflow:content-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.fontFamily) applyFont(state.fontFamily);
      },
    },
  ),
);

// Initial application of font on load
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('beatflow:content-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.fontFamily) applyFont(parsed.state.fontFamily);
    }
  } catch {
    // Ignore parse errors
  }
}
