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
} from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreClient';
import { StorageReference } from 'firebase/storage';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { useFirecallId, useFirecallSelect } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useVehicles from '../../hooks/useVehicles';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import { useAuditLog } from '../../hooks/useAuditLog';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import FirecallShareDialog from '../firecallShare/FirecallShareDialog';
import { isGroupAdmin } from '../../common/groupPermissions';
import FirecallExport from '../firebase/FirecallExport';
import LagekarteExport from '../firebase/LagekarteExport';
import { firestore } from '../firebase/firebase';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  firecallAlarmIds,
} from '../firebase/firestore';
import DownloadAllButton from '../inputs/DownloadAllButton';
import AttachmentGallery from '../inputs/AttachmentGallery';
import EinsatzDriveFotos from '../drive/EinsatzDriveFotos';
import FileUploader from '../inputs/FileUploader';
import { useSnackbar } from '../providers/SnackbarProvider';
import { KostenersatzList } from '../Kostenersatz';
import {
  getBlaulichtSmsAlarmById,
  BlaulichtSmsAlarm,
} from '../../app/blaulicht-sms/actions';
import AlarmCard from '../../app/blaulicht-sms/AlarmCard';
import EinsatzFahrtenbuch from '../Fahrtenbuch/EinsatzFahrtenbuch';
import CrewAssignmentBoard from './CrewAssignmentBoard';
import EinsatzDetailSection from './EinsatzDetailSection';
import EinsatzorteWrapper from './EinsatzorteWrapper';
import EinsatzTagebuchWrapper from './EinsatzTagebuchWrapper';
import StrengthTable from './StrengthTable';

/**
 * Anker des Kostenersatz-Abschnitts. Unverändert aus der Zeit vor den
 * aufklappbaren Abschnitten, damit bestehende Links weiter dorthin führen.
 */
const KOSTENERSATZ_SECTION_ID = 'kostenersatz-section';

