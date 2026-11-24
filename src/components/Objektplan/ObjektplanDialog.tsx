'use client';

import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SensorsIcon from '@mui/icons-material/Sensors';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import type { RisikoObjekt } from '../../common/gis-objects';
import type { Box as PlanBox } from '../../common/objektplan/melderIndex';
import {
  OBJEKT_DOKUMENT_MAX_MB,
  objektDokumentKind,
  wantsOcr,
  type ObjektDokument,
} from '../../common/objektplan/objektDokument';
import {
  canManageRisikoObjekt,
  canSeeObjektPlans,
  objektGroups,
  RISIKOOBJEKT_MANAGE,
} from '../../common/objektplan/risikoobjektAccess';
import { searchObjektDokumente } from '../../common/objektplan/search';
import { can } from '../../common/permissions';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import {
  checkObjektDokumentFile,
  uploadObjektDokument,
  useObjektDokumente,
} from './objektDokumente';
import PlanViewer from './PlanViewer';
import {
  deleteObjektDokumentAction,
  ocrObjektDokumentAction,
  reindexObjektDokumentAction,
  type OcrActionResult,
} from './risikoobjektActions';
import { useDriveSync } from './useDriveSync';

export interface ObjektplanDialogProps {
  open: boolean;
  onClose: () => void;
  objekt: RisikoObjekt;
}

interface Selection {
  dokumentId: string;
  page: number;
  highlights: PlanBox[];
  textTerm?: string;
  /** Zähler je Sprung aus der Suche, siehe `PlanViewer.jumpKey`. */
  jumpKey?: number;
}

interface UploadState {
  name: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message?: string;
}

const NO_DOKUMENTE: ObjektDokument[] = [];

/** Zahl der Knöpfe neben einer Unterlage für jemanden, der das Objekt pflegt. */
function actionCount(d: ObjektDokument): number {
  return (
    Number(objektDokumentKind(d.contentType) === 'pdf') +
    Number(wantsOcr(d)) +
    Number(d.quelle !== 'drive')
  );
}

