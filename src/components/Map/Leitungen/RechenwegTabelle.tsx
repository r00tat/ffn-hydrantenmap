'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type {
  RechenSchritt,
  RechenwegHerkunft,
} from '../../FirecallItems/elements/connection/rechenweg';

/**
 * Der Rechenweg als Tabelle: Größe, Rechnung mit eingesetzten Zahlen, Wert und
 * Herkunft.
 *
 * Die Spalte **Herkunft** ist der Grund, dass es die Tabelle gibt. Eine Kette
 * von Rechnungen sagt für sich nur, dass richtig gerechnet wurde; belastbar ist
 * das Ergebnis aber nur so weit wie seine schwächste Eingangsgröße. Ein
 * Planungswert ohne Unterlage sieht im Ergebnis genauso aus wie ein
 * Tabellenwert aus der Ausbildungsunterlage — hier nicht mehr.
 *
 * Eine Tabelle und keine Aufzählung, weil die Werte übereinanderstehend
 * vergleichbar sind; sie scrollt waagrecht in ihrem eigenen Kasten, weil das
 * Panel über der Karte am Handy schmal ist.
 */

export interface RechenwegTabelleProps {
  schritte: RechenSchritt[];
}

/**
 * Farbe je Herkunft.
 *
 * `warning` für den Planungswert ist Absicht und keine Fehlermeldung: Es ist
 * die einzige Herkunft, bei der es nichts nachzuschlagen gibt, und genau die
 * soll ins Auge fallen.
 */
const HERKUNFT_COLOR: Record<
  RechenwegHerkunft,
  'default' | 'primary' | 'success' | 'info' | 'warning'
> = {
  eingabe: 'default',
  vorgabe: 'warning',
  tabelle: 'success',
  gemessen: 'info',
  abgeleitet: 'default',
  gerechnet: 'primary',
};

/**
 * Die Aufschriften als Paare statt `t(`origin_${herkunft}`)`: next-intl prüft
 * die Schlüssel statisch, ein zusammengesetzter Schlüssel ist keiner.
 */
const HERKUNFT_LABEL: Record<
  RechenwegHerkunft,
  | 'originInput'
  | 'originDefault'
  | 'originTable'
  | 'originMeasured'
  | 'originDerived'
  | 'originComputed'
> = {
  eingabe: 'originInput',
  vorgabe: 'originDefault',
  tabelle: 'originTable',
  gemessen: 'originMeasured',
  abgeleitet: 'originDerived',
  gerechnet: 'originComputed',
};

export default function RechenwegTabelle({ schritte }: RechenwegTabelleProps) {
  const t = useTranslations('loeschwasserfoerderung');

  if (schritte.length === 0) return null;

  return (
    <>
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ px: 2, pb: 1 }}
      >
        {t('rechenwegHint')}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('stepName')}</TableCell>
              <TableCell>{t('stepCalculation')}</TableCell>
              <TableCell align="right">{t('stepValue')}</TableCell>
              <TableCell>{t('stepOrigin')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {schritte.map((schritt) => (
              <TableRow key={schritt.label}>
                <TableCell
                  sx={schritt.ergebnis ? { fontWeight: 'bold' } : undefined}
                >
                  {t(schritt.label)}
                  {schritt.hinweis && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="div"
                    >
                      {t(schritt.hinweis)}
                    </Typography>
                  )}
                </TableCell>
                {/* Die Rechnung bricht nicht um: „2 · 2000 m / 666,7 m/min"
                    über zwei Zeilen verteilt ist schwerer zu lesen als eine
                    Tabelle, die waagrecht scrollt. */}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {schritt.rechnung ?? ''}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    whiteSpace: 'nowrap',
                    ...(schritt.ergebnis ? { fontWeight: 'bold' } : {}),
                  }}
                >
                  {schritt.wert === undefined
                    ? '—'
                    : `${schritt.wert}${
                        schritt.einheit ? ` ${schritt.einheit}` : ''
                      }`}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={HERKUNFT_COLOR[schritt.herkunft]}
                    label={t(HERKUNFT_LABEL[schritt.herkunft])}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </>
  );
}