export default function EinsatzDetails() {
  const t = useTranslations('einsatzDetails');
  const tCommon = useTranslations('common');
  const tFahrtenbuch = useTranslations('fahrtenbuch');
  const firecallId = useFirecallId();
  const setFirecallId = useFirecallSelect();
  const { isAdmin, email, myGroups, groups, groupAdmin } =
    useFirebaseLogin();
  const logChange = useAuditLog();
  const showSnackbar = useSnackbar();
  const { displayItems } = useVehicles();
  const [firecall, setFirecall] = useState<Firecall | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayUpdateDialog, setDisplayUpdateDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const canWrite = useFirecallWriteAccess();
  /**
   * Offene Abschnitte. Alle starten zu — die Übersicht oben reicht für den
   * ersten Blick, alles Weitere holt man sich mit einem Klick. Mehrere
   * Abschnitte dürfen gleichzeitig offen sein; im Einsatz braucht man
   * Tagebuch und Besatzung durchaus nebeneinander.
   */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    {}
  );
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[] | undefined>(
    undefined,
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

  const alarmIdsKey = firecall ? firecallAlarmIds(firecall).join(',') : '';
  const firecallGroup = firecall?.group;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!alarmIdsKey || !firecallGroup) {
        if (!cancelled) setAlarms(undefined);
        return;
      }
      const ids = alarmIdsKey.split(',');
      try {
        const results = await Promise.all(
          ids.map((id) => getBlaulichtSmsAlarmById(firecallGroup, id)),
        );
        if (!cancelled) {
          setAlarms(
            results.filter((a): a is BlaulichtSmsAlarm => a !== null),
          );
        }
      } catch (err) {
        console.error('Failed to load BlaulichtSMS alarms:', err);
        if (!cancelled) setAlarms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alarmIdsKey, firecallGroup]);

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

  const handleFileUploadComplete = useCallback(
    async (refs: StorageReference[]) => {
      const newUrls = refs.map((r) => r.toString());
      // No successful uploads (all failed / cancelled): nothing to persist.
      // arrayUnion() would throw with zero arguments, so bail out early. The
      // FileUploader already surfaced the upload error to the user.
      if (newUrls.length === 0) return;
      setFirecall((prev) =>
        prev
          ? {
              ...prev,
              attachments: [...(prev.attachments || []), ...newUrls],
            }
          : prev
      );
      if (firecallId && firecallId !== 'unknown') {
        try {
          await setDoc(
            doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
            { attachments: arrayUnion(...newUrls) },
            { merge: true }
          );
        } catch (err) {
          console.error('failed to persist attachments', err);
          // Roll back the optimistic update so the UI reflects reality.
          setFirecall((prev) =>
            prev
              ? {
                  ...prev,
                  attachments: prev.attachments?.filter(
                    (u) => !newUrls.includes(u)
                  ),
                }
              : prev
          );
          showSnackbar(
            'Anhang konnte nicht gespeichert werden. Bitte erneut versuchen.',
            'error'
          );
        }
      }
    },
    [firecallId, showSnackbar]
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

  const toggleSection = (sectionId: string, expanded: boolean) =>
    setOpenSections((prev) => ({ ...prev, [sectionId]: expanded }));

  /**
   * Der Abschnitt kann zu sein; erst aufklappen, dann hinspringen. Gescrollt
   * wird auf den Kopf des Abschnitts, der im DOM steht, auch solange er zu
   * ist — deshalb braucht es kein Warten auf das Aufklappen.
   */
  const jumpToKostenersatz = () => {
    setOpenSections((prev) => ({ ...prev, [KOSTENERSATZ_SECTION_ID]: true }));
    document
      .getElementById(KOSTENERSATZ_SECTION_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <CircularProgress sx={{ m: 4 }} />;
  if (!firecall) return <Typography sx={{ m: 2 }}>{t('notFound')}</Typography>;

  const alarmIds = firecallAlarmIds(firecall);

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h4" gutterBottom>
        {firecall.name}
      </Typography>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Tooltip title={t('openMap')}>
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
            {t('openMapButton')}
          </Button>
        </Tooltip>
        {firecall.id && <FirecallExport firecallId={firecall.id} />}
        {firecall.id && <LagekarteExport firecallId={firecall.id} />}
        {canWrite && (
          <Tooltip title={tCommon('edit')}>
            <IconButton
              size="small"
              onClick={() => setDisplayUpdateDialog(true)}
            >
              <EditIcon />
            </IconButton>
          </Tooltip>
        )}
        {/* Löschen darf, wer die Gruppe des Einsatzes administriert —
            globaler Admin oder Gruppen-Admin. */}
        {isGroupAdmin(firecall.group ?? '', {
          isAdmin,
          groups,
          groupAdmin,
        }) && (
          <Tooltip title={tCommon('delete')}>
            <IconButton
              size="small"
              onClick={() => setIsConfirmOpen(true)}
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        )}
        {canWrite && (
          <Tooltip title={t('createShareLink')}>
            <IconButton size="small" onClick={() => setShareDialogOpen(true)}>
              <ShareIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t('jumpToKostenersatz')}>
          <IconButton
            size="small"
            onClick={jumpToKostenersatz}
            color="primary"
          >
            <ReceiptLongIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Übersicht — der einzige Abschnitt, der immer offen steht. */}
      <Typography variant="h6" component="h2" gutterBottom>
        {t('sections.overview')}
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {firecall.group && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.group')}
            </Typography>
            <Typography>
              {myGroups.find((g) => g.id === firecall.group)?.name || firecall.group}
            </Typography>
          </Grid>
        )}
        {firecall.fw && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.fw')}
            </Typography>
            <Typography>{firecall.fw}</Typography>
          </Grid>
        )}
        {firecall.date && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.alarmierung')}
            </Typography>
            <Typography>{formatTimestamp(firecall.date)}</Typography>
          </Grid>
        )}
        {firecall.eintreffen && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.eintreffen')}
            </Typography>
            <Typography>{formatTimestamp(firecall.eintreffen)}</Typography>
          </Grid>
        )}
        {firecall.abruecken && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.abruecken')}
            </Typography>
            <Typography>{formatTimestamp(firecall.abruecken)}</Typography>
          </Grid>
        )}
        {firecall.description && (
          <Grid size={{ xs: 12 }}>
            <Typography variant="body2" color="text.secondary">
              {t('labels.description')}
            </Typography>
            <Typography>{firecall.description}</Typography>
          </Grid>
        )}
      </Grid>

      {/* Ab hier alles aufklappbar und beim Öffnen der Seite zugeklappt:
          Die Übersicht oben soll ohne Scrollen lesbar sein. Die Abschnitte
          hängen fast alle an eigenen Firestore-Abfragen — zugeklappt fragt
          keiner davon etwas ab (`unmountOnExit` in EinsatzDetailSection). */}
      {alarmIds.length > 0 && (
        <EinsatzDetailSection
          sectionId="alarm-sms"
          title={t('blaulichtSmsTitle')}
          subtitle={alarms?.length ? `${alarms.length}` : undefined}
          expanded={openSections['alarm-sms'] === true}
          onToggle={toggleSection}
        >
          {alarms === undefined ? (
            <CircularProgress size={24} />
          ) : alarms.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {alarms.map((a) => (
                <AlarmCard
                  key={a.alarmId}
                  alarm={a}
                  defaultExpandRecipients={false}
                />
              ))}
            </Box>
          ) : (
            <Typography color="text.secondary">
              {t('blaulichtSmsLoadError', {
                id: alarmIds.join(', '),
              })}
            </Typography>
          )}
        </EinsatzDetailSection>
      )}

      {/* Anhänge und Drive-Fotos in einem Abschnitt: Es sind zwei Ablageorte
          für dieselbe Sache. Nebeneinander ist der Unterschied — nur in der
          App gegen volle Auflösung im Drive der Feuerwehr — beim Hochladen
          zu sehen, statt zwei Abschnitte weit auseinander. */}
      <EinsatzDetailSection
        sectionId="dateien"
        title={t('sections.files')}
        subtitle={
          firecall.attachments?.length
            ? `${firecall.attachments.length}`
            : undefined
        }
        expanded={openSections['dateien'] === true}
        onToggle={toggleSection}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            mb: 0.5,
          }}
        >
          <Typography variant="h6">{t('attachments')}</Typography>
          {firecall.attachments && firecall.attachments.length > 0 && (
            <Box sx={{ ml: 'auto' }}>
              <DownloadAllButton urls={firecall.attachments} />
            </Box>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('attachmentsExplanation')}
        </Typography>
        {canWrite && (
          <FileUploader onFileUploadComplete={handleFileUploadComplete} />
        )}
        {firecall.attachments && firecall.attachments.length > 0 ? (
          <Box sx={{ mt: 2 }}>
            <AttachmentGallery
              urls={firecall.attachments}
              edit={canWrite}
              onDelete={handleDeleteAttachment}
              tileSize={140}
            />
          </Box>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {t('noAttachments')}
          </Typography>
        )}

        {/* Zweiter Ablageort: volle Auflösung im Google Drive der Feuerwehr.
            Bringt seine eigene Zwischenüberschrift samt Trennlinie mit und
            verschwindet ganz, wenn kein Drive eingerichtet ist. */}
        {firecall.id && <EinsatzDriveFotos firecallId={firecall.id} />}
      </EinsatzDetailSection>

      <EinsatzDetailSection
        sectionId="einsatzorte"
        title={t('sections.einsatzorte')}
        expanded={openSections['einsatzorte'] === true}
        onToggle={toggleSection}
      >
        <EinsatzorteWrapper hideTitle />
      </EinsatzDetailSection>

      {displayItems.length > 0 && (
        <EinsatzDetailSection
          sectionId="einsatzmittel"
          title={t('labels.einsatzmittel')}
          subtitle={`${displayItems.length}`}
          expanded={openSections['einsatzmittel'] === true}
          onToggle={toggleSection}
        >
          <StrengthTable items={displayItems} />
        </EinsatzDetailSection>
      )}

      <EinsatzDetailSection
        sectionId="besatzung"
        title={t('sections.besatzung')}
        expanded={openSections['besatzung'] === true}
        onToggle={toggleSection}
      >
        <CrewAssignmentBoard alarms={alarms} hideTitle />
      </EinsatzDetailSection>

      {/* Fahrtenbuch — Sammelerfassung direkt nach der Mannschaftszuordnung.
          Ohne Gruppe gibt es kein Fahrtenbuch, zu dem der Einsatz gehören
          könnte; dann bleibt der Abschnitt ganz weg. */}
      {firecall.id && firecall.group && (
        <EinsatzDetailSection
          sectionId="fahrtenbuch"
          title={tFahrtenbuch('einsatz.title')}
          expanded={openSections['fahrtenbuch'] === true}
          onToggle={toggleSection}
        >
          <EinsatzFahrtenbuch firecallId={firecall.id} firecall={firecall} />
        </EinsatzDetailSection>
      )}

      <EinsatzDetailSection
        sectionId="tagebuch"
        title={t('sections.tagebuch')}
        expanded={openSections['tagebuch'] === true}
        onToggle={toggleSection}
      >
        <EinsatzTagebuchWrapper hideTitle />
      </EinsatzDetailSection>

      {firecall.id && (
        <EinsatzDetailSection
          sectionId={KOSTENERSATZ_SECTION_ID}
          title={t('sections.kostenersatz')}
          expanded={openSections[KOSTENERSATZ_SECTION_ID] === true}
          onToggle={toggleSection}
        >
          <KostenersatzList firecallId={firecall.id} hideTitle />
        </EinsatzDetailSection>
      )}

      {/* Dialogs */}
      {shareDialogOpen && firecall.id && (
        <FirecallShareDialog
          firecallId={firecall.id}
          onClose={() => setShareDialogOpen(false)}
        />
      )}
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
