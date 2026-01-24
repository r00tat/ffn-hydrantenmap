'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Badge,
  Box,
  Chip,
  IconButton,
  Link as MuiLink,
  Tooltip,
  Typography,
} from '@mui/material';
import moment from 'moment';
import Link from 'next/link';
import React, { useState } from 'react';
import { Diary } from '../firebase/firestore';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { useDiaryEntries } from '../../hooks/useDiaryEntries';
import { useMapEditorCanEdit } from '../../hooks/useMapEditor';

const STORAGE_KEY = 'sidebar-diary-collapsed';
const DISPLAY_LIMIT = 5;

function getArtColor(art?: string): 'default' | 'primary' | 'warning' {
  switch (art) {
    case 'B':
      return 'primary';
    case 'F':
      return 'warning';
    default:
      return 'default';
  }
}

function getArtLabel(art?: string): string {
  switch (art) {
    case 'B':
      return 'B';
    case 'F':
      return 'F';
    case 'M':
    default:
      return 'M';
  }
}

function formatTime(datum: string): string {
  return moment(datum, 'DD.MM.YYYY HH:mm').format('HH:mm');
}

interface DiaryEntryRowProps {
  diary: Diary;
  isExpanded: boolean;
  onClick: () => void;
  canEdit: boolean;
}

function DiaryEntryRow({ diary, isExpanded, onClick, canEdit }: DiaryEntryRowProps) {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasVonAn = diary.von || diary.an;

  return (
    <>
      <Box
        onClick={onClick}
        sx={{
          p: 1,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          backgroundColor: isExpanded ? 'action.selected' : undefined,
        }}
      >
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={getArtLabel(diary.art)}
            color={getArtColor(diary.art)}
            size="small"
            sx={{
              minWidth: 24,
              height: 20,
              '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40 }}>
            {formatTime(diary.datum)}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: isExpanded ? 'normal' : 'nowrap',
            }}
          >
            {diary.name}
          </Typography>
        </Box>

        {/* Von -> An row */}
        {hasVonAn && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ml: 4, display: 'block' }}
          >
            {diary.von} {diary.von && diary.an && '→'} {diary.an}
          </Typography>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <Box sx={{ mt: 1.5, ml: 1 }}>
            {diary.beschreibung && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Beschreibung:
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {diary.beschreibung}
                </Typography>
              </Box>
            )}

            {diary.erledigt && (
              <Typography variant="caption" color="text.secondary">
                Erledigt: {diary.erledigt}
              </Typography>
            )}

            {canEdit && (
              <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                <Tooltip title="Bearbeiten">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUpdateDialog(true);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Löschen">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {showUpdateDialog && (
        <FirecallItemUpdateDialog
          item={diary.original || diary}
          allowTypeChange={false}
          callback={() => setShowUpdateDialog(false)}
        />
      )}

      {showDeleteDialog && (
        <DeleteFirecallItemDialog
          item={diary.original || diary}
          callback={() => setShowDeleteDialog(false)}
        />
      )}
    </>
  );
}

function getInitialAccordionState(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  // stored 'true' means collapsed, so we return the inverse for expanded
  return stored !== 'true';
}

export default function SidebarDiaryPreview() {
  const { entries, totalCount } = useDiaryEntries(DISPLAY_LIMIT);
  const canEdit = useMapEditorCanEdit();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [accordionExpanded, setAccordionExpanded] = useState(getInitialAccordionState);

  const handleAccordionChange = (_: React.SyntheticEvent, expanded: boolean) => {
    setAccordionExpanded(expanded);
    localStorage.setItem(STORAGE_KEY, expanded ? 'false' : 'true');
  };

  const handleEntryClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <Accordion
        expanded={accordionExpanded}
        onChange={handleAccordionChange}
        disableGutters
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.75 } }}
        >
          <Badge
            badgeContent={totalCount}
            color="primary"
            max={99}
            sx={{ '& .MuiBadge-badge': { right: -16, top: 10 } }}
          >
            <Typography variant="subtitle2">Tagebuch</Typography>
          </Badge>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1, pt: 0 }}>
          {entries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              Keine Einträge
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {entries.map((diary) => (
                <DiaryEntryRow
                  key={diary.id}
                  diary={diary}
                  isExpanded={expandedId === diary.id}
                  onClick={() => handleEntryClick(diary.id!)}
                  canEdit={canEdit}
                />
              ))}
            </Box>
          )}

          <Box sx={{ mt: 1, textAlign: 'center' }}>
            <MuiLink
              component={Link}
              href="/tagebuch"
              variant="body2"
              sx={{ textDecoration: 'none' }}
            >
              Mehr anzeigen →
            </MuiLink>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
