'use client';

import { useMemo, useState } from 'react';
import BuildIcon from '@mui/icons-material/Build';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import {
  ATEMSCHUTZ_GERAET_TYPEN,
  findByCode,
  geraetKennung,
  geraetLabel,
  matchGeraete,
  type AtemschutzAusgabe,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
} from '../../common/atemschutz';
import AusgabeDialog, {
  type AusgabeModus,
  type AusgabePatch,
} from './AusgabeDialog';
import AtemschutzZeile from './AtemschutzZeile';
import AusruestungMangelDialog from './AusruestungMangelDialog';
import BarcodeScannerDialog from './BarcodeScannerDialog';

type TypFilter = AtemschutzGeraetTyp | 'alle';

export interface AusruestungTabProps {
  groupId: string;
  geraete: AtemschutzGeraet[];
  ausgabeByGeraet: Map<string, AtemschutzAusgabe>;
  /** Truppnamen und Feuerwehren dieses Einsatzes. */
  empfaengerVorschlaege: string[];
  /** Offene Mängel je Geräte-ID. */
  openMangelByGeraet: Map<string, number>;
  canWrite: boolean;
  onPatch: (geraet: AtemschutzGeraet, patch: AusgabePatch) => Promise<void>;
  onMangelGemeldet: (geraet: AtemschutzGeraet, mangelId: string) => Promise<void>;
}

