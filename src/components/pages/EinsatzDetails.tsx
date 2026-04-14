'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MapIcon from '@mui/icons-material/Map';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShareIcon from '@mui/icons-material/Share';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { StorageReference } from 'firebase/storage';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createCustomFirebaseTokenForFirecall } from '../../app/actions/auth';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId, useFirecallSelect } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useVehicles from '../../hooks/useVehicles';
import { useAuditLog } from '../../hooks/useAuditLog';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallExport from '../firebase/FirecallExport';
import { firestore } from '../firebase/firebase';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
} from '../firebase/firestore';
import DownloadAllButton from '../inputs/DownloadAllButton';
import FileDisplay from '../inputs/FileDisplay';
import FileUploader from '../inputs/FileUploader';
import { KostenersatzList } from '../Kostenersatz';
import {
  getBlaulichtSmsAlarmById,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';
import AlarmCard from '../../app/blaulicht-sms/AlarmCard';
import CrewAssignmentBoard from './CrewAssignmentBoard';
import EinsatzorteWrapper from './EinsatzorteWrapper';
import EinsatzTagebuchWrapper from './EinsatzTagebuchWrapper';
import StrengthTable from './StrengthTable';

export default function EinsatzDetails() {
  const firecallId = useFirecallId();
  const setFirecallId = useFirecallSelect();
  const { isAdmin, email, myGroups } = useFirebaseLogin();
  const logChange = useAuditLog();
  const { displayItems } = useVehicles();
  const [firecall, setFirecall] = useState<Firecall | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [tokenLink, setTokenLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [error, setError] = useState<string>();
  const [alarm, setAlarm] = useState<BlaulichtSmsAlarm | null | undefined>(
    undefined
  );

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

  const blaulichtSmsAlarmId = firecall?.blaulichtSmsAlarmId;
  const firecallGroup = firecall?.group;

  useEffect(() => {
    if (!blaulichtSmsAlarmId || !firecallGroup) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getBlaulichtSmsAlarmById(
          firecallGroup,
          blaulichtSmsAlarmId
        );
        if (!cancelled) setAlarm(result);
      } catch (err) {
        console.error('Failed to load BlaulichtSMS alarm:', err);
        if (!cancelled) setAlarm(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blaulichtSmsAlarmId, firecallGroup]);

  const updateFirecall = useCallback(
    async (fc: Firecall) => {
      await setDoc(
        doc(firestore, FIRECALL_COLLECTION_ID, '' + fc.id),
        { ...fc, updatedAt: new Date().toISOString(), updatedBy: email },
        { merge: true }
      );
      logChange({
        action: 'update',
        elementType: 'firecall',
        elementId: fc.id || '',
        elementName: fc.name || '',
        firecallId: fc.id,
        newValue: { name: fc.name, description: fc.description, date: fc.date },
      });
      setFirecall(fc);
    },
    [email, logChange]
  );

  const createLink = useCallback(async (fcId: string) => {
    setError('');
    setCreatingLink(true);
    const token = await createCustomFirebaseTokenForFirecall(fcId);
    if (token.token) {
      const link = `${window.location.origin}/einsatz/${fcId}?token=${token.token}`;
      setTokenLink(link);
      try {
        await navigator.clipboard?.writeText(link);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } else {
      setError(`Token konnte nicht erstellt werden: ${token.error}`);
    }
    setCreatingLink(false);
  }, []);

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

  if (loading) return <CircularProgress sx={{ m: 4 }} />;
  if (!firecall) return <Typography sx={{ m: 2 }}>Einsatz nicht gefunden</Typography>;

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {firecall.name}
      </Typography>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Tooltip title="Karte öffnen">
          <Button
            size="small"
            variant="contained"
            startIcon={<MapIcon />}
            component={Link}
            href={`/einsatz/${firecall.id}`}
            onClick={() => {
              if (setFirecallId && firecall.id) {
                setFirecallId(firecall.id);
              }
            }}
          >
            Karte
          </Button>
        </Tooltip>
        {firecall.id && <FirecallExport firecallId={firecall.id} />}
        <Tooltip title="Bearbeiten">
          <IconButton size="small" onClick={() => setDisplayUpdateDialog(true)}>
            <EditIcon />
          </IconButton>
        </Tooltip>
        {isAdmin && (
          <Tooltip title="Löschen">
            <IconButton
              size="small"
              onClick={() => setIsConfirmOpen(true)}
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        )}
        {creatingLink ? (
          <CircularProgress size={24} sx={{ mx: 1 }} />
        ) : (
          <Tooltip title="Link für anonymen Zugriff erstellen">
            <IconButton
              size="small"
              onClick={() => {
                if (firecall.id) createLink(firecall.id);
              }}
            >
              <ShareIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Zu Kostenersatz springen">
          <IconButton
            size="small"
            onClick={() => document.getElementById('kostenersatz-section')?.scrollIntoView({ behavior: 'smooth' })}
            color="primary"
          >
            <ReceiptLongIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {tokenLink && (
        <Box sx={{ mb: 2 }}>
          {copied ? (
            <Typography variant="body2" color="success.main">
              Link in Zwischenablage kopiert
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Link konnte nicht kopiert werden. Bitte manuell kopieren:
            </Typography>
          )}
          <Link href={tokenLink} target="_blank">
            {tokenLink.substring(0, 100)}...
          </Link>
        </Box>
      )}
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {/* Einsatz info */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {firecall.group && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Gruppe
            </Typography>
            <Typography>
              {myGroups.find((g) => g.id === firecall.group)?.name || firecall.group}
            </Typography>
          </Grid>
        )}
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

      {/* BlaulichtSMS Details */}
      {firecall.blaulichtSmsAlarmId && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom>
            BlaulichtSMS
          </Typography>
          {alarm === undefined ? (
            <CircularProgress size={24} />
          ) : alarm ? (
            <AlarmCard alarm={alarm} defaultExpandRecipients={false} />
          ) : (
            <Typography color="text.secondary">
              BlaulichtSMS-Alarm konnte nicht geladen werden (Alarm-ID:{' '}
              {firecall.blaulichtSmsAlarmId}). Möglicherweise sind die
              BlaulichtSMS-Zugangsdaten nicht konfiguriert oder der Alarm ist
              nicht mehr verfügbar.
            </Typography>
          )}
        </Box>
      )}

      {/* Attachments */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" gutterBottom>
          Anhänge
        </Typography>
        {firecall.attachments && firecall.attachments.length > 0 && (
          <DownloadAllButton urls={firecall.attachments} />
        )}
      </Box>
      <FileUploader onFileUploadComplete={handleFileUploadComplete} />
      {firecall.attachments && firecall.attachments.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 2,
            mt: 2,
          }}
        >
          {firecall.attachments.map((url) => (
            <Box key={url} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FileDisplay
                url={url}
                edit
                onDeleteCallback={handleDeleteAttachment}
                imageSize={200}
              />
            </Box>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Keine Anhänge vorhanden
        </Typography>
      )}

      {/* Einsatzorte */}
      <Box sx={{ mt: 3 }}>
        <EinsatzorteWrapper />
      </Box>

      {/* Einsatzmittel */}
      {displayItems.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
            Einsatzmittel
          </Typography>
          <StrengthTable items={displayItems} />
        </>
      )}

      {/* Besatzung */}
      <Box sx={{ mt: 3 }}>
        <CrewAssignmentBoard alarm={alarm} />
      </Box>

      {/* Einsatztagebuch */}
      <Box sx={{ mt: 3 }}>
        <EinsatzTagebuchWrapper />
      </Box>

      {/* Kostenersatz */}
      {firecall.id && (
        <Box id="kostenersatz-section" sx={{ mt: 3 }}>
          <KostenersatzList firecallId={firecall.id} />
        </Box>
      )}

      {/* Dialogs */}
      {displayUpdateDialog && (
        <EinsatzDialog
          onClose={(fc) => {
            setDisplayUpdateDialog(false);
            if (fc) updateFirecall(fc);
          }}
          einsatz={firecall}
        />
      )}
      {isConfirmOpen && (
        <ConfirmDialog
          title={`Einsatz ${firecall.name} löschen`}
          text={`Einsatz ${firecall.name} wirklich löschen?`}
          onConfirm={(result) => {
            setIsConfirmOpen(false);
            if (result) {
              updateFirecall({ ...firecall, deleted: true });
            }
          }}
        />
      )}
    </Box>
  );
}
