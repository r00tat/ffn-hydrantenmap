'use client';

import { useMemo } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Badge,
  Box,
  Typography,
} from '@mui/material';
import Image from 'next/image';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  NON_DISPLAYABLE_ITEMS,
} from '../firebase/firestore';
import { fcItemNames, getItemClass } from '../FirecallItems/elements';
import { iconKeys } from '../FirecallItems/elements/icons';
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
    // Track tactical sign sub-groups for markers
    const zeichenCounts = new Map<string, number>();
    for (const record of records) {
      const type = record.type || 'fallback';
      // Sub-group markers by tactical sign
      const zeichen = type === 'marker' ? (record as any).zeichen || '' : '';
      if (zeichen) {
        zeichenCounts.set(zeichen, (zeichenCounts.get(zeichen) || 0) + 1);
      } else {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
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

    // Add tactical sign sub-groups
    for (const [zeichen, count] of zeichenCounts.entries()) {
      const zeichenIcon = iconKeys[zeichen];
      const iconUrl = zeichenIcon?.url || '/icons/marker.svg';
      result.push({
        type: `marker:${zeichen}`,
        label: zeichen.replace(/_/g, ' '),
        iconUrl,
        isApiIcon: false,
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
      <Accordion defaultExpanded disableGutters>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.75, alignItems: 'center' } }}
        >
          <Badge
            badgeContent={records.length}
            color="primary"
            max={999}
            sx={{ '& .MuiBadge-badge': { right: -20, top: 10 } }}
          >
            <Typography variant="subtitle2">Zusammenfassung</Typography>
          </Badge>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1, pt: 0 }}>
          {summary.map((entry) => (
            <Box
              key={entry.type}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                py: 0.5,
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
                variant="body2"
                sx={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.label}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {entry.count}
              </Typography>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
