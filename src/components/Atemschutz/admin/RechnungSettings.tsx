'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FUELLUNG_TARIF_IDS } from '../../../common/atemschutzRechnung';
import useAtemschutzRechnungConfig from '../../../hooks/useAtemschutzRechnungConfig';
import { saveAtemschutzRechnungConfig } from '../rechnungActions';

export interface RechnungSettingsProps {
  groupId: string;
}

/**
 * Betreff, Text, CC, Bankverbindung und Vorgabetarif der Füllungsrechnungen.
 *
 * Liegt in der Verwaltung und nicht auf der Verrechnungsseite: Die Werte
 * gelten für alle Rechnungen der Gruppe, sind keine Tagesarbeit und stehen
 * hinter `actionGroupAdminRequired`.
 */
export default function RechnungSettings({ groupId }: RechnungSettingsProps) {
  const t = useTranslations('atemschutz');
  const config = useAtemschutzRechnungConfig(groupId);

  const [ccEmail, setCcEmail] = useState(config.ccEmail);
  const [subjectTemplate, setSubjectTemplate] = useState(
    config.subjectTemplate,
  );
  const [bodyTemplate, setBodyTemplate] = useState(config.bodyTemplate);
  const [bankText, setBankText] = useState(config.bankText);
  const [vorgabeTarif, setVorgabeTarif] = useState(config.vorgabeTarif);
  const [fehler, setFehler] = useState<string>();
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  // Die Konfiguration kommt über ein Abonnement und ist beim ersten Rendern
  // noch die Vorgabe — die Felder ziehen nach, sobald sie da ist.
  useEffect(() => {
    setCcEmail(config.ccEmail);
    setSubjectTemplate(config.subjectTemplate);
    setBodyTemplate(config.bodyTemplate);
    setBankText(config.bankText);
    setVorgabeTarif(config.vorgabeTarif);
  }, [config]);

  const handleSave = async () => {
    setSpeichert(true);
    setFehler(undefined);
    setGespeichert(false);
    const result = await saveAtemschutzRechnungConfig({
      groupId,
      config: {
        ccEmail,
        subjectTemplate,
        bodyTemplate,
        bankText,
        vorgabeTarif,
      },
    });
    setSpeichert(false);
    if (result.success) setGespeichert(true);
    else setFehler(result.error ?? 'saveFailed');
  };

  return (
    <>
      <Divider sx={{ my: 4 }} />
      <Typography variant="h6" gutterBottom>
        {t('rechnung.settingsTitle')}
      </Typography>
      <Stack spacing={2} sx={{ maxWidth: 700 }}>
        {fehler && <Alert severity="error">{t(`errors.${fehler}` as 'errors.saveFailed')}</Alert>}
        {gespeichert && (
          <Alert severity="success">{t('rechnung.settingsSaved')}</Alert>
        )}
        <TextField
          label={t('rechnung.ccEmail')}
          value={ccEmail}
          onChange={(e) => setCcEmail(e.target.value)}
          fullWidth
          helperText={t('rechnung.ccEmailHelp')}
        />
        <TextField
          select
          label={t('rechnung.vorgabeTarif')}
          value={vorgabeTarif}
          onChange={(e) => setVorgabeTarif(e.target.value)}
          sx={{ maxWidth: 260 }}
          helperText={t('rechnung.vorgabeTarifHelp')}
        >
          {FUELLUNG_TARIF_IDS.map((tarifId) => (
            <MenuItem key={tarifId} value={tarifId}>
              {tarifId}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('rechnung.subjectTemplate')}
          value={subjectTemplate}
          onChange={(e) => setSubjectTemplate(e.target.value)}
          fullWidth
        />
        <TextField
          label={t('rechnung.bodyTemplate')}
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          fullWidth
          multiline
          minRows={8}
        />
        <Typography variant="caption" color="text.secondary" component="div">
          {t('rechnung.platzhalter')}
        </Typography>
        <TextField
          label={t('rechnung.bankText')}
          value={bankText}
          onChange={(e) => setBankText(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          helperText={t('rechnung.bankTextHelp')}
        />
        <Stack direction="row">
          <Button variant="contained" onClick={handleSave} disabled={speichert}>
            {t('rechnung.settingsSave')}
          </Button>
        </Stack>
      </Stack>
    </>
  );
}
