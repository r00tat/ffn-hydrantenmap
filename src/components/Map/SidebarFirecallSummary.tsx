'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import Image from 'next/image';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  filterDisplayableItems,
  FirecallItem,
  NON_DISPLAYABLE_ITEMS,
} from '../firebase/firestore';
import { fcItemNames, getItemClass } from '../FirecallItems/elements';
import { useHistoryPathSegments } from '../../hooks/useMapEditor';

interface TypeSummary {
  type: string;
  label: string;
  iconUrl: string;
  isApiIcon: boolean;
  count: number;
}

export default function SidebarFirecallSummary() {
  const firecallId = useFirecallId();
  const historyPathSegments = useHistoryPathSegments();

  const filterFn = useMemo(
    () => (e: FirecallItem) =>
      e.deleted !== true && NON_DISPLAYABLE_ITEMS.indexOf(e.type) < 0,
    []
  );

  const records = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints: [],
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn,
  });

  const summary = useMemo(() => {
    const typeCounts = new Map<string, number>();
    for (const record of records) {
      const type = record.type || 'fallback';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    const result: TypeSummary[] = [];
    for (const [type, count] of typeCounts.entries()) {
      const cls = getItemClass(type);
      const instance = new cls();
      const icon = instance.icon();
      const iconUrl = icon.options.iconUrl;
      result.push({
        type,
        label: fcItemNames[type] || type,
        iconUrl,
        isApiIcon: iconUrl.indexOf('/api') > -1,
        count,
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }, [records]);

  if (firecallId === 'unknown' || summary.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Einsatz Zusammenfassung
      </Typography>
      {summary.map((entry) => (
        <Box
          key={entry.type}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            py: 0.25,
          }}
        >
          <Box sx={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {!entry.isApiIcon && (
              <Image
                src={entry.iconUrl}
                alt={entry.label}
                width={16}
                height={16}
              />
            )}
            {entry.isApiIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.iconUrl}
                alt={entry.label}
                width={16}
                height={16}
                style={{ objectFit: 'contain' }}
              />
            )}
          </Box>
          <Typography
            variant="caption"
            fontSize={12}
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.label}
          </Typography>
          <Typography variant="caption" fontSize={12} fontWeight={600}>
            {entry.count}
          </Typography>
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Gesamt: {records.length}
      </Typography>
    </Box>
  );
}
