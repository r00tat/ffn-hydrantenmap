'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import DeleteFirecallItemDialog from '../FirecallItems/DeleteFirecallItemDialog';
import FirecallItemUpdateDialog from '../FirecallItems/FirecallItemUpdateDialog';
import { Diary } from '../firebase/firestore';

/**
 * Bearbeiten und Löschen eines Tagebucheintrags.
 *
 * Abgeleitete Einträge („… alarmiert / eingetroffen / abgerückt") sind kein
 * eigenes Dokument, sondern entstehen aus den Zeitfeldern eines Fahrzeugs
 * oder einer Einheit. Der Stift öffnet dort deshalb den Dialog des
 * Einsatzmittels; einen Löschknopf gibt es bewusst nicht, er löschte das
 * ganze Fahrzeug.
 */
export default function DiaryButtons({ diary }: { diary: Diary }) {
  const t = useTranslations('tagebuch');
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);

  const source = !diary.editable ? diary.original : undefined;
  if (!diary.editable && !source) return null;

  return (
    <>
      <Tooltip
        title={
          source
            ? t('editSource', { name: source.name })
            : t('editEntry', { name: diary.name })
        }
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            setDisplayUpdateDialog(true);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
      {!source && (
        <Tooltip title={t('deleteEntry', { name: diary.name })}>
          <IconButton
            color="warning"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialog(true);
            }}
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      )}
      {displayUpdateDialog && (
        <FirecallItemUpdateDialog
          allowTypeChange={false}
          item={source ?? diary}
          callback={() => {
            setDisplayUpdateDialog(false);
          }}
        />
      )}

      {deleteDialog && (
        <DeleteFirecallItemDialog
          item={diary.original || diary}
          callback={() => {
            setDeleteDialog(false);
          }}
        />
      )}
    </>
  );
}
