import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirecall from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import useVehicles from '../../hooks/useVehicles';
import { FirecallItem, Spectrum } from '../firebase/firestore';
import { getItemInstance } from '../FirecallItems/elements';
import DynamicMap from '../Map/PositionedMap';
import EinsatzTagebuch, { useDiaries } from '../pages/EinsatzTagebuch';
import Geschaeftsbuch, {
  useGeschaeftsbuchEintraege,
} from '../pages/Geschaeftsbuch';
import StrengthTable from './StrengthTable';

export default function PrintPage() {
  const firecall = useFirecall();
  const { vehicles, tacticalUnits, displayItems, firecallItems } =
    useVehicles();
  const layers = useFirecallLayers();
  const { locations } = useFirecallLocations();
  const { diaries } = useDiaries(true);
  const { eintraege } = useGeschaeftsbuchEintraege(true);

  const spectra = useMemo(
    () =>
      firecallItems.filter(
        (item): item is Spectrum => item.type === 'spectrum'
      ),
    [firecallItems]
  );

  const timeline = useMemo(() => {
    const allUnits = [...vehicles, ...tacticalUnits];
    const alarmierungen = allUnits
      .map((u) => u.alarmierung)
      .filter(Boolean) as string[];
    const eintreffen = allUnits
      .map((u) => u.eintreffen)
      .filter(Boolean) as string[];
    const abruecken = allUnits
      .map((u) => u.abruecken)
      .filter(Boolean) as string[];

    const earliest = (arr: string[]) =>
      arr.length > 0
        ? arr.reduce((a, b) => (a < b ? a : b))
        : undefined;
    const latest = (arr: string[]) =>
      arr.length > 0
        ? arr.reduce((a, b) => (a > b ? a : b))
        : undefined;

    return {
      ersteAlarmierung: earliest(alarmierungen),
      erstesEintreffen: earliest(eintreffen),
      letztesAbruecken: latest(abruecken),
    };
  }, [vehicles, tacticalUnits]);

  const groupedByLayer = useMemo(() => {
    const groups: Record<string, FirecallItem[]> = {};
    for (const item of displayItems) {
      const layerId = item.layer;
      const layerName = layerId
        ? layers[layerId]?.name || layerId
        : 'Nicht zugeordnet';
      if (!groups[layerName]) {
        groups[layerName] = [];
      }
      groups[layerName].push(item);
    }
    return groups;
  }, [displayItems, layers]);

  return (
    <>
      {/* 1. Einsatz-Kopfzeile */}
      <Box sx={{ p: 2 }}>
        <Typography variant="h4" className="print-section">
          {firecall.name}
        </Typography>
        {firecall.date && (
          <Typography variant="subtitle1">
            Datum: {formatTimestamp(firecall.date)}
          </Typography>
        )}
        {firecall.fw && (
          <Typography variant="subtitle1">
            Feuerwehr: {firecall.fw}
          </Typography>
        )}
        {firecall.description && (
          <Typography variant="body1">{firecall.description}</Typography>
        )}
      </Box>

      {/* 2. Einsatzkarte */}
      <DynamicMap />

      {/* 3. Einsatzmittel-Zusammenfassung */}
      {displayItems.length > 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h4" className="print-section">
            Einsatzmittel
          </Typography>
          <StrengthTable items={displayItems} />
          {(timeline.ersteAlarmierung ||
            timeline.erstesEintreffen ||
            timeline.letztesAbruecken) && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {timeline.ersteAlarmierung &&
                `Erste Alarmierung: ${formatTimestamp(timeline.ersteAlarmierung)}`}
              {timeline.ersteAlarmierung && timeline.erstesEintreffen && ' | '}
              {timeline.erstesEintreffen &&
                `Erstes Eintreffen: ${formatTimestamp(timeline.erstesEintreffen)}`}
              {(timeline.ersteAlarmierung || timeline.erstesEintreffen) &&
                timeline.letztesAbruecken &&
                ' | '}
              {timeline.letztesAbruecken &&
                `Letztes Abrücken: ${formatTimestamp(timeline.letztesAbruecken)}`}
            </Typography>
          )}
        </Box>
      )}

      {/* 4. Einsatzmittel pro Layer (detailed) */}
      {Object.keys(groupedByLayer).length > 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h4" className="print-section">
            Einsatzmittel Details
          </Typography>
          {Object.entries(groupedByLayer).map(([layerName, items]) => (
            <Box key={layerName} sx={{ mb: 2 }}>
              <Typography variant="h5" className="print-section">
                {layerName} ({items.length})
              </Typography>
              {items.map((item) => {
                const instance = getItemInstance(item);
                return (
                  <Box
                    key={item.id}
                    sx={{
                      mb: 1,
                      pl: 2,
                      borderLeft: '2px solid #ccc',
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {instance.title()}
                    </Typography>
                    {instance.info() && (
                      <Typography variant="subtitle2" color="text.secondary">
                        {instance.info()}
                      </Typography>
                    )}
                    <Box sx={{ ml: 1 }}>{instance.body()}</Box>
                    {item.lat != null && item.lng != null && (
                      <Typography variant="caption" color="text.secondary">
                        Position: {item.lat}, {item.lng}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {/* 5. Einsatzorte */}
      {locations.length > 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h4" className="print-section">
            Einsatzorte
          </Typography>
          <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Name</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Adresse</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Alarmzeit</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Start</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Ende</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Fahrzeuge</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id}>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{loc.name}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {[loc.street, loc.number, loc.city].filter(Boolean).join(' ')}
                  </td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{loc.status}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{loc.alarmTime || ''}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{loc.startTime || ''}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{loc.doneTime || ''}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {Object.values(loc.vehicles || {}).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

      {/* 6. Messungen (Spectrum) */}
      {spectra.length > 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="h4" className="print-section">
            Messungen
          </Typography>
          <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Probe</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Gerät</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Nuklid</th>
                <th style={{ textAlign: 'right', borderBottom: '2px solid #333', padding: '4px 8px' }}>Konfidenz</th>
                <th style={{ textAlign: 'right', borderBottom: '2px solid #333', padding: '4px 8px' }}>Messzeit (s)</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Start</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Ende</th>
              </tr>
            </thead>
            <tbody>
              {spectra.map((s) => (
                <tr key={s.id}>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{s.sampleName}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{s.deviceName}</td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>{s.matchedNuclide || '-'}</td>
                  <td style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {s.matchedConfidence != null
                      ? `${(s.matchedConfidence * 100).toFixed(1)}%`
                      : '-'}
                  </td>
                  <td style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {s.measurementTime}
                  </td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {s.startTime ? formatTimestamp(s.startTime) : ''}
                  </td>
                  <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    {s.endTime ? formatTimestamp(s.endTime) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

      {/* 7. Einsatztagebuch */}
      {diaries.length > 0 && (
        <Box sx={{ p: 2 }}>
          <EinsatzTagebuch showEditButton={false} sortAscending />
        </Box>
      )}

      {/* 8. Geschäftsbuch */}
      {eintraege.length > 0 && (
        <Box sx={{ p: 2 }}>
          <Geschaeftsbuch showEditButton={false} sortAscending />
        </Box>
      )}
    </>
  );
}