export default function ObjektplanDialog({ open, onClose, objekt }: ObjektplanDialogProps) {
  const t = useTranslations('objektplan');
  const tCommon = useTranslations('common');
  const { isAdmin, email, groupRoles } = useFirebaseLogin();
  const user = { isAdmin, groupRoles };
  // Die Freigabe steht am Objekt; ohne sie gäbe die Regel nichts heraus.
  const canSee = canSeeObjektPlans(user, objekt);
  const canManage = canManageRisikoObjekt(user, objekt);
  const listed = useObjektDokumente(open && canSee ? objekt.id : undefined);
  const { loading, fromCache } = listed;
  const dokumente = canSee ? listed.dokumente : NO_DOKUMENTE;

  const driveSync = useDriveSync(objekt.id, objekt.link, open && canSee);

  const [term, setTerm] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [toDelete, setToDelete] = useState<ObjektDokument | null>(null);
  const [ocrRunning, setOcrRunning] = useState<string[]>([]);
  /** Plan über die ganze Breite, Suche und Liste ausgeblendet. */
  const [planExpanded, setPlanExpanded] = useState(false);

  /** Texterkennung eines Scans; das Ergebnis kommt über die Dokumentliste. */
  const runOcr = async (dokumentId: string): Promise<OcrActionResult> => {
    if (!objekt.id) return { ok: false, error: 'notFound' };
    setOcrRunning((prev) => [...prev, dokumentId]);
    try {
      return await ocrObjektDokumentAction(objekt.id, dokumentId);
    } catch (err) {
      console.error('Texterkennung fehlgeschlagen', dokumentId, err);
      return { ok: false, error: 'ocrFailed' };
    } finally {
      setOcrRunning((prev) => prev.filter((id) => id !== dokumentId));
    }
  };
  /** Ergebnis des letzten Neu-Einlesens, als Hinweis über der Liste. */
  const [reindexNotice, setReindexNotice] = useState<{
    severity: 'success' | 'error';
    text: string;
  } | null>(null);

  /**
   * Liest eine Unterlage neu aus Storage ein (Index, bei Bedarf OCR) — für
   * Pläne, die mit einer älteren Erkennung indiziert wurden.
   */
  const runReindex = async (dokument: ObjektDokument) => {
    if (!objekt.id) return;
    setOcrRunning((prev) => [...prev, dokument.id]);
    setReindexNotice(null);
    try {
      const result = await reindexObjektDokumentAction(objekt.id, dokument.id);
      setReindexNotice(
        result.ok
          ? {
              severity: 'success',
              text: t('reindexDone', {
                name: dokument.name,
                count: result.melder,
                ocr: String(result.ocr),
              }),
            }
          : { severity: 'error', text: t('reindexFailed', { name: dokument.name }) },
      );
    } catch (err) {
      console.error('Neu einlesen fehlgeschlagen', dokument.id, err);
      setReindexNotice({ severity: 'error', text: t('reindexFailed', { name: dokument.name }) });
    } finally {
      setOcrRunning((prev) => prev.filter((id) => id !== dokument.id));
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const jumpCounter = useRef(0);
  /** Sprung aus der Suche — auch derselbe Treffer springt und zoomt erneut. */
  const jumpTo = (target: Omit<Selection, 'jumpKey'>) => {
    jumpCounter.current += 1;
    setSelection({ ...target, jumpKey: jumpCounter.current });
  };

  const result = useMemo(() => searchObjektDokumente(dokumente, term), [dokumente, term]);
  const hasTerm = term.trim().length > 0;

  // Ohne Auswahl die erste Unterlage zeigen — im Einsatz zählt jeder Tipp.
  const selected =
    dokumente.find((d) => d.id === selection?.dokumentId) ?? dokumente[0];
  const view: Selection | null = selected
    ? selection?.dokumentId === selected.id
      ? selection
      : { dokumentId: selected.id, page: 1, highlights: [] }
    : null;

  const openFirstResult = () => {
    const first = result.melder[0];
    if (first) {
      jumpTo({
        dokumentId: first.dokumentId,
        page: first.seite,
        highlights: first.entries.map((e) => e.box),
      });
      return;
    }
    const text = result.text[0];
    if (text) {
      jumpTo({
        dokumentId: text.dokumentId,
        page: text.seite,
        highlights: [],
        textTerm: term.trim(),
      });
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!objekt.id || !files) return;
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, status: 'running', progress: 0 })));
    const update = (i: number, patch: Partial<UploadState>) =>
      setUploads((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));

    // Nacheinander: das Indizieren eines großen Plans braucht Speicher, und
    // die Reihenfolge der Meldungen bleibt nachvollziehbar.
    for (const [i, file] of list.entries()) {
      const rejection = checkObjektDokumentFile(file);
      if (rejection) {
        update(i, {
          status: 'error',
          message:
            rejection === 'type'
              ? t('uploadRejectedType')
              : t('uploadRejectedSize', { max: OBJEKT_DOKUMENT_MAX_MB }),
        });
        continue;
      }
      try {
        const dok = await uploadObjektDokument(
          objekt.id,
          file,
          email ?? '',
          {
            groups: objektGroups(objekt),
            gruppe: isAdmin
              ? undefined
              : objektGroups(objekt).find((g) => can(user, g, RISIKOOBJEKT_MANAGE)),
          },
          (p) => update(i, { progress: p }),
        );
        if (wantsOcr(dok)) {
          // Ein Scan oder ein Plan ohne Melder in der Textebene: Text und
          // Melder erkennt Cloud Vision auf dem Server.
          update(i, { status: 'running', progress: 1, message: t('ocrRunning') });
          const ocr = await runOcr(dok.id);
          update(i, {
            status: ocr.ok ? 'done' : 'error',
            message: !ocr.ok
              ? t('ocrFailed')
              : ocr.hasText
                ? t('ocrDone', { count: ocr.melder })
                : t('ocrNoText'),
          });
          continue;
        }
        update(i, {
          status: 'done',
          progress: 1,
          message:
            dok.indexStatus === 'ok'
              ? t('uploadIndexed', { count: dok.melder?.length ?? 0 })
              : undefined,
        });
      } catch (err) {
        console.error('Upload fehlgeschlagen', file.name, err);
        update(i, { status: 'error', message: t('uploadFailed') });
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const statusChip = (d: ObjektDokument) => {
    if (d.indexStatus === 'ok' && (d.melder?.length ?? 0) > 0) {
      return (
        <Chip size="small" color="primary" label={t('melderCount', { count: d.melder!.length })} />
      );
    }
    if (d.indexStatus === 'ohneText') {
      return (
        <Chip
          size="small"
          label={t('statusOhneTextShort')}
          title={d.ocr ? t('ocrNoText') : t('statusOhneText')}
        />
      );
    }
    if (d.indexStatus === 'fehler') {
      return <Chip size="small" color="warning" label={t('statusFehler')} />;
    }
    return null;
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <AppBar position="relative" color="primary">
        <Toolbar variant="dense">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {[objekt.ortschaft, objekt.name].filter(Boolean).join(' ')}
            </Typography>
            <Typography variant="caption" noWrap component="div">
              {[objekt.adresse, objekt.risikogruppe].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <IconButton color="inherit" edge="end" onClick={onClose} aria-label={tCommon('close')}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box
          data-testid="objektplan-sidebar"
          sx={{
            display: planExpanded ? 'none' : undefined,
            width: { md: 360 },
            maxHeight: { xs: '40vh', md: 'none' },
            overflow: 'auto',
            borderRight: { md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Box sx={{ p: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              label={t('searchLabel')}
              helperText={t('searchHelper')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openFirstResult();
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {hasTerm && (
            <List dense disablePadding>
              {result.melder.length > 0 && <ListSubheader>{t('melderResults')}</ListSubheader>}
              {result.melder.map((r) => (
                <ListItemButton
                  key={`m-${r.dokumentId}-${r.seite}`}
                  selected={
                    view?.dokumentId === r.dokumentId &&
                    view.page === r.seite &&
                    view.highlights.length > 0
                  }
                  onClick={() =>
                    jumpTo({
                      dokumentId: r.dokumentId,
                      page: r.seite,
                      highlights: r.entries.map((e) => e.box),
                    })
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <SensorsIcon color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary={r.entries.map((e) => e.kennung).join(', ')}
                    secondary={`${r.dokumentName} · ${t('page', { page: r.seite })}`}
                  />
                </ListItemButton>
              ))}
              {result.text.length > 0 && <ListSubheader>{t('textResults')}</ListSubheader>}
              {result.text.map((r) => (
                <ListItemButton
                  key={`t-${r.dokumentId}-${r.seite}`}
                  onClick={() =>
                    jumpTo({
                      dokumentId: r.dokumentId,
                      page: r.seite,
                      highlights: [],
                      textTerm: term.trim(),
                    })
                  }
                >
                  <ListItemText
                    primary={r.snippet}
                    secondary={`${r.dokumentName} · ${t('page', { page: r.seite })} · ${t('hits', { count: r.count })}`}
                  />
                </ListItemButton>
              ))}
              {result.melder.length === 0 && result.text.length === 0 && (
                <ListItem>
                  <ListItemText secondary={t('noResults')} />
                </ListItem>
              )}
            </List>
          )}

          <List dense disablePadding>
            <ListSubheader>{t('documents')}</ListSubheader>
            {driveSync.running && (
              <ListItem>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('driveSyncRunning')}
                  </Typography>
                  <LinearProgress />
                </Box>
              </ListItem>
            )}
            {(driveSync.error || driveSync.result?.status === 'nichtLesbar') && (
              <ListItem>
                <Alert severity="warning" sx={{ width: '100%' }}>
                  {driveSync.error ? t('driveSyncFailed') : t('driveUnreadable')}
                </Alert>
              </ListItem>
            )}
            {driveSync.result?.status === 'ok' && driveSync.result.failed > 0 && (
              <ListItem>
                <Alert severity="warning" sx={{ width: '100%' }}>
                  {t('driveSyncPartial', { count: driveSync.result.failed })}
                </Alert>
              </ListItem>
            )}
            {!canSee && (
              <ListItem>
                <Alert severity="info" sx={{ width: '100%' }}>
                  {t('notShared')}
                </Alert>
              </ListItem>
            )}
            {canSee && !loading && dokumente.length === 0 && (
              <ListItem>
                <ListItemText secondary={fromCache ? t('noDocumentsOffline') : t('noDocuments')} />
              </ListItem>
            )}
            {reindexNotice && (
              <ListItem>
                <Alert
                  severity={reindexNotice.severity}
                  onClose={() => setReindexNotice(null)}
                  sx={{ width: '100%' }}
                >
                  {reindexNotice.text}
                </Alert>
              </ListItem>
            )}
            {dokumente.map((d) => (
              <ListItem
                key={d.id}
                disablePadding
                // Platz für bis zu drei Knöpfe, sonst liegen sie über Name und Status.
                sx={{
                  '& > .MuiListItemButton-root': {
                    pr: canManage ? 1 + 4.5 * actionCount(d) : undefined,
                  },
                }}
                secondaryAction={
                  canManage ? (
                    <>
                      {wantsOcr(d) && (
                          <Tooltip title={t('ocrRun')}>
                            <span>
                              <IconButton
                                size="small"
                                aria-label={t('ocrRun')}
                                disabled={ocrRunning.includes(d.id)}
                                onClick={() => void runOcr(d.id)}
                              >
                                <DocumentScannerIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      {objektDokumentKind(d.contentType) === 'pdf' && (
                        <Tooltip title={t('reindex')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={t('reindex')}
                              disabled={ocrRunning.includes(d.id)}
                              onClick={() => void runReindex(d)}
                            >
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {/* Aus Drive Gekommenes käme beim nächsten Abgleich
                          wieder; gelöscht wird es dort. */}
                      {d.quelle !== 'drive' && (
                        <IconButton
                          edge="end"
                          size="small"
                          aria-label={tCommon('delete')}
                          onClick={() => setToDelete(d)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </>
                  ) : undefined
                }
              >
                <ListItemButton
                  selected={view?.dokumentId === d.id}
                  onClick={() => setSelection({ dokumentId: d.id, page: 1, highlights: [] })}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {objektDokumentKind(d.contentType) === 'pdf' ? (
                      <PictureAsPdfIcon />
                    ) : (
                      <ImageIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={d.name}
                    secondary={d.seiten ? t('pages', { count: d.seiten }) : undefined}
                    slotProps={{ primary: { sx: { wordBreak: 'break-word' } } }}
                  />
                  {d.quelle === 'drive' && (
                    <Chip size="small" variant="outlined" label={t('driveSource')} sx={{ mr: 0.5 }} />
                  )}
                  {d.ocr && d.indexStatus === 'ok' && (
                    <Chip size="small" variant="outlined" label={t('ocrSource')} sx={{ mr: 0.5 }} />
                  )}
                  {ocrRunning.includes(d.id) && <LinearProgress sx={{ width: 40, mr: 0.5 }} />}
                  {statusChip(d)}
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          {objekt.link && (
            <Box sx={{ px: 2, py: 1 }}>
              <Link href={objekt.link} target="_blank" rel="noreferrer">
                {t('legacyLink')}
              </Link>
            </Box>
          )}

          {canManage && (
            <Stack spacing={1} sx={{ p: 1.5 }}>
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                disabled={uploads.some((u) => u.status === 'running')}
                onClick={() => fileInput.current?.click()}
              >
                {t('upload')}
              </Button>
              {uploads.map((u, i) => (
                <Box key={`${u.name}-${i}`}>
                  <Typography variant="caption" component="div" noWrap>
                    {u.name}
                  </Typography>
                  {u.status === 'running' && (
                    <LinearProgress
                      variant={u.progress > 0 ? 'determinate' : 'indeterminate'}
                      value={u.progress * 100}
                    />
                  )}
                  {u.message && (
                    <Typography
                      variant="caption"
                      color={u.status === 'error' ? 'error' : 'text.secondary'}
                    >
                      {u.message}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          {selected && view ? (
            <PlanViewer
              key={selected.id}
              dokument={selected}
              page={view.page}
              highlights={view.highlights}
              textTerm={view.textTerm}
              jumpKey={view.jumpKey}
              expanded={planExpanded}
              onToggleExpanded={() => setPlanExpanded((e) => !e)}
            />
          ) : (
            !loading &&
            canSee && (
              <Alert severity="info" sx={{ m: 2 }}>
                {fromCache ? t('noDocumentsOffline') : t('noDocuments')}
              </Alert>
            )
          )}
        </Box>
      </Box>

      {toDelete && objekt.id && (
        <ConfirmDialog
          title={t('deleteTitle')}
          text={t('deleteText', { name: toDelete.name })}
          yes={tCommon('delete')}
          no={tCommon('cancel')}
          onConfirm={(confirmed) => {
            const target = toDelete;
            setToDelete(null);
            if (confirmed && objekt.id) {
              deleteObjektDokumentAction(objekt.id, target.id)
                .then((res) => {
                  if (!res.ok) console.error('Löschen abgelehnt', res.error);
                })
                .catch((err) => console.error('Löschen fehlgeschlagen', err));
            }
          }}
        />
      )}
    </Dialog>
  );
}