export default function AusruestungTab({
  groupId,
  geraete,
  ausgabeByGeraet,
  empfaengerVorschlaege,
  openMangelByGeraet,
  canWrite,
  onPatch,
  onMangelGemeldet,
}: AusruestungTabProps) {
  const t = useTranslations('atemschutz');
  const format = useFormatter();

  const [suche, setSuche] = useState('');
  const [typFilter, setTypFilter] = useState<TypFilter>('alle');
  const [nurAusgegeben, setNurAusgegeben] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ausgabeDialog, setAusgabeDialog] = useState<{
    geraet: AtemschutzGeraet;
    modus: AusgabeModus;
  }>();
  const [mangelGeraet, setMangelGeraet] = useState<AtemschutzGeraet>();

  // Eine Füllstation wird nicht ausgegeben und nicht zurückgenommen — sie steht
  // im Bestand, gehört aber nicht auf diesen Reiter.
  const ausgebbare = useMemo(
    () => geraete.filter((g) => g.typ !== 'fuellstation'),
    [geraete],
  );

  const gefiltert = useMemo(() => {
    // Dieselbe Suche wie im Scanner und in der Verwaltung: über alle
    // Kennungen, die Bezeichnung und die Feuerwehr.
    const treffer = matchGeraete(ausgebbare, suche, ausgebbare.length);
    return treffer.filter((g) => {
      if (typFilter !== 'alle' && g.typ !== typFilter) return false;
      if (!nurAusgegeben) return true;
      return ausgabeByGeraet.get(g.id as string)?.status === 'ausgegeben';
    });
  }, [ausgebbare, suche, typFilter, nurAusgegeben, ausgabeByGeraet]);

  /**
   * Öffnet für ein Stück den passenden Dialog: Was draußen ist, kommt zurück,
   * alles andere geht hinaus.
   */
  const oeffneFuerGeraet = (g: AtemschutzGeraet) => {
    const status = ausgabeByGeraet.get(g.id as string)?.status ?? 'amPlatz';
    setAusgabeDialog({
      geraet: g,
      modus: status === 'ausgegeben' ? 'zuruecknehmen' : 'ausgeben',
    });
  };

  const uhrzeit = (iso?: string) =>
    iso
      ? format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })
      : '';

  return (
    <Box sx={{ pb: 4 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <TextField
          size="small"
          label={t('ausruestung.search')}
          helperText={t('ausruestung.searchHint')}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          // Ein externer Handscanner tippt den Code in dieses Feld und schickt
          // ein Enter hinterher. Bleibt genau ein Stück übrig, geht es direkt
          // weiter — die Liste bis auf eine Zeile zu filtern und dann noch zu
          // klicken ist der Handgriff, den der Scanner ersparen soll.
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !canWrite) return;
            const exakt = findByCode(ausgebbare, suche);
            const ziel = exakt.length === 1 ? exakt[0] : gefiltert[0];
            if (ziel && (exakt.length === 1 || gefiltert.length === 1)) {
              oeffneFuerGeraet(ziel);
            }
          }}
          sx={{ minWidth: 200 }}
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
        <TextField
          select
          size="small"
          label={t('ausruestung.filterTyp')}
          value={typFilter}
          onChange={(e) => setTypFilter(e.target.value as TypFilter)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="alle">{t('ausruestung.filterAll')}</MenuItem>
          {/* Ohne den Filter stünde „Füllstation" zur Wahl und führte
              zuverlässig auf eine leere Liste — die Stationen sind oben schon
              aussortiert. */}
          {ATEMSCHUTZ_GERAET_TYPEN.filter((typ) => typ !== 'fuellstation').map(
            (typ) => (
              <MenuItem key={typ} value={typ}>
                {t(`typ.${typ}`)}
              </MenuItem>
            ),
          )}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={nurAusgegeben}
              onChange={(e) => setNurAusgegeben(e.target.checked)}
            />
          }
          label={t('ausruestung.onlyOut')}
        />
      </Stack>

      {ausgebbare.length === 0 ? (
        <Typography color="text.secondary">{t('ausruestung.empty')}</Typography>
      ) : gefiltert.length === 0 ? (
        <Typography color="text.secondary">{t('ausruestung.noMatch')}</Typography>
      ) : (
        <List dense>
          {gefiltert.map((g) => {
            const ausgabe = ausgabeByGeraet.get(g.id as string);
            const status = ausgabe?.status ?? 'amPlatz';
            const offene = openMangelByGeraet.get(g.id as string) ?? 0;
            return (
              <ListItem
                key={g.id}
                divider
                secondaryAction={
                  canWrite ? (
                    <Stack direction="row" spacing={0.5}>
                      {status !== 'ausgegeben' && (
                        <Button
                          size="small"
                          onClick={() =>
                            setAusgabeDialog({ geraet: g, modus: 'ausgeben' })
                          }
                        >
                          {t('ausruestung.actions.ausgeben')}
                        </Button>
                      )}
                      {status === 'ausgegeben' && (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() =>
                            setAusgabeDialog({ geraet: g, modus: 'zuruecknehmen' })
                          }
                        >
                          {t('ausruestung.actions.zuruecknehmen')}
                        </Button>
                      )}
                      <Tooltip title={t('ausruestung.actions.mangel')}>
                        <span>
                          <IconButton
                            size="small"
                            color="warning"
                            aria-label={t('ausruestung.actions.mangel')}
                            onClick={() => setMangelGeraet(g)}
                          >
                            <BuildIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ) : undefined
                }
              >
                <AtemschutzZeile
                  titel={geraetLabel(g)}
                  chips={
                    <>
                      <Chip
                        size="small"
                        color={status === 'ausgegeben' ? 'warning' : 'default'}
                        label={t(`ausruestung.status.${status}`)}
                      />
                      {offene > 0 && (
                        <Chip
                          size="small"
                          color="error"
                          label={t('ausruestung.mangelOffen', { count: offene })}
                        />
                      )}
                    </>
                  }
                  info={[g.feuerwehr]}
                  details={[
                    ausgabe?.ausgegebenAn,
                    ausgabe?.ausgabeZeit && uhrzeit(ausgabe.ausgabeZeit),
                    ausgabe?.ruecknahmeZeit &&
                      `→ ${uhrzeit(ausgabe.ruecknahmeZeit)}`,
                    ausgabe?.bemerkung,
                  ]}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <Typography variant="caption" color="text.secondary">
        {t('ausruestung.hint')}
      </Typography>

      {scannerOpen && (
        <BarcodeScannerDialog
          open
          geraete={ausgebbare}
          onClose={() => setScannerOpen(false)}
          onPicked={(code, treffer) => {
            // Wer scannt, will das Stück ausgeben oder zurücknehmen — die
            // Liste danach zu filtern wäre ein Zwischenschritt, den niemand
            // mit Handschuhen tippen will. Welcher der beiden Wege es ist,
            // ergibt sich aus dem Zustand: Was draußen ist, kommt zurück.
            if (treffer && canWrite) {
              oeffneFuerGeraet(treffer);
              return;
            }
            // Kein Stammdatensatz oder nur Lesezugriff: Dann bleibt die
            // Liste — und die Filter müssen weg, sonst führt der Scan auf
            // eine Zeile, die gar nicht sichtbar ist.
            setTypFilter('alle');
            setNurAusgegeben(false);
            setSuche(treffer ? (geraetKennung(treffer) ?? treffer.bezeichnung) : code);
          }}
        />
      )}

      {ausgabeDialog && (
        <AusgabeDialog
          key={`${ausgabeDialog.geraet.id}-${ausgabeDialog.modus}`}
          open
          modus={ausgabeDialog.modus}
          groupId={groupId}
          geraet={ausgabeDialog.geraet}
          empfaengerVorschlaege={empfaengerVorschlaege}
          ausgegebenAn={
            ausgabeByGeraet.get(ausgabeDialog.geraet.id as string)?.ausgegebenAn
          }
          onClose={() => setAusgabeDialog(undefined)}
          onConfirm={(patch) => onPatch(ausgabeDialog.geraet, patch)}
        />
      )}

      {mangelGeraet && (
        <AusruestungMangelDialog
          key={mangelGeraet.id}
          open
          groupId={groupId}
          geraet={mangelGeraet}
          onClose={() => setMangelGeraet(undefined)}
          onSaved={(mangelId) => onMangelGemeldet(mangelGeraet, mangelId)}
        />
      )}
    </Box>
  );
}
