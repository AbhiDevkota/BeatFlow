export type SourceQuality = 'DOLBY_ATMOS' | 'HI_RES_LOSSLESS' | 'LOSSLESS' | 'HIGH_QUALITY';

export function parseSourceQuality(input: string | null | undefined): SourceQuality | null {
  if (!input) return null;
  const upper = input.toUpperCase();
  if (upper.includes('DOLBY') || upper.includes('EAC3') || upper.includes('EC3') || upper.includes('ATMOS')) {
    return 'DOLBY_ATMOS';
  }
  if (
    upper.includes('HI-RES') ||
    upper.includes('HIRES') ||
    upper.includes('24-BIT') ||
    upper.includes('96') ||
    upper.includes('192')
  ) {
    return 'HI_RES_LOSSLESS';
  }
  if (upper.includes('LOSSLESS') || upper.includes('FLAC') || upper.includes('ALAC') || upper.includes('WAV')) {
    return 'LOSSLESS';
  }
  if (upper.includes('HIGH') || upper.includes('320') || upper.includes('HQ')) {
    return 'HIGH_QUALITY';
  }
  return null;
}
