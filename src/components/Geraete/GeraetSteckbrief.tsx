'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import type { Geraet } from '../../common/geraet';

export interface GeraetSteckbriefProps {
  geraet: Geraet;
  /**
   * Nur, was ein Gerät im Einsatz kenntlich macht — ohne Besitzer,
   * Kostenersatz-Position und Material-Typ, die dort niemand braucht.
   */
  compact?: boolean;
}

/**
 * Die Stammdaten eines Artikels aus Sybos als Liste „Feld: Wert"; leere Felder
 * fehlen. Gezeigt in der Lagerverwaltung und beim Erfassen im Einsatz — dort
 * entscheidet erst das hier, welches von zwei gleichnamigen Geräten gemeint
 * ist.
 */
export default function GeraetSteckbrief({ geraet, compact = false }: GeraetSteckbriefProps) {
  const t = useTranslations('geraete.fields');
  const format = useFormatter();

  const date = (iso?: string) =>
    iso ? format.dateTime(new Date(`${iso}T00:00:00`), { dateStyle: 'medium' }) : undefined;
  const join = (values: (string | undefined)[], separator: string) =>
    values.filter(Boolean).join(separator) || undefined;

  const rows: [string, string | undefined, boolean?][] = [
    [t('inventarNr'), geraet.inventarNr],
    [t('zusatzInventarNr'), compact ? undefined : geraet.zusatzInventarNr],
    [t('barcodes'), join(geraet.barcodes ?? [], ', ')],
    [t('vorlage'), geraet.vorlage],
    [t('klasse'), join([geraet.klasse1, geraet.klasse2, geraet.klasse3], ' / ')],
    [t('materialTyp'), compact ? undefined : geraet.materialTyp],
    [t('hersteller'), join([geraet.hersteller, geraet.herstellerTyp], ' · ')],
    [t('seriennummer'), geraet.seriennummer],
    [t('baujahr'), geraet.baujahr != null ? String(geraet.baujahr) : undefined],
    [t('anschaffungsDatum'), compact ? undefined : date(geraet.anschaffungsDatum)],
    [t('verfuegbarBis'), date(geraet.verfuegbarBis)],
    [
      t('lebensdauer'),
      compact || geraet.lebensdauer == null
        ? undefined
        : join([String(geraet.lebensdauer), geraet.lebensdauerEinheit], ' '),
    ],
    [t('besitzer'), compact ? undefined : geraet.besitzer],
    [t('kostenersatzRateId'), compact ? undefined : geraet.kostenersatzRateId],
    [t('bemerkung'), geraet.bemerkung, true],
    [t('zubehoer'), geraet.zubehoer, true],
  ];

  const visible = rows.filter(([, value]) => !!value);
  if (visible.length === 0) return null;

  return (
    <Stack spacing={0.5}>
      {visible.map(([label, value, multiline]) => (
        <Typography
          key={label}
          variant="body2"
          sx={multiline ? { whiteSpace: 'pre-line' } : undefined}
        >
          <Typography component="span" variant="body2" color="text.secondary">
            {label}:
          </Typography>
          {multiline && value?.includes('\n') ? '\n' : ' '}
          {value}
        </Typography>
      ))}
    </Stack>
  );
}
