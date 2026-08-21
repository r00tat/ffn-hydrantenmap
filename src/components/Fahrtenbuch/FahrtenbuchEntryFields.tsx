'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import RouteIcon from '@mui/icons-material/Route';
import Autocomplete from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useFormatter, useTranslations } from 'next-intl';
import {
  FAHRT_ZWECKE,
  requiresDriver,
  type FahrtZweck,
} from '../../common/fahrtenbuch';
import CounterFields from './CounterFields';
import {
  fromLocalInput,
  toLocalInput,
  type EntryFormPerson,
  type EntryFormState,
} from './useEntryFormState';

export interface FahrtenbuchEntryFieldsProps {
  form: EntryFormState;
  persons: EntryFormPerson[];
}

/**
 * Die Felder einer Fahrt — rein darstellend. Zustand und Validierung liegen in
 * `useEntryFormState`, damit Dialog und Gastformular dasselbe Verhalten haben.
 */
export default function FahrtenbuchEntryFields({
  form,
  persons,
}: FahrtenbuchEntryFieldsProps) {
  const t = useTranslations('fahrtenbuch');
  const format = useFormatter();

  /** Fahrer und Zeitraum einer bestehenden Fahrt, für die Hinweise. */
  const describeEntry = (entry: { driverName?: string; abfahrt: string }) =>
    t('duplicate.entry', {
      driver: entry.driverName?.trim() || t('duplicate.noDriver'),
      time: format.dateTime(new Date(entry.abfahrt), {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    });

  return (
    <>
      {form.saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {form.saveError}
        </Alert>
      )}
      {form.errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {form.errors.map((error) => (
            <div key={error}>{form.errorMessage(error)}</div>
          ))}
        </Alert>
      )}
      <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12 }}>
          <TextField
            select
            fullWidth
            label={t('vehicle')}
            value={form.selectedVehicleId}
            onChange={(e) => form.changeVehicle(e.target.value)}
          >
            {form.vehicles.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        {/* Alles Weitere hängt am Fahrzeug: Zähler und Betriebsmittel kommen
            aus seinen Stammdaten, und der Startzählerstand aus seinem Cache.
            Ohne Auswahl stand vorher ein halbes Formular da, dem sichtbar der
            Kilometerstand fehlte. */}
        {!form.selectedVehicleId ? (
          <Grid size={{ xs: 12 }}>
            <Alert severity="info">{t('selectVehicleHint')}</Alert>
          </Grid>
        ) : (
          <>
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                freeSolo
                options={persons.map((p) => p.name)}
                value={form.driverName}
                onInputChange={(_, value) =>
                  form.changeDriver(
                    value,
                    persons.find((p) => p.name === value)?.id,
                  )
                }
                renderInput={(params) => (
                  <TextField {...params} label={t('driver')} />
                )}
              />
            </Grid>
            {/* Nur bei einer Einheit, die überhaupt einen Fahrer hat: Bei einem
                Anhänger verwirft der Server die Angabe, und die Oberfläche soll
                nicht anbieten, was verworfen wird. */}
            {requiresDriver(form.definitions) && (
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  multiple
                  freeSolo
                  options={persons.map((p) => p.name)}
                  value={form.coDrivers.map((ref) => ref.name)}
                  onChange={(_, values) =>
                    form.changeCoDrivers(
                      values.map((name) => {
                        const person = persons.find((p) => p.name === name);
                        return person?.id
                          ? { id: person.id, name: person.name }
                          : { name };
                      }),
                    )
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('coDrivers')}
                      helperText={t('coDriversHint')}
                      error={form.errors.includes('coDriversTooMany')}
                    />
                  )}
                />
              </Grid>
            )}
            {/* Zuerst der Einsatz, dann Zweck und Ziel: Die Zuordnung zu
                einem Einsatz ist der Regelfall und trägt die Duplikats- und
                Kilometerprüfungen. Stand das Feld hinter dem Ziel und nur bei
                schon gesetztem Zweck „Einsatz", blieb es meist leer.

                Ohne Einsatzliste (Gastformular) entfällt die Auswahl ganz — der
                Zweck „Einsatz" bleibt wählbar, nur ohne Verknüpfung. Ein freier
                Name wäre dort unkontrollierter Fremdinhalt; der Server verwirft
                ihn ohnehin. `hasFirecallSelection` statt Truthiness auf
                `firecalls`, weil eine leere Liste („noch keine Einsätze
                geladen") das Feld zeigen soll, `undefined` (Gastformular)
                aber nicht. */}
            {form.hasFirecallSelection && (
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  freeSolo
                  options={form.firecalls ?? []}
                  // Beide Richtungen nötig: `options` sind Objekte, der Wert im
                  // Feld ist bei freier Eingabe eine Zeichenkette.
                  getOptionLabel={(option) =>
                    typeof option === 'string' ? option : option.name
                  }
                  // Ohne das nimmt MUI das Label als React-Key. Zwei
                  // gleichnamige Einsätze — „G1 Ölspur" gibt es jedes Jahr
                  // mehrfach — kollidieren dann, und React verwirft einen der
                  // beiden Einträge aus der Liste.
                  getOptionKey={(option) =>
                    typeof option === 'string' ? option : option.id
                  }
                  value={form.firecallName}
                  onChange={(_, option) => {
                    if (option && typeof option !== 'string') {
                      form.changeFirecall(option.id, option.name);
                    } else {
                      form.changeFirecall(undefined, option ?? '');
                    }
                  }}
                  // Tippen ohne Auswahl ist der manuelle Fall. Kein Abgleich gegen
                  // die Liste: ein zufällig gleichlautender Name soll nicht
                  // stillschweigend zu einer Verknüpfung werden.
                  onInputChange={(_, text, reason) => {
                    if (reason === 'input')
                      form.changeFirecall(undefined, text);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('firecall')}
                      helperText={t('firecallHint')}
                    />
                  )}
                />
              </Grid>
            )}
            {/* Der Duplikatshinweis steht beim Einsatzfeld, weil er von dieser
                Auswahl kommt — und über dem Speichern-Knopf, damit er nicht
                erst nach dem Scrollen auffällt. */}
            {form.duplicateEntry && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="warning">
                  <AlertTitle>{t('duplicate.title')}</AlertTitle>
                  {describeEntry(form.duplicateEntry)}
                  <FormControlLabel
                    sx={{ display: 'block', mt: 1 }}
                    control={
                      <Checkbox
                        checked={form.duplicateConfirmed}
                        onChange={(e) =>
                          form.setDuplicateConfirmed(e.target.checked)
                        }
                      />
                    }
                    label={t('duplicate.confirm')}
                  />
                </Alert>
              </Grid>
            )}
            {/* Nur ein Hinweis: Zeiten sind im Einsatz oft geschätzt. Findet
                auch das Duplikat einer Fahrt ohne Einsatzverknüpfung. */}
            {form.overlappingEntries.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="warning">
                  <AlertTitle>{t('overlap.title')}</AlertTitle>
                  {form.overlappingEntries.map((e) => (
                    <div key={e.id}>{describeEntry(e)}</div>
                  ))}
                </Alert>
              </Grid>
            )}
            {form.firecallLinkMissing && form.hasFirecallSelection && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info">{t('firecallLinkMissing')}</Alert>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label={t('zweck')}
                value={form.zweck}
                onChange={(e) => form.changeZweck(e.target.value as FahrtZweck)}
              >
                {FAHRT_ZWECKE.map((z) => (
                  <MenuItem key={z} value={z}>
                    {t(`zwecke.${z}` as 'zwecke.einsatz')}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* Nur ohne verknüpften Einsatz — der Einsatz benennt das Ziel
                selbst, und ein zweites Feld dafür wäre eine Angabe, die
                niemand machen muss. Jede andere Fahrt stünde ohne das Feld
                dagegen ohne Angabe da, wohin sie ging; dort ist es Pflicht.
                Ausgeblendet wird es nicht bloß versteckt: `submit` schickt das
                Ziel dann leer mit, damit kein Text wirkt, den keiner sieht. */}
            {!form.zielCoveredByFirecall && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  required
                  label={t('ziel')}
                  error={form.errors.includes('zielMissing')}
                  value={form.ziel}
                  onChange={(e) => form.setZiel(e.target.value)}
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="datetime-local"
                label={t('abfahrt')}
                value={toLocalInput(form.abfahrt)}
                onChange={(e) =>
                  form.changeAbfahrt(fromLocalInput(e.target.value))
                }
                error={form.timeOrderInvalid}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {/* Verdrehte Zeiten sofort am Feld, nicht erst als Meldung nach
                  dem Speichern-Versuch. Abgelehnt wird sie ohnehin — die
                  Prüfung steht in `validateEntryInput` und gilt damit auch
                  serverseitig. */}
              <TextField
                fullWidth
                type="datetime-local"
                label={t('ankunft')}
                value={toLocalInput(form.ankunft)}
                onChange={(e) =>
                  form.setAnkunft(fromLocalInput(e.target.value))
                }
                error={form.timeOrderInvalid}
                helperText={
                  form.timeOrderInvalid
                    ? t('errors.ankunftBeforeAbfahrt')
                    : undefined
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CounterFields
                definitions={form.definitions}
                counters={form.counters}
                lastCounters={form.lastCounters}
                onChange={form.setCounters}
              />
            </Grid>
            {/* Die Sammelerfassung holt sich die Strecke beim Speichern selbst;
                beim einzelnen Eintrag musste den Kilometerstand bisher jeder
                von Hand ausrechnen. Nur bei verknüpftem Einsatz — hinter einem
                frei eingetippten Namen stehen keine Koordinaten. */}
            {form.canCalculateDistance && (
              <Grid size={{ xs: 12 }}>
                <Button
                  size="small"
                  startIcon={<RouteIcon />}
                  onClick={form.calculateDistance}
                  disabled={form.distanceBusy}
                >
                  {t('calculateDistance')}
                </Button>
                {form.distanceResult && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    {form.distanceResult.source === 'estimate'
                      ? t('calculateDistanceEstimated', {
                          km: form.distanceResult.roundTripKm,
                        })
                      : t('calculateDistanceRoute', {
                          km: form.distanceResult.roundTripKm,
                        })}
                  </Alert>
                )}
                {form.distanceError && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {t('calculateDistanceFailed')}
                  </Alert>
                )}
              </Grid>
            )}
            {(form.vehicle?.fuelTypes ?? []).map((fuel) => (
              <Grid size={{ xs: 12, sm: 4 }} key={fuel}>
                <TextField
                  fullWidth
                  type="number"
                  label={t(`fuel.${fuel}` as 'fuel.diesel')}
                  value={form.betriebsmittel[fuel] ?? ''}
                  onChange={(e) =>
                    form.setBetriebsmittel({
                      ...form.betriebsmittel,
                      [fuel]:
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </Grid>
            ))}
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label={t('hinweise')}
                value={form.hinweise}
                onChange={(e) => form.setHinweise(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.defekt}
                    onChange={(e) => form.setDefekt(e.target.checked)}
                  />
                }
                label={t('defekt')}
              />
            </Grid>
            {/* Erst mit dem Häkchen — der Mangel gehört sichtbar dorthin, wo er
            gemeldet wird, und nicht in die allgemeinen Hinweise. */}
            {form.defekt && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  required
                  multiline
                  minRows={2}
                  label={t('mangel')}
                  helperText={t('mangelHelp')}
                  error={form.errors.includes('mangelMissing')}
                  value={form.mangel}
                  onChange={(e) => form.setMangel(e.target.value)}
                />
              </Grid>
            )}
          </>
        )}
      </Grid>
    </>
  );
}
