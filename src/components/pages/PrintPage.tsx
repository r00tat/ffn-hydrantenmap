import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PrintIcon from '@mui/icons-material/Print';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirecall from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import useVehicles from '../../hooks/useVehicles';
import { FirecallItem, Spectrum } from '../firebase/firestore';
import { getItemInstance } from '../FirecallItems/elements';
import DynamicMap from '../Map/PositionedMap';
import { useDiaries } from '../pages/EinsatzTagebuch';
import { useGeschaeftsbuchEintraege } from '../pages/Geschaeftsbuch';
import EinsatzTagebuchPrint from '../pages/EinsatzTagebuchPrint';
import GeschaeftsbuchPrint from '../pages/GeschaeftsbuchPrint';
import dynamic from 'next/dynamic';

const SpectrumChart = dynamic(() => import('./SpectrumChart'), {
  ssr: false,
  loading: () => null,
});
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

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const html2canvas = (await import('html2canvas')).default;
      const filename = `Einsatz_${firecall.name || 'Bericht'}.pdf`
        .replace(/[^a-zA-Z0-9äöüÄÖÜß._-]/g, '_');

      // Capture the Leaflet map as a static image before PDF generation
      // html2canvas cannot render CSS 3D transforms used by Leaflet tiles
      const mapContainer = document.querySelector('.leaflet-container') as HTMLElement | null;
      let mapImage: HTMLImageElement | null = null;
      if (mapContainer) {
        const canvas = await html2canvas(mapContainer, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
        });
        mapImage = document.createElement('img');
        mapImage.src = canvas.toDataURL('image/jpeg', 0.95);
        mapImage.style.width = '100%';
        mapImage.style.height = mapContainer.offsetHeight + 'px';
        mapContainer.style.display = 'none';
        mapContainer.parentElement?.insertBefore(mapImage, mapContainer);
      }

      const element = document.body;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save();

      // Restore the live map
      if (mapContainer && mapImage) {
        mapImage.remove();
        mapContainer.style.display = '';
      }
    } finally {
      setPdfLoading(false);
    }
  }, [firecall.name]);

  const [hiddenSpectra, setHiddenSpectra] = useState<Set<string>>(new Set());

  const toggleSpectrum = useCallback((id: string) => {
    setHiddenSpectra((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const visibleSpectra = useMemo(
    () => spectra.filter((s) => !hiddenSpectra.has(s.id || '')),
    [spectra, hiddenSpectra]
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
    const groups: Record<string, { name: string; layerId?: string; items: FirecallItem[] }> = {};
    for (const item of displayItems) {
      const layerId = item.layer;
      const key = layerId || '_default';
      if (!groups[key]) {
        groups[key] = {
          name: layerId ? layers[layerId]?.name || layerId : 'Nicht zugeordnet',
          layerId: layerId || undefined,
          items: [],
        };
      }
      groups[key].items.push(item);
    }
    return groups;
  }, [displayItems, layers]);

  return (
    <>
      {/* Aktionsleiste */}
      <Box sx={{ p: 2, display: 'flex', gap: 2 }} className="no-print">
        <Button
          variant="contained"
          startIcon={pdfLoading ? <CircularProgress size={20} color="inherit" /> : <PictureAsPdfIcon />}
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
        >
          {pdfLoading ? 'PDF wird erstellt...' : 'PDF herunterladen'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
        >
          Drucken
        </Button>
      </Box>

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
              {Object.entries(groupedByLayer).map(([key, group]) => {
                const dataSchema = group.layerId
                  ? layers[group.layerId]?.dataSchema
                  : undefined;
                return (
                  <Fragment key={key}>
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
                        {group.name} ({group.items.length})
                      </th>
                    </tr>
                    {group.items.map((item) => {
                      const instance = getItemInstance(item);
                      if (dataSchema) {
                        instance._renderDataSchema = dataSchema;
                      }
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
                );
              })}
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
                <th className="no-print" style={{ borderBottom: '2px solid #333', padding: '4px 8px' }} />
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
                  <td className="no-print" style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                    <Checkbox
                      size="small"
                      checked={!hiddenSpectra.has(s.id || '')}
                      onChange={() => toggleSpectrum(s.id || '')}
                    />
                  </td>
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
          <SpectrumChart spectra={visibleSpectra} height={300} />
        </Box>
      )}

      {/* 7. Einsatztagebuch */}
      {diaries.length > 0 && <EinsatzTagebuchPrint />}

      {/* 8. Geschäftsbuch */}
      {eintraege.length > 0 && <GeschaeftsbuchPrint />}
    </>
  );
}
