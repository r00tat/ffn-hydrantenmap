import { useMemo } from 'react';
import { useDiaries } from '../components/pages/EinsatzTagebuch';

/**
 * Hook to get manual diary entries (excludes vehicle events).
 * @param limit - Maximum number of entries to return (default: all)
 * @returns entries (limited) and totalCount (all manual entries)
 */
export function useDiaryEntries(limit?: number) {
  const { diaries } = useDiaries(false); // newest first

  return useMemo(() => {
    // editable = true means manual diary entry, false means vehicle event
    const diaryOnly = diaries.filter((d) => d.editable);
    return {
      entries: limit ? diaryOnly.slice(0, limit) : diaryOnly,
      totalCount: diaryOnly.length,
    };
  }, [diaries, limit]);
}
