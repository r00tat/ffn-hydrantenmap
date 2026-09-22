'use client';

import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  formatDdm,
  formatDms,
  parseCoordinatePair,
  parseCoordinateValue,
} from '../../common/coordinates';

export interface CoordinateFieldsProps {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
}

/** Die vier Felder, jedes eine eigene Sicht auf dieselbe Position. */
type FieldKey = 'lat' | 'lng' | 'dms' | 'ddm';

/**
 * Die Position in drei Schreibweisen, jede davon beschreibbar.
 *
 * Der Anlass sind Koordinaten von außen — von Polizei oder LSZ kommt, was dort
 * im Einsatzleitsystem steht, und das ist mal Dezimalgrad und mal
 * Grad/Minuten/Sekunden. Umrechnen soll das niemand im Kopf, also nimmt jedes
 * Feld jede Schreibweise an; angezeigt wird in jedem Feld die seine.
 *
 * Gehalten wird immer nur **ein** Entwurf: das Feld, in dem gerade getippt
 * wird. Alle übrigen zeigen die gespeicherte Position. Damit gibt es keinen
 * Gleichlauf zwischen vier Zuständen zu pflegen — und nichts, was beim Tippen
 * unter den Fingern umformatiert wird.
 */
export default function CoordinateFields({
  lat,
  lng,
  onChange,
}: CoordinateFieldsProps) {
  const t = useTranslations('firecallItem.coordinates');
  const tField = useTranslations('firecall.fields');
  const [draft, setDraft] = useState<{ key: FieldKey; value: string }>();
  const [invalid, setInvalid] = useState(false);

  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const formatted: Record<FieldKey, string> = {
    lat: Number.isFinite(lat) ? String(lat) : '',
    lng: Number.isFinite(lng) ? String(lng) : '',
    dms: hasPosition ? formatDms(lat as number, lng as number) : '',
    ddm: hasPosition ? formatDdm(lat as number, lng as number) : '',
  };

  const valueOf = (key: FieldKey) =>
    draft?.key === key ? draft.value : formatted[key];

  const handleChange = useCallback(
    (key: FieldKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setDraft({ key, value });

      if (!value.trim()) {
        // Ein leeres Feld ist nichts Falsches, sondern ein halber Gedanke.
        setInvalid(false);
        return;
      }

      // Zuerst das ganze Paar: Wer aus einer Meldung kopiert, trifft nicht das
      // Feld der einzelnen Achse, und „47.9, 16.8" im Breitenfeld ist als Paar
      // gemeint und nicht als Breite.
      const pair = parseCoordinatePair(value);
      if (pair) {
        setInvalid(false);
        onChange(pair.lat, pair.lng);
        return;
      }

      if (key === 'lat' || key === 'lng') {
        const single = parseCoordinateValue(value, key);
        if (single !== undefined) {
          setInvalid(false);
          onChange(
            key === 'lat' ? single : ((lat ?? 0) as number),
            key === 'lng' ? single : ((lng ?? 0) as number)
          );
          return;
        }
      }

      setInvalid(true);
    },
    [lat, lng, onChange]
  );

  // Beim Verlassen zerfällt der Entwurf: Das Feld zeigt wieder die
  // gespeicherte Position, und halb Getipptes bleibt nicht als Text stehen.
  const handleBlur = useCallback(() => {
    setDraft(undefined);
    setInvalid(false);
  }, []);

  const common = (key: FieldKey) => ({
    value: valueOf(key),
    onChange: handleChange(key),
    onBlur: handleBlur,
    error: invalid && draft?.key === key,
    variant: 'standard' as const,
    margin: 'dense' as const,
    fullWidth: true,
  });

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {t('title')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField id="lat" label={tField('latitude')} {...common('lat')} />
        <TextField id="lng" label={tField('longitude')} {...common('lng')} />
      </Box>
      <TextField id="coordinates-dms" label={t('dms')} {...common('dms')} />
      <TextField id="coordinates-ddm" label={t('ddm')} {...common('ddm')} />
      <FormHelperText error={invalid}>
        {invalid ? t('invalid') : t('hint')}
      </FormHelperText>
    </Box>
  );
}
