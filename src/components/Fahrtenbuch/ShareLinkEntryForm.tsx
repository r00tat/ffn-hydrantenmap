'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ShareLinkFormData } from '../../common/fahrtenbuchShare';
import FahrtenbuchEntryFields from './FahrtenbuchEntryFields';
import { createFahrtenbuchEntryViaShareLink } from './fahrtenbuchActions';
import { useEntryFormState } from './useEntryFormState';

export interface ShareLinkEntryFormProps {
  token: string;
  data: ShareLinkFormData;
  /**
   * Fahrzeug aus dem Link (`?fahrzeug=…`) — für Aufkleber im Fahrzeug. Die
   * Seite prüft vorher, dass die ID zu einem aktiven Fahrzeug gehört.
   */
  vehicleId?: string;
}

function ShareLinkFormBody({
  token,
  data,
  vehicleId,
  onSaved,
}: ShareLinkEntryFormProps & { onSaved: () => void }) {
  const t = useTranslations('fahrtenbuchShare');
  const containerRef = useRef<HTMLDivElement>(null);

  // `firecalls` bleibt undefiniert — daran erkennt `FahrtenbuchEntryFields`,
  // dass es keine Einsatzauswahl anbieten darf.
  const form = useEntryFormState({
    vehicles: data.vehicles,
    // Der Link gewinnt gegen den Einzelfahrzeug-Fall — beide sagen dasselbe,
    // wenn die Gruppe nur ein Fahrzeug hat.
    vehicleId:
      vehicleId ?? (data.vehicles.length === 1 ? data.vehicles[0].id : undefined),
    onSubmit: (input) => createFahrtenbuchEntryViaShareLink(token, input),
  });

  return (
    <Paper ref={containerRef} sx={{ p: 2, mt: 2 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('notice')}
      </Alert>
      <FahrtenbuchEntryFields form={form} persons={data.persons} />
      <Stack direction="row" sx={{ mt: 3, justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          disabled={form.saving}
          onClick={async () => {
            const result = await form.submit();
            if (result.success) {
              onSaved();
              return;
            }
            // Die Meldungen stehen am Anfang des Formulars, dieser Button an
            // seinem Ende — auf einem Telefon misst das Formular zwei bis drei
            // Bildschirmhöhen. Ohne den Sprung nach oben sähe eine Ablehnung
            // für den Gast wie ein toter Button aus.
            containerRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }}
        >
          {t('submit')}
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Erfassung hinter einem geteilten Link: kein Listenzugriff, keine
 * Einsatzauswahl, keine Navigation in die App.
 *
 * Zwei Komponenten, weil `useEntryFormState` seinen Anfangszustand nur beim
 * Mounten liest — der Formularteil muss also separat unmountbar sein (dieselbe
 * Begründung wie beim Dialog in `FahrtenbuchPage`).
 */
export default function ShareLinkEntryForm({
  token,
  data,
  vehicleId,
}: ShareLinkEntryFormProps) {
  const t = useTranslations('fahrtenbuchShare');
  const router = useRouter();
  const [showForm, setShowForm] = useState(true);
  const savedTitleRef = useRef<HTMLSpanElement>(null);

  // Beim Wechsel auf die Bestätigung wird der fokussierte Button unmountet und
  // der Fokus fiele auf <body> — ein Screenreader meldete dann nichts.
  useEffect(() => {
    if (!showForm) savedTitleRef.current?.focus();
  }, [showForm]);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      {data.groupName && (
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          {data.groupName}
        </Typography>
      )}

      {data.vehicles.length === 0 ? (
        <Alert severity="info">{t('noVehicles')}</Alert>
      ) : showForm ? (
        <ShareLinkFormBody
          token={token}
          data={data}
          vehicleId={vehicleId}
          // Die Bestätigung ersetzt das Formular — das ist zugleich der Schutz
          // gegen ein zweites Absenden derselben Fahrt.
          onSaved={() => setShowForm(false)}
        />
      ) : (
        <Paper role="status" sx={{ p: 3, mt: 2 }}>
          <Typography variant="h6" gutterBottom ref={savedTitleRef} tabIndex={-1}>
            {t('savedTitle')}
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            {/* Fehlt das Gruppendokument, ist `groupName` leer — die Variante
                mit Platzhalter läse sich sonst als „der Gruppe . gespeichert". */}
            {data.groupName
              ? t('savedText', { group: data.groupName })
              : t('savedTextNoGroup')}
          </Typography>
          <Button
            variant="outlined"
            sx={{ mt: 2 }}
            onClick={() => {
              // `data` stammt aus dem Server-Render beim Seitenaufruf. Ohne
              // Neuladen bekäme die zweite Fahrt den Startzähler von *vor* der
              // ersten vorbelegt und die Plausibilitätswarnung rechnete gegen
              // den falschen Referenzwert. Die Route ist `force-dynamic`,
              // `refresh()` holt die Stammdaten also frisch vom Server.
              router.refresh();
              setShowForm(true);
            }}
          >
            {t('another')}
          </Button>
        </Paper>
      )}
    </Container>
  );
}
