'use client';

import { useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { v4 as uuid } from 'uuid';
import { useTranslations } from 'next-intl';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import {
  MANGEL_MAX_IMAGE_BYTES,
  MANGEL_MAX_IMAGES,
} from '../../common/mangel';
import {
  MangelImageError,
  prepareMangelImage,
  type CompressedImage,
} from '../Fahrtenbuch/compressImage';
import { uploadMangelImage } from '../Fahrtenbuch/uploadMangelImage';
import { createAtemschutzMangel } from './atemschutzActions';

export interface AusruestungMangelDialogProps {
  open: boolean;
  groupId: string;
  geraet: AtemschutzGeraet;
  onClose: () => void;
  /** Der angelegte Mangel — der Aufrufer schreibt die ID an die Ausgabe. */
  onSaved: (mangelId: string) => Promise<void>;
}

export default function AusruestungMangelDialog({
  open,
  groupId,
  geraet,
  onClose,
  onSaved,
}: AusruestungMangelDialogProps) {
  const t = useTranslations('atemschutz');
  const tMaengel = useTranslations('fahrtenbuch.maengel');
  const tCommon = useTranslations('common');

  const [description, setDescription] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string>();

  const handleSave = async () => {
    setBusy(true);
    setFehler(undefined);
    try {
      // Die ID wird hier erzeugt, weil der Storage-Pfad sie braucht — die
      // Bilder müssen vor dem Dokument liegen, sonst zeigt das Dokument auf
      // Dateien, die noch nicht da sind.
      const mangelId = uuid();
      let images: string[] = [];
      if (pending.length > 0) {
        // Erst alle vorbereiten, dann hochladen: Ein Bild, das die
        // storage.rules ohnehin ablehnen würden, fällt so auf, bevor das
        // erste hochgeladen ist — dieselbe Reihenfolge wie im MangelDialog.
        const prepared: CompressedImage[] = [];
        for (const file of pending) prepared.push(await prepareMangelImage(file));
        images = await Promise.all(
          prepared.map((image) => uploadMangelImage(groupId, mangelId, image)),
        );
      }

      const result = await createAtemschutzMangel(groupId, {
        geraetId: geraet.id as string,
        description,
        images,
      });
      if (!result.success || !result.id) {
        setFehler(result.error ?? t('errors.saveFailed'));
        return;
      }
      await onSaved(result.id);
      onClose();
    } catch (err) {
      if (err instanceof MangelImageError) {
        // Der Fehlerschlüssel ist derselbe wie im Fahrtenbuch-Dialog und dort
        // bereits übersetzt — samt Dateiname und Höchstgröße als Parameter.
        setFehler(
          tMaengel(`errors.${err.reason}` as 'errors.imageTooLarge', {
            name: err.fileName,
            size: MANGEL_MAX_IMAGE_BYTES / 1024 / 1024,
          }),
        );
        return;
      }
      setFehler((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('ausruestung.mangelTitle')}</DialogTitle>
      <DialogContent>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {geraet.nummer
              ? `${geraet.nummer} · ${geraet.bezeichnung}`
              : geraet.bezeichnung}
          </Typography>
          <TextField
            fullWidth
            required
            multiline
            minRows={3}
            label={t('ausruestung.mangelDescription')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            component="label"
            startIcon={<PhotoCameraIcon />}
            disabled={pending.length >= MANGEL_MAX_IMAGES}
          >
            {t('ausruestung.mangelImages')}
            <input
              type="file"
              hidden
              multiple
              accept="image/*"
              // `capture` bewusst nicht gesetzt: Damit ließe sich nur die
              // Kamera öffnen, und ein Foto aus der Galerie ist am
              // Sammelplatz genauso brauchbar.
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                setPending((prev) =>
                  [...prev, ...files].slice(0, MANGEL_MAX_IMAGES),
                );
              }}
            />
          </Button>
          {pending.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {pending.map((file, index) => (
                <Chip
                  key={`${file.name}-${index}`}
                  label={file.name}
                  deleteIcon={<DeleteIcon />}
                  onDelete={() =>
                    setPending((prev) => prev.filter((_, i) => i !== index))
                  }
                />
              ))}
            </Stack>
          )}
          {fehler && <Alert severity="error">{fehler}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button
          variant="contained"
          disabled={busy || !description.trim()}
          onClick={handleSave}
        >
          {tCommon('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
