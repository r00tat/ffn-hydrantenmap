'use client';

import { useMemo, useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  ATEMSCHUTZ_GERAET_TYPEN,
  sanitizePersonen,
  truppGeraetLabel,
  truppGeraetVonGeraet,
  truppLabel,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
  type AtemschutzTrupp,
  type TruppGeraet,
} from '../../common/atemschutz';
import BarcodeScannerDialog from './BarcodeScannerDialog';
import GeraetAutocomplete from './GeraetAutocomplete';

export interface TruppGeraeteDialogProps {
  open: boolean;
  trupp: AtemschutzTrupp;
  /** Der Bestand der Gruppe, in dem gesucht und gescannt wird. */
  geraete: AtemschutzGeraet[];
  onClose: () => void;
  onSave: (geraete: TruppGeraet[]) => Promise<void>;
}

/** Der Typ, den ein Gerät ohne Stammdatensatz bekommt. */
const DEFAULT_TYP: AtemschutzGeraetTyp = 'flasche';

/**
 * Geräte am Trupp: erfassen, per Scan oder Eingabe, und später den Personen
 * zuordnen.
 *
 * Die Zuordnung Gerät → Person ist **nicht** Pflicht. Beim Abmarsch steht
 * selten fest, wer welche Flasche aufnimmt; wer das erzwingt, hält den Trupp
 * auf oder bekommt einen erfundenen Namen. Nachgetragen wird bei der Rückkehr —
 * dann schließt sich der Kreis zum Füllprotokoll: Welche Flasche war im Einsatz
 * und muss gefüllt werden.
 */
export default function TruppGeraeteDialog({
  open,
  trupp,
  geraete,
  onClose,
  onSave,
}: TruppGeraeteDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  /**
   * Die möglichen Träger: die Mitglieder **dieses** Trupps.
   *
   * Vorher stand hier ein Freitextfeld mit Vorschlägen aus dem ganzen Einsatz.
   * Das ist die falsche Menge: Ein Gerät trägt jemand aus diesem Trupp, alles
   * andere ist keine Hilfe, sondern eine Fehlerquelle — auf dem Telefon liegt
   * der falsche Name einen Fingerbreit neben dem richtigen, und eine falsche
   * Zuordnung Flasche → Person fällt erst im Füllprotokoll auf.
   */
  const mitglieder = useMemo(
    () => sanitizePersonen(trupp.mitglieder),
    [trupp.mitglieder],
  );

  /**
   * Ein schon erfasster Name bleibt wählbar, auch wenn er nicht (mehr) im Trupp
   * steht: Sonst verschwände die Zuordnung stillschweigend aus dem Feld, sobald
   * jemand die Mitgliederliste ändert — und beim nächsten Speichern wäre sie
   * weg.
   */
  const traegerOptionen = (person?: string) => {
    const name = person?.trim();
    return name && !mitglieder.includes(name)
      ? [...mitglieder, name]
      : mitglieder;
  };

  const [liste, setListe] = useState<TruppGeraet[]>(
    () => trupp.truppGeraete ?? [],
  );
  const [suche, setSuche] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const uebernehmen = (neu: TruppGeraet) => {
    setListe((prev) =>
      // Dieselbe Flasche zweimal ist ein Doppelscan, kein zweites Stück. Ein
      // Gerät ohne Stammdatensatz lässt sich dagegen nicht vergleichen — dort
      // dient die Kennung als Schlüssel.
      prev.some((g) =>
        neu.geraetId
          ? g.geraetId === neu.geraetId
          : !!neu.kennung && g.kennung === neu.kennung,
      )
        ? prev
        : [...prev, neu],
    );
    setSuche('');
  };

  const rohUebernehmen = (code: string) => {
    const kennung = code.trim();
    if (!kennung) return;
    uebernehmen({
      typ: DEFAULT_TYP,
      bezeichnung: t('ueberwachung.geraetOhneStammdaten'),
      kennung,
    });
  };

  const aendern = (index: number, patch: Partial<TruppGeraet>) => {
    setListe((prev) =>
      prev.map((g, i) => (i === index ? { ...g, ...patch } : g)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(liste);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('ueberwachung.geraeteTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {truppLabel(trupp)}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <GeraetAutocomplete
              label={t('ueberwachung.geraetSuche')}
              helperText={t('ueberwachung.geraetSucheHint')}
              value={suche}
              geraete={geraete}
              onTextChange={setSuche}
              onGeraetChange={(g) => uebernehmen(truppGeraetVonGeraet(g))}
              // Ein externer Handscanner tippt den Code und schickt ein Enter
              // hinterher. Bleibt genau ein Vorschlag übrig, ist er gemeint;
              // sonst wird der rohe Code als Kennung übernommen — eine
              // Fremdflasche hat hier keinen Stammdatensatz.
              onSubmit={(value, vorschlaege) => {
                if (vorschlaege.length === 1) {
                  uebernehmen(truppGeraetVonGeraet(vorschlaege[0]));
                  return;
                }
                rohUebernehmen(value);
              }}
            />
            <Tooltip title={t('ausruestung.scan')}>
              <span>
                <IconButton
                  aria-label={t('ausruestung.scan')}
                  onClick={() => setScannerOpen(true)}
                >
                  <QrCodeScannerIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {liste.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('ueberwachung.geraeteLeer')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {liste.map((g, index) => (
                <ListItem
                  key={g.geraetId ?? `${g.kennung ?? g.bezeichnung}-${index}`}
                  disableGutters
                  sx={{ alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}
                  secondaryAction={
                    <IconButton
                      size="small"
                      color="warning"
                      aria-label={tCommon('delete')}
                      onClick={() =>
                        setListe((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <Stack spacing={1} sx={{ flexGrow: 1, pr: 5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {truppGeraetLabel(g)}
                    </Typography>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ alignItems: 'stretch' }}
                    >
                      <TextField
                        select
                        size="small"
                        label={t('ueberwachung.geraetTyp')}
                        value={g.typ}
                        onChange={(e) =>
                          aendern(index, {
                            typ: e.target.value as AtemschutzGeraetTyp,
                          })
                        }
                        sx={{ minWidth: 160 }}
                      >
                        {ATEMSCHUTZ_GERAET_TYPEN.filter(
                          (typ) => typ !== 'fuellstation',
                        ).map((typ) => (
                          <MenuItem key={typ} value={typ}>
                            {t(`typ.${typ}` as 'typ.flasche')}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        size="small"
                        label={t('ueberwachung.geraetPerson')}
                        value={g.person ?? ''}
                        onChange={(e) =>
                          aendern(index, {
                            person: e.target.value || undefined,
                          })
                        }
                        sx={{ minWidth: 180 }}
                      >
                        {/* Leer wählbar, weil die Zuordnung freiwillig ist —
                            ohne diesen Eintrag ließe sich ein versehentlich
                            gesetzter Träger nicht mehr zurücknehmen. */}
                        <MenuItem value="">
                          {t('ueberwachung.geraetPersonKeine')}
                        </MenuItem>
                        {traegerOptionen(g.person).map((name) => (
                          <MenuItem key={name} value={name}>
                            {name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}

          <Typography variant="caption" color="text.secondary">
            {t('ueberwachung.geraetePersonHint')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {tCommon('save')}
        </Button>
      </DialogActions>

      {scannerOpen && (
        <BarcodeScannerDialog
          open
          geraete={geraete}
          onClose={() => setScannerOpen(false)}
          onPicked={(code, treffer) => {
            if (treffer) {
              uebernehmen(truppGeraetVonGeraet(treffer));
            } else {
              rohUebernehmen(code);
            }
            setScannerOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}
