'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { MANGEL_MAX_IMAGES } from '../../common/mangel';
import type { MangelEingabe } from './mangelErfassung';

export interface MangelFelderProps {
  value: MangelEingabe;
  /** Erklärt, worauf sich der Mangel bezieht — im Füll- und Ausgabedialog nötig. */
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: MangelEingabe) => void;
}

/**
 * Beschreibung und Bilder eines Mangels.
 *
 * Als eigenes Bauteil, weil derselbe Block an drei Stellen steht: im eigenen
 * Mangel-Dialog der Ausrüstung und — seit die Sichtkontrolle einen Mangel
 * gleich mit erfassen soll — auch im Füll- und im Ausgabedialog.
 */
export default function MangelFelder({
  value,
  helperText,
  required,
  disabled,
  onChange,
}: MangelFelderProps) {
  const t = useTranslations('atemschutz');

  return (
    <Stack spacing={2}>
      <TextField
        fullWidth
        multiline
        minRows={2}
        required={required}
        disabled={disabled}
        label={t('ausruestung.mangelDescription')}
        helperText={helperText}
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
      />
      <Button
        component="label"
        startIcon={<PhotoCameraIcon />}
        disabled={disabled || value.images.length >= MANGEL_MAX_IMAGES}
      >
        {t('ausruestung.mangelImages')}
        <input
          type="file"
          hidden
          multiple
          accept="image/*"
          // `capture` bewusst nicht gesetzt: Damit ließe sich nur die Kamera
          // öffnen, und ein Foto aus der Galerie ist am Sammelplatz genauso
          // brauchbar.
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            onChange({
              ...value,
              images: [...value.images, ...files].slice(0, MANGEL_MAX_IMAGES),
            });
            // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt
            // werden kann — ohne das feuert `change` nicht noch einmal.
            e.target.value = '';
          }}
        />
      </Button>
      {value.images.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {value.images.map((file, index) => (
            <Chip
              key={`${file.name}-${index}`}
              label={file.name}
              deleteIcon={<DeleteIcon />}
              onDelete={() =>
                onChange({
                  ...value,
                  images: value.images.filter((_, i) => i !== index),
                })
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
