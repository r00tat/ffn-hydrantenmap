'use client';

import MapIcon from '@mui/icons-material/Map';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { RisikoObjekt } from '../../common/gis-objects';
import { can } from '../../common/permissions';
import {
  objektGroups,
  RISIKOOBJEKT_MANAGE,
  type RisikoObjektInput,
} from '../../common/objektplan/risikoobjektAccess';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import {
  createRisikoObjekt,
  deleteRisikoObjekt,
  setRisikoObjektGroups,
  updateRisikoObjekt,
  type RisikoObjektActionError,
} from './risikoobjektActions';

const LocationMapPicker = dynamic(() => import('../Einsatzorte/LocationMapPicker'), {
  ssr: false,
});

type TextKey = Exclude<keyof RisikoObjektInput, 'lat' | 'lng'>;
const TEXT_FIELDS: TextKey[] = [
  'name',
  'ortschaft',
  'adresse',
  'risikogruppe',
  'einsatzplanummer',
  'link',
  'description',
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ohne Objekt wird ein neues angelegt. */
  objekt?: RisikoObjekt;
  /** Namen aller Gruppen, für die Freigabe. */
  groupNames: Record<string, string>;
}

function initialText(objekt: RisikoObjekt | undefined): Record<TextKey, string> {
  const value = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  return {
    name: value(objekt?.name),
    ortschaft: value(objekt?.ortschaft),
    adresse: value(objekt?.adresse),
    risikogruppe: value(objekt?.risikogruppe),
    einsatzplanummer: value(objekt?.einsatzplanummer),
    link: value(objekt?.link),
    description: value(objekt?.description),
  };
}

