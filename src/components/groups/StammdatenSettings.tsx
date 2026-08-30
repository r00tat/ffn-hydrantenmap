'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  saveGroupStammdaten,
  signStammdatenLogo,
} from '../../app/groups/stammdatenActions';
import useGroupStammdaten from '../../hooks/useGroupStammdaten';
import { uploadStammdatenLogo } from './uploadStammdatenLogo';

export interface StammdatenSettingsProps {
  groupId: string;
}

/**
 * Absender, Bankverbindung und Logo einer Gruppe.
 *
 * Liegt in der Verwaltung und ist von der Atemschutz- *und* der
 * Kostenersatz-Seite aus erreichbar: Wenn ein Beleg nicht stimmt, ist man
 * genau an einer dieser beiden Stellen.
 *
 * Das Formular startet leer und übernimmt bewusst nichts aus den früheren
 * Feldern der Atemschutz-Rechnungskonfiguration — die Bankverbindung wird
 * einmal von Hand eingetragen und gilt danach für beides.
 */
export default function StammdatenSettings({ groupId }: StammdatenSettingsProps) {
  const t = useTranslations('stammdaten');
  const stammdaten = useGroupStammdaten(groupId);

  /** Die sechs Textfelder plus der Logopfad — der bearbeitbare Teil. */
  type Formularfeld =
    | 'absenderName'
    | 'absenderAdresse'
    | 'absenderKontakt'
    | 'kontoinhaber'
    | 'iban'
    | 'bic'
    | 'logoPath';

  // Der Entwurf liegt *über* dem gespeicherten Stand, statt ihn im Effekt in
  // die Felder zu kopieren. Zwei Gründe: Ein `setState` im Effekt-Rumpf löst
  // eine Renderkaskade aus (ESLint `react-hooks/set-state-in-effect`), und ein
  // Schnappschuss, der während des Tippens eintrifft, überschriebe sonst die
  // Eingabe.
  const [entwurf, setEntwurf] = useState<Partial<Record<Formularfeld, string>>>({});
  const [lokaleVorschau, setLokaleVorschau] = useState<string>();
  const [signiert, setSigniert] = useState<{ logoPath: string; url?: string }>();
  const [fehler, setFehler] = useState<string>();
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [laedtHoch, setLaedtHoch] = useState(false);

  const feld = useCallback(
    (name: Formularfeld): string =>
      entwurf[name] ?? (name === 'logoPath' ? (stammdaten.logoPath ?? '') : stammdaten[name]),
    [entwurf, stammdaten],
  );

  const setzeFeld = useCallback((name: Formularfeld, wert: string) => {
    setEntwurf((bisher) => ({ ...bisher, [name]: wert }));
  }, []);

  const logoPath = feld('logoPath');

  // Die Vorschau geht über eine Signed URL: Die Storage-Regel sperrt das
  // Lesen, weil sie die Gruppenmitgliedschaft nicht prüfen kann.
  useEffect(() => {
    if (!stammdaten.logoPath) return;
    let abgebrochen = false;
    const pfad = stammdaten.logoPath;
    signStammdatenLogo({ groupId }).then((result) => {
      if (!abgebrochen) setSigniert({ logoPath: pfad, url: result.url });
    });
    return () => {
      abgebrochen = true;
    };
  }, [groupId, stammdaten.logoPath]);

  // Das eben ausgewählte Bild hat Vorrang: Es liegt schon im Storage, aber
  // erst mit dem Speichern im Dokument.
  const logoUrl =
    lokaleVorschau ?? (signiert?.logoPath === logoPath ? signiert.url : undefined);

  const handleLogo = useCallback(
    async (file?: File) => {
      if (!file) return;
      setLaedtHoch(true);
      setFehler(undefined);
      const result = await uploadStammdatenLogo(groupId, file);
      setLaedtHoch(false);
      if (result.error) {
        setFehler(result.error);
        return;
      }
      // Nur im Formular vermerkt — wirksam wird es mit dem Speichern, wie
      // jedes andere Feld auch.
      setzeFeld('logoPath', result.logoPath ?? '');
      setLokaleVorschau(URL.createObjectURL(file));
    },
    [groupId, setzeFeld],
  );

  const handleSave = useCallback(async () => {
    setSpeichert(true);
    setFehler(undefined);
    setGespeichert(false);
    const result = await saveGroupStammdaten({
      groupId,
      stammdaten: {
        absenderName: feld('absenderName'),
        absenderAdresse: feld('absenderAdresse'),
        absenderKontakt: feld('absenderKontakt'),
        kontoinhaber: feld('kontoinhaber'),
        iban: feld('iban'),
        bic: feld('bic'),
        logoPath: logoPath || undefined,
      },
    });
    setSpeichert(false);
    if (result.success) {
      setGespeichert(true);
      // Ab jetzt trägt wieder der Schnappschuss: Der Entwurf hat seinen Zweck
      // erfüllt und stünde sonst auch nach einer Änderung von anderer Seite
      // weiter im Formular.
      setEntwurf({});
      setLokaleVorschau(undefined);
    } else {
      setFehler(result.error ?? 'saveFailed');
    }
  }, [groupId, feld, logoPath]);

  return (
    <>
      <Divider sx={{ my: 4 }} />
      <Typography variant="h6" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('intro')}
      </Typography>
      <Stack spacing={2} sx={{ maxWidth: 700, mt: 2 }}>
        {fehler && (
          <Alert severity="error">
            {/* Der Schlüssel kommt aus Upload oder Action und ist immer einer
                aus diesem Namespace. */}
            {t(fehler as 'saveFailed')}
          </Alert>
        )}
        {gespeichert && <Alert severity="success">{t('saved')}</Alert>}

        <Typography variant="subtitle2">{t('absender')}</Typography>
        <TextField
          label={t('absenderName')}
          value={feld('absenderName')}
          onChange={(e) => setzeFeld('absenderName', e.target.value)}
          fullWidth
          helperText={t('absenderNameHelp')}
        />
        <TextField
          label={t('absenderAdresse')}
          value={feld('absenderAdresse')}
          onChange={(e) => setzeFeld('absenderAdresse', e.target.value)}
          fullWidth
          multiline
          minRows={2}
          helperText={t('absenderAdresseHelp')}
        />
        <TextField
          label={t('absenderKontakt')}
          value={feld('absenderKontakt')}
          onChange={(e) => setzeFeld('absenderKontakt', e.target.value)}
          fullWidth
          helperText={t('absenderKontaktHelp')}
        />

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          {t('zahlung')}
        </Typography>
        <TextField
          label={t('kontoinhaber')}
          value={feld('kontoinhaber')}
          onChange={(e) => setzeFeld('kontoinhaber', e.target.value)}
          fullWidth
          helperText={t('kontoinhaberHelp')}
        />
        <TextField
          label={t('iban')}
          value={feld('iban')}
          onChange={(e) => setzeFeld('iban', e.target.value)}
          fullWidth
          helperText={t('ibanHelp')}
        />
        <TextField
          label={t('bic')}
          value={feld('bic')}
          onChange={(e) => setzeFeld('bic', e.target.value)}
          sx={{ maxWidth: 260 }}
          helperText={t('bicHelp')}
        />

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          {t('logo')}
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          {t('logoHelp')}
        </Typography>
        {logoUrl ? (
          <Box
            component="img"
            src={logoUrl}
            alt={t('logo')}
            sx={{ maxWidth: 260, maxHeight: 120, objectFit: 'contain' }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('logoNone')}
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" component="label" disabled={laedtHoch}>
            {t('logoUpload')}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg"
              onChange={(e) => handleLogo(e.target.files?.[0])}
            />
          </Button>
          {!!logoPath && (
            <Button
              color="inherit"
              onClick={() => {
                setzeFeld('logoPath', '');
                setLokaleVorschau(undefined);
              }}
            >
              {t('logoRemove')}
            </Button>
          )}
        </Stack>

        <Stack direction="row">
          <Button variant="contained" onClick={handleSave} disabled={speichert}>
            {t('save')}
          </Button>
        </Stack>
      </Stack>
    </>
  );
}
