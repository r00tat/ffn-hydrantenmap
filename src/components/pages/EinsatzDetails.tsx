'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { StorageReference } from 'firebase/storage';
import { useCallback, useEffect, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId } from '../../hooks/useFirecall';
import { firestore } from '../firebase/firebase';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
} from '../firebase/firestore';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';

export default function EinsatzDetails() {
  const firecallId = useFirecallId();
  const [firecall, setFirecall] = useState<Firecall | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId || firecallId === 'unknown') return;
    (async () => {
      const docSnap = await getDoc(
        doc(firestore, FIRECALL_COLLECTION_ID, firecallId)
      );
      if (docSnap.exists()) {
        setFirecall({ id: docSnap.id, ...docSnap.data() } as Firecall);
      }
      setLoading(false);
    })();
  }, [firecallId]);

  const handleFileUploadComplete = useCallback(
    async (refs: StorageReference[]) => {
      const newUrls = refs.map((r) => r.toString());
      setFirecall((prev) =>
        prev
          ? {
              ...prev,
              attachments: [...(prev.attachments || []), ...newUrls],
            }
          : prev
      );
      if (firecallId && firecallId !== 'unknown') {
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
          { attachments: arrayUnion(...newUrls) },
          { merge: true }
        );
      }
    },
    [firecallId]
  );

  const handleDeleteAttachment = useCallback(
    async (deletedUrl: string) => {
      setFirecall((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments?.filter((u) => u !== deletedUrl),
            }
          : prev
      );
      if (firecallId && firecallId !== 'unknown') {
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
          { attachments: arrayRemove(deletedUrl) },
          { merge: true }
        );
      }
    },
    [firecallId]
  );

  if (loading) return <CircularProgress />;
  if (!firecall) return <Typography>Einsatz nicht gefunden</Typography>;

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {firecall.name}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {firecall.fw && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Feuerwehr
            </Typography>
            <Typography>{firecall.fw}</Typography>
          </Grid>
        )}
        {firecall.date && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Alarmierung
            </Typography>
            <Typography>{formatTimestamp(firecall.date)}</Typography>
          </Grid>
        )}
        {firecall.eintreffen && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Eintreffen
            </Typography>
            <Typography>{formatTimestamp(firecall.eintreffen)}</Typography>
          </Grid>
        )}
        {firecall.abruecken && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Abrücken
            </Typography>
            <Typography>{formatTimestamp(firecall.abruecken)}</Typography>
          </Grid>
        )}
        {firecall.description && (
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" color="text.secondary">
              Beschreibung
            </Typography>
            <Typography>{firecall.description}</Typography>
          </Grid>
        )}
      </Grid>

      <Typography variant="h5" gutterBottom>
        Anhänge
      </Typography>
      <FileUploader onFileUploadComplete={handleFileUploadComplete} />
      {firecall.attachments && firecall.attachments.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
          {firecall.attachments.map((url) => (
            <FileDisplay
              key={url}
              url={url}
              showTitleIfImage
              edit
              onDeleteCallback={handleDeleteAttachment}
            />
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Keine Anhänge vorhanden
        </Typography>
      )}
    </Box>
  );
}