/** Komma oder Punkt als Dezimaltrenner — auf dem Handy liegt oft nur eins davon. */
function parseCoordinate(raw: string): number {
  const trimmed = raw.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

/**
 * Anlegen und Bearbeiten eines Risikoobjekts samt Freigabe an Gruppen. Die
 * Entscheidung, was erlaubt ist, treffen die Server Actions; der Dialog sperrt
 * nur, was ohnehin abgewiesen würde. Hintergrund: docs/objektplaene.md.
 */
export default function RisikoObjektEditDialog({ open, onClose, objekt, groupNames }: Props) {
  const t = useTranslations('risikoobjekte');
  const { isAdmin, groupRoles } = useFirebaseLogin();
  const { groups: createGroups, groupId: defaultGroupId } = useFahrtenbuchGroup(RISIKOOBJEKT_MANAGE);
  const isNew = !objekt;
  const linkOnly = !!objekt && objekt.quelle !== 'app' && !isAdmin;

  const [text, setText] = useState(() => initialText(objekt));
  const [lat, setLat] = useState(objekt?.lat !== undefined ? String(objekt.lat) : '');
  const [lng, setLng] = useState(objekt?.lng !== undefined ? String(objekt.lng) : '');
  const [groupId, setGroupId] = useState<string | undefined>();
  const initialGroups = useMemo(() => (objekt ? objektGroups(objekt) : []), [objekt]);
  const [shared, setShared] = useState<string[]>(initialGroups);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RisikoObjektActionError | 'unknown' | undefined>();

  const mayManage = (g: string) => !!isAdmin || can({ isAdmin, groupRoles }, g, RISIKOOBJEKT_MANAGE);
  const sharingOptions = useMemo(() => {
    const ids = isAdmin
      ? Object.keys(groupNames)
      : [
          ...initialGroups,
          ...Object.keys(groupRoles ?? {}).filter((g) =>
            can({ isAdmin, groupRoles }, g, RISIKOOBJEKT_MANAGE),
          ),
        ];
    return [...new Set(ids)]
      .filter((g) => objektGroups({ groups: [g] }).length > 0)
      .sort((a, b) => (groupNames[a] ?? a).localeCompare(groupNames[b] ?? b));
  }, [isAdmin, groupNames, groupRoles, initialGroups]);

  const selectedGroupId = groupId ?? defaultGroupId;

  const run = async (action: () => Promise<{ ok: boolean; error?: RisikoObjektActionError }>) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'unknown');
        return;
      }
      onClose();
    } catch (err) {
      console.error('Risikoobjekt nicht gespeichert', err);
      setError('unknown');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const input: RisikoObjektInput = { ...text, lat: parseCoordinate(lat), lng: parseCoordinate(lng) };
      if (isNew) {
        if (!selectedGroupId) return { ok: false, error: 'forbidden' };
        return createRisikoObjekt(selectedGroupId, input);
      }
      if (!objekt.id) return { ok: false, error: 'notFound' };
      const updated = await updateRisikoObjekt(objekt.id, input);
      if (!updated.ok) return updated;
      const next = [...shared].sort();
      if (next.join(',') !== [...initialGroups].sort().join(',')) {
        return setRisikoObjektGroups(objekt.id, next);
      }
      return updated;
    });

  const remove = () =>
    run(async () =>
      objekt?.id ? deleteRisikoObjekt(objekt.id) : { ok: false, error: 'notFound' as const },
    );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isNew ? t('newTitle') : t('editTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {linkOnly && <Alert severity="info">{t('gisOnlyLink')}</Alert>}

          {isNew && (
            <TextField
              select
              label={t('group')}
              value={selectedGroupId ?? ''}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {createGroups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {TEXT_FIELDS.map((field) => (
            <TextField
              key={field}
              label={t(`fields.${field}`)}
              value={text[field]}
              required={field === 'name'}
              disabled={busy || (linkOnly && field !== 'link')}
              multiline={field === 'description'}
              minRows={field === 'description' ? 2 : undefined}
              helperText={field === 'link' ? t('linkHelper') : undefined}
              onChange={(e) => setText((prev) => ({ ...prev, [field]: e.target.value }))}
            />
          ))}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label={t('fields.lat')}
              value={lat}
              required
              disabled={busy || linkOnly}
              onChange={(e) => setLat(e.target.value)}
              sx={{ flex: 1, minWidth: 120 }}
            />
            <TextField
              label={t('fields.lng')}
              value={lng}
              required
              disabled={busy || linkOnly}
              onChange={(e) => setLng(e.target.value)}
              sx={{ flex: 1, minWidth: 120 }}
            />
            <Button
              startIcon={<MapIcon />}
              disabled={busy || linkOnly}
              onClick={() => setPickerOpen(true)}
            >
              {t('pickOnMap')}
            </Button>
          </Box>

          {!isNew && (
            <FormControl component="fieldset">
              <FormLabel component="legend">{t('sharing')}</FormLabel>
              <FormGroup row>
                {sharingOptions.map((g) => (
                  <FormControlLabel
                    key={g}
                    label={groupNames[g] ?? g}
                    control={
                      <Checkbox
                        checked={shared.includes(g)}
                        disabled={busy || !mayManage(g)}
                        onChange={(e) =>
                          setShared((prev) =>
                            e.target.checked ? [...prev, g] : prev.filter((x) => x !== g),
                          )
                        }
                      />
                    }
                  />
                ))}
              </FormGroup>
              <FormHelperText>{t('sharingHelper')}</FormHelperText>
            </FormControl>
          )}

          {error && <Alert severity="error">{t(`errors.${error}`)}</Alert>}
          {confirmDelete && (
            <Alert
              severity="warning"
              action={
                <Button color="error" disabled={busy} onClick={remove}>
                  {t('deleteConfirmButton')}
                </Button>
              }
            >
              {t('deleteConfirm')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {objekt?.quelle === 'app' && !confirmDelete && (
          <Button color="error" disabled={busy} onClick={() => setConfirmDelete(true)} sx={{ mr: 'auto' }}>
            {t('delete')}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          {t('cancel')}
        </Button>
        <Button variant="contained" onClick={save} disabled={busy}>
          {t('save')}
        </Button>
      </DialogActions>

      {pickerOpen && (
        <LocationMapPicker
          open
          showFirecallLayers={false}
          title={t('pickOnMap')}
          initialLat={Number.isFinite(parseCoordinate(lat)) ? parseCoordinate(lat) : undefined}
          initialLng={Number.isFinite(parseCoordinate(lng)) ? parseCoordinate(lng) : undefined}
          initialSearchQuery={[text.adresse, text.ortschaft].filter(Boolean).join(', ') || undefined}
          onClose={() => setPickerOpen(false)}
          onConfirm={(newLat, newLng) => {
            setLat(newLat.toFixed(6));
            setLng(newLng.toFixed(6));
          }}
        />
      )}
    </Dialog>
  );
}
