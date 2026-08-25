'use client';

import AddIcon from '@mui/icons-material/Add';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { terrainClient } from '../../common/terrain/terrainClient';
import { wasserstandStale } from '../../common/terrain/wasserstand';
import { defaultPosition } from '../../hooks/constants';
import { useFirecall } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useWasserstandSzenarien from '../../hooks/useWasserstandSzenarien';
import WasserstandMap from '../Map/Wasserstand/WasserstandMap';
import WasserstandRechner from '../Map/Wasserstand/WasserstandRechner';
import { usePositionContext } from '../providers/PositionProvider';

/**
 * „Hochwasser" aus der Seitenleiste: Karte links, Szenarien und Rechner rechts.
 *
 * Eine eigene Seite und nicht bloß ein Verweis auf die Karte, aus demselben
 * Grund wie beim Dammbau: Die Frage „was steht bei +1 m unter Wasser?" kommt
 * **vor** dem Zeichnen. Man will einen Punkt setzen, um zu rechnen, nicht ein
 * Element anlegen, um es später zu rechnen.
 *
 * **Nur mit laufendem Einsatz.** Szenarien leben im Einsatz; ohne einen gibt es
 * nichts zu listen und nichts zu speichern.
 */
export default function Hochwasser() {
  const firecall = useFirecall();

  if (!firecall?.id || firecall.id === 'unknown') {
    return <KeinEinsatz />;
  }
  return <HochwasserInhalt />;
}

function KeinEinsatz() {
  const t = useTranslations('wasserstand');
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('pageTitle')}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('noFirecall')}
      </Alert>
      <Button component={Link} href="/einsaetze" variant="contained">
        {t('toFirecalls')}
      </Button>
    </Box>
  );
}

function HochwasserInhalt() {
  const t = useTranslations('wasserstand');
  const szenarien = useWasserstandSzenarien();
  const addItem = useFirecallItemAdd();
  const [position] = usePositionContext();
  const [selectedId, setSelectedId] = useState<string>();

  const selected = useMemo(
    () => szenarien.find((item) => item.id === selectedId) ?? szenarien[0],
    [szenarien, selectedId]
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: { md: 'calc(100vh - 64px)' },
        gap: 1,
        p: 1,
      }}
    >
      <Box sx={{ flex: { md: '1 1 55%' }, minHeight: 320 }}>
        <WasserstandMap
          szenarien={szenarien}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
      </Box>

      <Paper
        sx={{
          flex: { md: '1 1 45%' },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="h6">{t('pageTitle')}</Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            sx={{ mt: 1 }}
            onClick={async () => {
              const centre = position ?? defaultPosition;
              let basis:
                | { wasserBasisHoehe: number; wasserBasisStufe: string }
                | undefined;
              try {
                const [sample] = await terrainClient().sample([
                  [centre.lat, centre.lng],
                ]);
                if (sample) {
                  basis = {
                    wasserBasisHoehe: sample.heightM,
                    wasserBasisStufe: sample.level,
                  };
                }
              } catch (err) {
                // Ohne Höhenmodell wird das Element trotzdem angelegt: der
                // Rechner bietet „Basishöhe neu bestimmen" an, sobald es da
                // ist. Es gar nicht anzulegen wäre der schlechtere Tausch.
                console.warn('Basishöhe beim Anlegen nicht verfügbar', err);
              }
              const created = await addItem({
                type: 'wasserstand',
                name: t('layerName'),
                lat: centre.lat,
                lng: centre.lng,
                datum: new Date().toISOString(),
                ...(basis ?? {}),
              });
              if (created?.id) setSelectedId(created.id);
            }}
          >
            {t('drawSeed')}
          </Button>
        </Box>

        {szenarien.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            {t('listEmpty')}
          </Alert>
        ) : (
          <List dense sx={{ flexShrink: 0, maxHeight: 200, overflowY: 'auto' }}>
            {szenarien.map((item) => (
              <ListItemButton
                key={item.id}
                selected={item.id === selected?.id}
                onClick={() => setSelectedId(item.id)}
              >
                <ListItemIcon>
                  <WaterDropIcon />
                </ListItemIcon>
                <ListItemText
                  primary={item.name || t('layerName')}
                  secondary={
                    <>
                      {t('resultArea', {
                        value: ((item.wasserFlaecheM2 ?? 0) / 10000).toFixed(1),
                      })}
                      {' · '}
                      {t('resultGrid', {
                        value: item.wasserStufe === 'detail' ? 1 : 10,
                      })}
                    </>
                  }
                />
                {wasserstandStale(item) && (
                  <Chip size="small" color="warning" label={t('staleShort')} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}

        {selected && (
          <Box sx={{ minHeight: 0, flexGrow: 1, display: 'flex' }}>
            <WasserstandRechner item={selected} />
          </Box>
        )}
      </Paper>
    </Box>
  );
}
