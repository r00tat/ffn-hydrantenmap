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
  const [absenderName, setAbsenderName] = useState(config.absenderName);
  const [absenderAdresse, setAbsenderAdresse] = useState(config.absenderAdresse);
  const [absenderKontakt, setAbsenderKontakt] = useState(config.absenderKontakt);
  const [leistungstext, setLeistungstext] = useState(config.leistungstext);
  const [kontoinhaber, setKontoinhaber] = useState(config.kontoinhaber);
  const [iban, setIban] = useState(config.iban);
  const [bic, setBic] = useState(config.bic);
  const [zahlungszielTage, setZahlungszielTage] = useState(
    String(config.zahlungszielTage),
  );
  const [ustHinweis, setUstHinweis] = useState(config.ustHinweis);
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
    setAbsenderName(config.absenderName);
    setAbsenderAdresse(config.absenderAdresse);
    setAbsenderKontakt(config.absenderKontakt);
    setLeistungstext(config.leistungstext);
    setKontoinhaber(config.kontoinhaber);
    setIban(config.iban);
    setBic(config.bic);
    setZahlungszielTage(String(config.zahlungszielTage));
    setUstHinweis(config.ustHinweis);
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
        absenderName,
        absenderAdresse,
        absenderKontakt,
        leistungstext,
        kontoinhaber,
        iban,
        bic,
        zahlungszielTage: Number(zahlungszielTage) || 0,
        ustHinweis,
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
        <Typography variant="subtitle2">
          {t('rechnung.gruppeAbsender')}
        </Typography>
        <TextField
          label={t('rechnung.absenderName')}
          value={absenderName}
          onChange={(e) => setAbsenderName(e.target.value)}
          fullWidth
          helperText={t('rechnung.absenderNameHelp')}
        />
        <TextField
          label={t('rechnung.absenderAdresse')}
          value={absenderAdresse}
          onChange={(e) => setAbsenderAdresse(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
        <TextField
          label={t('rechnung.absenderKontakt')}
          value={absenderKontakt}
          onChange={(e) => setAbsenderKontakt(e.target.value)}
          fullWidth
          helperText={t('rechnung.absenderKontaktHelp')}
        />

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          {t('rechnung.gruppeZahlung')}
        </Typography>
        <TextField
          label={t('rechnung.kontoinhaber')}
          value={kontoinhaber}
          onChange={(e) => setKontoinhaber(e.target.value)}
          fullWidth
          helperText={t('rechnung.kontoinhaberHelp')}
        />
        <TextField
          label={t('rechnung.iban')}
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          fullWidth
          helperText={t('rechnung.ibanHelp')}
        />
        <TextField
          label={t('rechnung.bic')}
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          sx={{ maxWidth: 260 }}
        />
        <TextField
          label={t('rechnung.zahlungszielTage')}
          value={zahlungszielTage}
          onChange={(e) => setZahlungszielTage(e.target.value)}
          type="number"
          sx={{ maxWidth: 260 }}
          helperText={t('rechnung.zahlungszielTageHelp')}
        />
        <TextField
          label={t('rechnung.ustHinweis')}
          value={ustHinweis}
          onChange={(e) => setUstHinweis(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          helperText={t('rechnung.ustHinweisHelp')}
        />

        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          {t('rechnung.gruppeText')}
        </Typography>
        <TextField
          label={t('rechnung.leistungstext')}
          value={leistungstext}
          onChange={(e) => setLeistungstext(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          helperText={t('rechnung.leistungstextHelp')}
        />
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
        <Stack direction="row">
          <Button variant="contained" onClick={handleSave} disabled={speichert}>
            {t('rechnung.settingsSave')}
          </Button>
        </Stack>
      </Stack>
    </>
  );
}
