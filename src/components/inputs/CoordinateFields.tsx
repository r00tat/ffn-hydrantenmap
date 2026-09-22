'use client';

import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  formatDdm,
  formatDecimal,
  formatDms,
  parseCoordinatePair,
  parseCoordinateValue,
} from '../../common/coordinates';
import {
  formatBmn,
  formatUtm,
  parseBmn,
  parseUtm,
  utmZone,
} from '../../common/coordinates-grid';

export interface CoordinateFieldsProps {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
}

/** Die sechs Felder, jedes eine eigene Sicht auf dieselbe Position. */
type FieldKey = 'lat' | 'lng' | 'dms' | 'ddm' | 'utm' | 'bmn';

/**
 * Die Position: angezeigt, und auf Klick in drei Schreibweisen beschreibbar.
 *
 * Der Anlass sind Koordinaten von außen — von Polizei oder LSZ kommt, was dort
 * im Einsatzleitsystem steht, und das ist mal Dezimalgrad, mal
 * Grad/Minuten/Sekunden, mal UTM von der ÖK und mal ein geteilter Standort aus
 * einer App. Umrechnen soll das niemand im Kopf, also nimmt jedes Feld jede
 * Schreibweise an; angezeigt wird in jedem Feld die seine.
 *
 * Voreingestellt ist aber die reine Anzeige. Eine Position kommt fast immer
 * von der Karte, und wer ein Element umbenennt, will nicht vier Zahlenfelder
 * vor sich haben, in die er versehentlich tippt. Erst der Stift klappt sie
 * auf — dann liegen alle Schreibweisen nebeneinander.
 *
 * Gehalten wird dabei immer nur **ein** Entwurf: das Feld, in dem gerade
 * getippt wird. Alle übrigen zeigen die gespeicherte Position. Damit gibt es
 * keinen Gleichlauf zwischen vier Zuständen zu pflegen — und nichts, was beim
 * Tippen unter den Fingern umformatiert wird.
 */
export default function CoordinateFields({
  lat,
  lng,
  onChange,
}: CoordinateFieldsProps) {
  const t = useTranslations('firecallItem.coordinates');
  const tField = useTranslations('firecall.fields');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ key: FieldKey; value: string }>();
  const [invalid, setInvalid] = useState(false);

  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const formatted: Record<FieldKey, string> = {
    lat: Number.isFinite(lat) ? String(lat) : '',
    lng: Number.isFinite(lng) ? String(lng) : '',
    dms: hasPosition ? formatDms(lat as number, lng as number) : '',
    ddm: hasPosition ? formatDdm(lat as number, lng as number) : '',
    utm: hasPosition ? formatUtm(lat as number, lng as number) : '',
    bmn: hasPosition ? formatBmn(lat as number, lng as number) : '',
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

      // Ein Gitterfeld liest zuerst sein eigenes Gitter: `638004 5312206` ist
      // dort eine Position und nicht zwei Winkel. Die Zone bleibt die, die im
      // Feld schon stand — wer nur die Zahlen tauscht, wechselt nicht den
      // Meridianstreifen.
      const grid =
        key === 'utm'
          ? parseUtm(value, Number.isFinite(lng) ? utmZone(lng as number) : undefined)
          : key === 'bmn'
            ? parseBmn(value)
            : undefined;
      if (grid) {
        setInvalid(false);
        onChange(grid.lat, grid.lng);
        return;
      }

      // Dann das ganze Paar: Wer aus einer Meldung kopiert, trifft nicht das
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

  const closeEditor = useCallback(() => {
    setEditing(false);
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flexGrow: 1 }}
        >
          {t('title')}
        </Typography>
        <Tooltip title={editing ? t('done') : t('edit')}>
          <IconButton
            size="small"
            aria-label={editing ? t('done') : t('edit')}
            onClick={editing ? closeEditor : () => setEditing(true)}
          >
            {editing ? (
              <CheckIcon fontSize="small" />
            ) : (
              <EditIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {!editing && (
        <Typography variant="body2">
          {hasPosition ? formatDecimal(lat as number, lng as number) : t('none')}
        </Typography>
      )}

      {editing && (
        <>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField id="lat" label={tField('latitude')} {...common('lat')} />
            <TextField id="lng" label={tField('longitude')} {...common('lng')} />
          </Box>
          <TextField id="coordinates-dms" label={t('dms')} {...common('dms')} />
          <TextField id="coordinates-ddm" label={t('ddm')} {...common('ddm')} />
          <TextField id="coordinates-utm" label={t('utm')} {...common('utm')} />
          <TextField id="coordinates-bmn" label={t('bmn')} {...common('bmn')} />
          <FormHelperText error={invalid}>
            {invalid ? t('invalid') : t('hint')}
          </FormHelperText>
        </>
      )}
    </Box>
  );
}
