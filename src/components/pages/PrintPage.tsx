import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Fragment, useMemo } from 'react';
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
import SpectrumChart from './SpectrumChart';
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
          <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Typ</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Bezeichnung</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Details</th>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #333', padding: '4px 8px' }}>Position</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedByLayer).map(([layerName, items]) => (
                <Fragment key={layerName}>
                  <tr>
                    <th
                      colSpan={4}
                      style={{
                        textAlign: 'left',
                        borderBottom: '2px solid #333',
                        padding: '8px 8px 4px',
                        fontWeight: 'bold',
                        fontSize: '1.1em',
                      }}
                    >
                      {layerName} ({items.length})
                    </th>
                  </tr>
                  {items.map((item) => {
                    const instance = getItemInstance(item);
                    return (
                      <tr key={item.id}>
                        <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px', verticalAlign: 'top' }}>
                          {instance.markerName()}
                        </td>
                        <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px', verticalAlign: 'top' }}>
                          {instance.title()}
                        </td>
                        <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px', verticalAlign: 'top' }}>
                          {instance.info() && <>{instance.info()}<br /></>}
                          {instance.body()}
                        </td>
                        <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px', verticalAlign: 'top' }}>
                          {item.lat != null && item.lng != null
                            ? `${item.lat}, ${item.lng}`
                            : ''}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
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
          <SpectrumChart spectra={spectra} height={300} />
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
