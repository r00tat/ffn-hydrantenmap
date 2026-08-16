'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { MANGEL_MAX_IMAGES } from '../../common/mangel';
import { mangelImageUrls } from './mangelActions';

export interface MangelImagesProps {
  groupId: string;
  /** Gesetzt beim Bearbeiten — nur dann gibt es bereits gespeicherte Bilder. */
  mangelId?: string;
  /** Storage-Pfade der gespeicherten Bilder, die bleiben sollen. */
  images: string[];
  /** Neu gewählte Bilder; hochgeladen wird erst beim Speichern. */
  pending: File[];
  onAdd: (files: File[]) => void;
  onRemove: (path: string) => void;
  onRemovePending: (index: number) => void;
  disabled?: boolean;
}

const THUMB = 96;

/**
 * Bilder eines Mangels: Vorschau, Aufnehmen, Auswählen, Entfernen.
 *
 * Gespeicherte Bilder kommen über kurzlebige Signed URLs aus einer Server
 * Action — die `storage.rules` verweigern jedem Client das Lesen, weil die
 * Berechtigung an der Gruppenmitgliedschaft hängt und die in Firestore steht.
 * Neu gewählte Bilder werden hier nur angezeigt; hochgeladen werden sie erst
 * beim Speichern, sonst hinterließe jedes Abbrechen verwaiste Dateien.
 */
export default function MangelImages({
  groupId,
  mangelId,
  images,
  pending,
  onAdd,
  onRemove,
  onRemovePending,
  disabled,
}: MangelImagesProps) {
  const t = useTranslations('fahrtenbuch.maengel');

  const [urls, setUrls] = useState<Record<string, string>>({});
  // Der Anfangswert statt eines `setLoading(true)` im Effekt: Ein synchrones
  // setState im Effektkörper löst eine zweite Renderrunde aus, bevor der
  // Benutzer etwas gesehen hat.
  const [loading, setLoading] = useState(!!mangelId);
  const [loadError, setLoadError] = useState(false);
  const [lightbox, setLightbox] = useState<string>();

  // Einmal je Mangel: Die Signaturen gelten eine Stunde, so lange steht kein
  // Dialog offen. Entfernte Bilder verschwinden über `images`, nicht über
  // einen neuen Serveraufruf.
  useEffect(() => {
    if (!mangelId) return;
    let active = true;
    mangelImageUrls(groupId, mangelId)
      .then((result) => {
        if (!active) return;
        if (!result.success || !result.images) {
          setLoadError(true);
          return;
        }
        setUrls(
          Object.fromEntries(result.images.map(({ path, url }) => [path, url])),
        );
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [groupId, mangelId]);

  const previews = useMemo(
    () => pending.map((file) => URL.createObjectURL(file)),
    [pending],
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  const total = images.length + pending.length;
  const full = total >= MANGEL_MAX_IMAGES;

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Auf das verbleibende Kontingent kürzen — die Server Action verwirft den
    // Rest ohnehin, und ein Bild, das man sieht, aber nicht bekommt, ist
    // schlimmer als eines, das gar nicht erst angenommen wird.
    if (files.length > 0) onAdd(files.slice(0, MANGEL_MAX_IMAGES - total));
    // Zurücksetzen, damit dieselbe Datei ein zweites Mal `change` auslöst.
    event.target.value = '';
  };

  const thumb = {
    position: 'relative' as const,
    width: THUMB,
    height: THUMB,
    borderRadius: 1,
    overflow: 'hidden',
    border: 1,
    borderColor: 'divider',
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {t('images')}
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {/* Zwei Knöpfe statt einem: `capture` öffnet direkt die Kamera und
            nimmt damit die Wahl aus der Galerie weg — beides wird gebraucht,
            das Foto vor Ort und das schon geschossene Bild. */}
        <Button
          startIcon={<PhotoCameraIcon />}
          variant="outlined"
          size="small"
          component="label"
          disabled={disabled || full}
        >
          {t('takePhoto')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleFiles}
          />
        </Button>
        <Button
          startIcon={<PhotoLibraryIcon />}
          variant="outlined"
          size="small"
          component="label"
          disabled={disabled || full}
        >
          {t('addImages')}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleFiles}
          />
        </Button>
        {loading && <CircularProgress size={20} sx={{ alignSelf: 'center' }} />}
      </Stack>

      {full && (
        <Typography variant="caption" color="text.secondary">
          {t('imagesFull', { count: MANGEL_MAX_IMAGES })}
        </Typography>
      )}

      {loadError && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {t('imagesLoadFailed')}
        </Alert>
      )}

      {total > 0 && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ mt: 1, flexWrap: 'wrap' }}
        >
          {images.map((path, index) => (
            <Box key={path} sx={thumb}>
              <ButtonBase
                onClick={() => urls[path] && setLightbox(urls[path])}
                disabled={!urls[path]}
                sx={{ width: '100%', height: '100%' }}
                aria-label={t('showImage', { index: index + 1 })}
              >
                {urls[path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[path]}
                    alt={t('showImage', { index: index + 1 })}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', bgcolor: 'action.hover' }} />
                )}
              </ButtonBase>
              <IconButton
                size="small"
                aria-label={t('removeImage', { index: index + 1 })}
                onClick={() => onRemove(path)}
                disabled={disabled}
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bgcolor: 'background.paper',
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}

          {pending.map((file, index) => (
            <Box key={`pending-${index}-${file.name}`} sx={thumb}>
              <ButtonBase
                onClick={() => setLightbox(previews[index])}
                sx={{ width: '100%', height: '100%' }}
                aria-label={file.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[index]}
                  alt={file.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </ButtonBase>
              <IconButton
                size="small"
                aria-label={t('removeImage', {
                  index: images.length + index + 1,
                })}
                onClick={() => onRemovePending(index)}
                disabled={disabled}
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bgcolor: 'background.paper',
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

      {/* Ein Foto vom Schaden wird auf einem Telefon aufgenommen und auf einem
          Telefon angesehen — 96 Pixel genügen dafür nicht. */}
      <Dialog
        open={!!lightbox}
        onClose={() => setLightbox(undefined)}
        maxWidth="lg"
      >
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightbox}
            alt={t('images')}
            style={{ maxWidth: '100%', maxHeight: '90vh', display: 'block' }}
          />
        )}
      </Dialog>
    </Box>
  );
}
