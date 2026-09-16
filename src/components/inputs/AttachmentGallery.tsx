'use client';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { getMetadata, getDownloadURL, getStorage, ref } from 'firebase/storage';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { displayFileName } from '../../common/attachmentName';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import app from '../firebase/firebase';
import { deleteStorageObject, downloadStorageFile } from './storageFile';

const storage = getStorage(app);

export interface AttachmentGalleryProps {
  urls: string[];
  /** Löschen anbieten. Ohne `onDelete` bleibt der Anhang im Dokument stehen. */
  edit?: boolean;
  onDelete?: (url: string) => void;
  /** Kantenlänge der Kacheln in px; im Marker-Popup ist weniger Platz. */
  tileSize?: number;
}

interface Attachment {
  url: string;
  name: string;
  downloadUrl?: string;
  isImage: boolean;
  isPdf: boolean;
}

/**
 * Anhänge als Raster gleich großer Kacheln.
 *
 * Bilder füllen ihre Kachel und öffnen sich per Klick groß; erst dort stehen
 * Herunterladen und Löschen. Vorher stand neben jedem Bild ein Download-Icon,
 * das mehr Platz brauchte als die Vorschau selbst etwas zeigte.
 *
 * Dateien ohne Vorschau — PDF, Dokumente — bekommen dieselbe Kachel mit
 * Symbol und Namen und öffnen sich in einem neuen Tab. Ein eigenes Layout je
 * Dateiart hätte die Liste in zwei Blöcke zerrissen, die getrennt umbrechen.
 */
export default function AttachmentGallery({
  urls,
  edit = false,
  onDelete,
  tileSize = 120,
}: AttachmentGalleryProps) {
  const t = useTranslations('fileDisplay');
  const tCommon = useTranslations('common');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string>();
  const [confirmDeleteUrl, setConfirmDeleteUrl] = useState<string>();

  /**
   * Die Liste hängt am Inhalt, nicht an der Identität des Arrays: Aufrufer
   * bauen `urls` bei jedem Rendern neu, und ein Effekt darauf liefe endlos.
   */
  const urlKey = urls.join('\n');

  useEffect(() => {
    let active = true;
    const currentUrls = urlKey.split('\n').filter(Boolean);
    (async () => {
      const loaded = await Promise.all(
        currentUrls.map(async (url): Promise<Attachment> => {
          const fileRef = ref(storage, url);
          const name = displayFileName(fileRef.name);
          try {
            const [metadata, downloadUrl] = await Promise.all([
              getMetadata(fileRef),
              getDownloadURL(fileRef),
            ]);
            return {
              url,
              name,
              downloadUrl,
              isImage: metadata.contentType?.startsWith('image/') === true,
              isPdf: metadata.contentType === 'application/pdf',
            };
          } catch (err) {
            // Ein Anhang, der nicht mehr im Storage liegt, darf die übrigen
            // nicht verschlucken — er erscheint als Kachel ohne Vorschau.
            console.error('could not load attachment', url, err);
            return { url, name, isImage: false, isPdf: false };
          }
        })
      );
      if (active) {
        setAttachments(loaded);
      }
    })();
    return () => {
      active = false;
    };
  }, [urlKey]);

  if (urls.length === 0) {
    return null;
  }

  const images = attachments.filter((a) => a.isImage);
  const lightboxIndex = images.findIndex((a) => a.url === lightboxUrl);
  const lightbox = lightboxIndex >= 0 ? images[lightboxIndex] : undefined;
  const showLightbox = (offset: number) =>
    setLightboxUrl(
      images[(lightboxIndex + offset + images.length) % images.length]?.url
    );

  const deleteAttachment = async (url: string) => {
    await deleteStorageObject(url);
    setLightboxUrl((prev) => (prev === url ? undefined : prev));
    onDelete?.(url);
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
          gap: 1,
        }}
      >
        {attachments.length === 0
          ? urls.map((url) => (
              <Skeleton key={url} variant="rounded" sx={{ aspectRatio: '1' }} />
            ))
          : attachments.map((attachment) => (
              <Box key={attachment.url} sx={{ position: 'relative' }}>
                <Tooltip title={attachment.name}>
                  <ButtonBase
                    focusRipple
                    {...(attachment.isImage
                      ? { onClick: () => setLightboxUrl(attachment.url) }
                      : {
                          component: 'a',
                          href: attachment.downloadUrl || '#',
                          target: '_blank',
                          rel: 'noopener noreferrer',
                        })}
                    sx={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: 'action.hover',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.5,
                      p: attachment.isImage ? 0 : 1,
                    }}
                  >
                    {attachment.isImage && attachment.downloadUrl ? (
                      <Box
                        component="img"
                        src={attachment.downloadUrl}
                        alt={attachment.name}
                        loading="lazy"
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <>
                        {attachment.isPdf ? (
                          <PictureAsPdfIcon color="action" />
                        ) : (
                          <InsertDriveFileIcon color="action" />
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            width: '100%',
                            textAlign: 'center',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            wordBreak: 'break-word',
                          }}
                        >
                          {attachment.name}
                        </Typography>
                      </>
                    )}
                  </ButtonBase>
                </Tooltip>
                {edit && (
                  <IconButton
                    size="small"
                    aria-label={t('deleteAttachment')}
                    onClick={() => setConfirmDeleteUrl(attachment.url)}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      color: 'common.white',
                      bgcolor: 'rgba(0, 0, 0, 0.5)',
                      '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.7)' },
                    }}
                  >
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                )}
              </Box>
            ))}
      </Box>

      {lightbox && (
        <Dialog open fullWidth maxWidth="lg" onClose={() => setLightboxUrl(undefined)}>
          <DialogTitle
            sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
          >
            <Box
              sx={{
                flexGrow: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {lightbox.name}
            </Box>
            <IconButton
              aria-label={tCommon('close')}
              onClick={() => setLightboxUrl(undefined)}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent
            sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}
          >
            {images.length > 1 && (
              <IconButton
                aria-label={t('previousImage')}
                onClick={() => showLightbox(-1)}
              >
                <ChevronLeftIcon />
              </IconButton>
            )}
            <Box
              component="img"
              src={lightbox.downloadUrl}
              alt={lightbox.name}
              sx={{
                flexGrow: 1,
                minWidth: 0,
                maxHeight: '75vh',
                objectFit: 'contain',
              }}
            />
            {images.length > 1 && (
              <IconButton
                aria-label={t('nextImage')}
                onClick={() => showLightbox(1)}
              >
                <ChevronRightIcon />
              </IconButton>
            )}
          </DialogContent>
          <DialogActions>
            {edit && (
              <Button
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setConfirmDeleteUrl(lightbox.url)}
              >
                {tCommon('delete')}
              </Button>
            )}
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => downloadStorageFile(lightbox.url)}
            >
              {t('download')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {confirmDeleteUrl && (
        <ConfirmDialog
          title={t('deleteAttachment')}
          text={t('deleteAttachmentConfirm', {
            name:
              attachments.find((a) => a.url === confirmDeleteUrl)?.name ?? '',
          })}
          onConfirm={async (confirmed) => {
            const url = confirmDeleteUrl;
            setConfirmDeleteUrl(undefined);
            if (confirmed && url) {
              await deleteAttachment(url);
            }
          }}
        />
      )}
    </>
  );
}
