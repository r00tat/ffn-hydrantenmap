import { kml as kmlToGeoJSON } from '@mapbox/togeojson';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import DataSchemaEditor from '../FirecallItems/DataSchemaEditor';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';
import readFileAsText from '../upload/readFile';
import {
  ColumnMapping,
  csvRecordsToItems,
  csvToRecords,
  CsvParseResult,
  Delimiter,
  detectDelimiter,
  detectHeaderRow,
  downsample,
  parseCsv,
  parsePreHeaderMetadata,
} from './csvParser';
import { DataSchemaField, FirecallItem } from './firestore';
import {
  GeoJsonFeatureCollection,
  generateSchemaFromFeatures,
  parseGeoJson,
  TYPE_LABELS,
} from './geoJsonImport';
import { generateSchemaFromRecords } from './importUtils';
import { parseGpxFile } from './gpxParser';

// --- Format detection ---

type ImportFormat = 'kml' | 'gpx' | 'csv';

function detectFormat(fileName: string, content: string): ImportFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'kml') return 'kml';
  if (ext === 'gpx') return 'gpx';
  // For .xml or unknown extensions, sniff the content for XML root element
  if (ext === 'xml' || content.trimStart().startsWith('<?xml')) {
    const lower = content.toLowerCase();
    if (lower.includes('<gpx')) return 'gpx';
    if (lower.includes('<kml')) return 'kml';
  }
  return 'csv';
}

// --- Preview state types ---

interface GeoJsonPreviewState {
  format: 'kml' | 'gpx';
  geoJson: GeoJsonFeatureCollection;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

interface CsvPreviewState {
  format: 'csv';
  rawText: string;
  delimiter: Delimiter;
  headerRow: number;
  preHeaderLines: string[];
  suggestedName: string;
  result: CsvParseResult;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  fileName: string;
  mapping: ColumnMapping;
  excludedColumns: Set<number>;
}

type PreviewState = GeoJsonPreviewState | CsvPreviewState;

// --- KML parsing ---

function parseKmlFile(kmlText: string, fileName: string): GeoJsonPreviewState {
  const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
  const geoJson: GeoJsonFeatureCollection = kmlToGeoJSON(dom);
  // Extract KML-specific style colors
  geoJson.features.map((f) => {
    if (f.geometry.type === 'Point' && f.properties.styleUrl) {
      const styleElement = dom.querySelector(f.properties.styleUrl);
      f.properties.fill =
        styleElement?.querySelector('color')?.textContent ?? '#0000ff';
    }
    return f;
  });
  const { schema, headerToSchemaKey } = generateSchemaFromFeatures(
    geoJson.features
  );
  const layerName = fileName.replace(/\.kml$/i, '');
  return { format: 'kml', geoJson, schema, headerToSchemaKey, layerName };
}

// --- CSV helpers (from old CsvImport) ---

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ';': 'Semikolon (;)',
  ',': 'Komma (,)',
  '\t': 'Tab',
};

const NOT_ASSIGNED = -1;
const NOT_ASSIGNED_LABEL = '— nicht zugewiesen —';

function buildExcludeKeys(result: CsvParseResult): Set<string> {
  const excludeKeys = new Set<string>();
  if (result.latIndex >= 0) excludeKeys.add(result.headers[result.latIndex]);
  if (result.lngIndex >= 0) excludeKeys.add(result.headers[result.lngIndex]);
  if (result.nameIndex >= 0) excludeKeys.add(result.headers[result.nameIndex]);
  if (result.timestampIndex >= 0)
    excludeKeys.add(result.headers[result.timestampIndex]);
  return excludeKeys;
}

function mappedColumnIndices(mapping: ColumnMapping): Set<number> {
  const s = new Set<number>();
  if (mapping.latColumn >= 0) s.add(mapping.latColumn);
  if (mapping.lngColumn >= 0) s.add(mapping.lngColumn);
  if (mapping.nameColumn >= 0) s.add(mapping.nameColumn);
  if (mapping.timestampColumn >= 0) s.add(mapping.timestampColumn);
  return s;
}

function buildCsvPreview(
  rawText: string,
  delimiter: Delimiter,
  fileName: string,
  headerRow: number,
  mapping?: ColumnMapping,
  excludedColumns?: Set<number>
): CsvPreviewState {
  const { headers, rows, preHeaderLines } = parseCsv(
    rawText,
    delimiter,
    headerRow
  );
  const result = csvToRecords(headers, rows, mapping, excludedColumns);

  const resolvedMapping: ColumnMapping = {
    latColumn: result.latIndex,
    lngColumn: result.lngIndex,
    nameColumn: result.nameIndex,
    timestampColumn: result.timestampIndex,
  };

  const excludeKeys = buildExcludeKeys(result);
  const { schema, headerToSchemaKey } = generateSchemaFromRecords(
    result.records,
    excludeKeys,
    result.headers
  );

  const { suggestedName } = parsePreHeaderMetadata(preHeaderLines, delimiter);

  return {
    format: 'csv',
    rawText,
    delimiter,
    headerRow,
    preHeaderLines,
    suggestedName,
    result,
    schema,
    headerToSchemaKey,
    fileName,
    mapping: resolvedMapping,
    excludedColumns: excludedColumns ?? new Set(),
  };
}

// --- Component ---

export default function LayerImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [everyNth, setEveryNth] = useState(1);
  const [useMetadataAsLayerName, setUseMetadataAsLayerName] = useState(false);
  const addFirecallItem = useFirecallItemAdd();

  // --- File select ---
  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setParsing(true);
    try {
      const text = await readFileAsText(file);
      const format = detectFormat(file.name, text);

      if (format === 'kml') {
        setPreview(parseKmlFile(text, file.name));
      } else if (format === 'gpx') {
        const gpx = parseGpxFile(text, file.name);
        setPreview({ format: 'gpx', ...gpx });
      } else {
        const delimiter = detectDelimiter(text);
        const headerRow = detectHeaderRow(text, delimiter);
        setEveryNth(1);
        setUseMetadataAsLayerName(false);
        setPreview(buildCsvPreview(text, delimiter, file.name, headerRow));
      }
    } finally {
      setParsing(false);
    }
  }, []);

  // --- CSV-specific handlers ---
  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      if (!preview || preview.format !== 'csv') return;
      const headerRow = detectHeaderRow(preview.rawText, newDelimiter);
      setEveryNth(1);
      setPreview(
        buildCsvPreview(preview.rawText, newDelimiter, preview.fileName, headerRow)
      );
    },
    [preview]
  );

  const handleHeaderRowChange = useCallback(
    (newHeaderRow: number) => {
      if (!preview || preview.format !== 'csv') return;
      setEveryNth(1);
      setUseMetadataAsLayerName(false);
      setPreview(
        buildCsvPreview(
          preview.rawText,
          preview.delimiter,
          preview.fileName,
          newHeaderRow
        )
      );
    },
    [preview]
  );

  const handleMappingChange = useCallback(
    (field: keyof ColumnMapping, value: number) => {
      if (!preview || preview.format !== 'csv') return;
      const newMapping = { ...preview.mapping, [field]: value };
      setEveryNth(1);
      setPreview(
        buildCsvPreview(
          preview.rawText,
          preview.delimiter,
          preview.fileName,
          preview.headerRow,
          newMapping,
          preview.excludedColumns
        )
      );
    },
    [preview]
  );

  const handleExcludedColumnToggle = useCallback(
    (colIndex: number) => {
      if (!preview || preview.format !== 'csv') return;
      const newExcluded = new Set(preview.excludedColumns);
      if (newExcluded.has(colIndex)) {
        newExcluded.delete(colIndex);
      } else {
        newExcluded.add(colIndex);
      }
      setPreview(
        buildCsvPreview(
          preview.rawText,
          preview.delimiter,
          preview.fileName,
          preview.headerRow,
          preview.mapping,
          newExcluded
        )
      );
    },
    [preview]
  );

  // --- Shared schema handler ---
  const handleSchemaChange = useCallback(
    (newSchema: DataSchemaField[]) => {
      if (!preview) return;
      if (preview.format === 'csv') {
        setPreview({ ...preview, schema: newSchema });
      } else {
        // GeoJSON formats: update headerToSchemaKey when schema changes
        const oldSchema = preview.schema;
        const newHeaderToSchemaKey = new Map<string, string>();

        for (const [origKey, oldSchemaKey] of preview.headerToSchemaKey.entries()) {
          const oldIdx = oldSchema.findIndex((f) => f.key === oldSchemaKey);
          if (oldIdx < 0) continue;

          if (oldSchema.length === newSchema.length) {
            newHeaderToSchemaKey.set(origKey, newSchema[oldIdx].key);
          } else if (newSchema.some((f) => f.key === oldSchemaKey)) {
            newHeaderToSchemaKey.set(origKey, oldSchemaKey);
          }
        }

        setPreview({
          ...preview,
          schema: newSchema,
          headerToSchemaKey: newHeaderToSchemaKey,
        });
      }
    },
    [preview]
  );

  // --- Layer name ---
  const layerName =
    preview?.format === 'csv'
      ? useMetadataAsLayerName && preview.suggestedName
        ? preview.suggestedName
        : preview.fileName.replace(/\.\w+$/, '') ||
          `CSV Import ${new Date().toLocaleDateString('de-AT')}`
      : preview
        ? preview.layerName
        : '';

  const handleLayerNameChange = useCallback(
    (name: string) => {
      if (!preview) return;
      if (preview.format === 'csv') {
        setPreview({ ...preview, fileName: name + '.csv' });
        setUseMetadataAsLayerName(false);
      } else {
        setPreview({ ...preview, layerName: name });
      }
    },
    [preview]
  );

  // --- Import ---
  const handleImport = useCallback(async () => {
    if (!preview) return;
    setPreview(null);
    setUploadInProgress(true);

    try {
      if (preview.format === 'csv') {
        const { result, schema, headerToSchemaKey } = preview;
        const sampled = downsample(result.records, everyNth);
        const items = csvRecordsToItems(result, sampled, schema, headerToSchemaKey);

        const layer = await addFirecallItem({
          name: layerName,
          type: 'layer',
          dataSchema: schema,
          showLabels: 'false',
        } as FirecallItem);

        await Promise.allSettled(
          items
            .map((i) => ({ ...i, layer: layer.id }))
            .map(addFirecallItem)
        );
      } else {
        const { geoJson, schema, headerToSchemaKey } = preview;
        const fcItems = parseGeoJson(geoJson, schema, headerToSchemaKey);
        const formatLabel = preview.format === 'kml' ? 'KML' : 'GPX';

        const layer = await addFirecallItem({
          name:
            layerName || `${formatLabel} Import ${formatTimestamp(new Date())}`,
          type: 'layer',
          dataSchema: schema,
        } as FirecallItem);

        await Promise.allSettled(
          fcItems.map((i) => ({ ...i, layer: layer.id })).map(addFirecallItem)
        );
      }
    } catch (err) {
      console.error('Failed to import', err);
    }

    setUploadInProgress(false);
  }, [preview, everyNth, layerName, addFirecallItem]);

  // --- Computed values ---
  const typeCounts =
    preview && preview.format !== 'csv'
      ? preview.geoJson.features.reduce(
          (acc, f) => {
            const t = f.geometry.type;
            acc[t] = (acc[t] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      : {};

  const geoJsonTotalCount = Object.values(typeCounts).reduce(
    (a, b) => a + b,
    0
  );

  const csvValidCount =
    preview?.format === 'csv'
      ? Math.ceil(preview.result.records.length / everyNth)
      : 0;

  const totalCount =
    preview?.format === 'csv' ? csvValidCount : geoJsonTotalCount;

  const maxHeaderRow =
    preview?.format === 'csv'
      ? Math.min(
          5,
          preview.rawText
            .split('\n')
            .filter((l) => l.trim() !== '').length - 1
        )
      : 0;

  const mapped =
    preview?.format === 'csv'
      ? mappedColumnIndices(preview.mapping)
      : new Set<number>();

  const extraColumns =
    preview?.format === 'csv'
      ? preview.result.headers
          .map((h, i) => ({ header: h, index: i }))
          .filter(({ index }) => !mapped.has(index))
      : [];

  const importDisabled =
    preview?.format === 'csv'
      ? preview.result.latIndex < 0 ||
        preview.result.lngIndex < 0 ||
        csvValidCount === 0
      : totalCount === 0;

  const formatLabel =
    preview?.format === 'kml'
      ? 'KML'
      : preview?.format === 'gpx'
        ? 'GPX'
        : 'CSV';

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={parsing ? undefined : <CloudUploadIcon />}
        endIcon={
          parsing ? <CircularProgress size={16} color="inherit" /> : undefined
        }
        disabled={parsing}
        sx={{ ml: 1 }}
      >
        Importieren
        <VisuallyHiddenInput
          type="file"
          accept=".kml,.gpx,.xml,.csv,.tsv,.txt,text/xml,application/vnd.google-earth.kml+xml"
          onChange={(event) => {
            (async () => {
              if (event.target.files) {
                await handleFileSelect(event.target.files);
                event.target.value = '';
              }
            })();
          }}
        />
      </Button>
      {uploadInProgress && (
        <>
          <Typography component="span" sx={{ ml: 1 }}>
            Importiere...
          </Typography>
          <CircularProgress size={20} sx={{ ml: 1 }} />
        </>
      )}
      {preview && (
        <Dialog
          open
          onClose={() => setPreview(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {formatLabel} Import
            {preview.format === 'csv' && `: ${preview.fileName}`}
          </DialogTitle>
          <DialogContent>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}
            >
              {/* Layer name */}
              <TextField
                label="Ebenenname"
                size="small"
                fullWidth
                value={layerName}
                onChange={(e) => handleLayerNameChange(e.target.value)}
              />

              {/* CSV-specific: Delimiter */}
              {preview.format === 'csv' && (
                <TextField
                  label="Trennzeichen"
                  size="small"
                  select
                  value={preview.delimiter}
                  onChange={(e) =>
                    handleDelimiterChange(e.target.value as Delimiter)
                  }
                  fullWidth
                >
                  {Object.entries(DELIMITER_LABELS).map(([val, label]) => (
                    <MenuItem key={val} value={val}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {/* CSV-specific: Header row */}
              {preview.format === 'csv' && (
                <TextField
                  label="Header-Zeile"
                  size="small"
                  select
                  value={preview.headerRow}
                  onChange={(e) =>
                    handleHeaderRowChange(Number(e.target.value))
                  }
                  fullWidth
                >
                  {Array.from({ length: maxHeaderRow + 1 }, (_, i) => (
                    <MenuItem key={i} value={i}>
                      Zeile {i + 1}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {/* CSV-specific: Pre-header metadata */}
              {preview.format === 'csv' && preview.preHeaderLines.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Metadaten:{' '}
                    {preview.preHeaderLines.map((l, i) => (
                      <span key={i}>
                        {i > 0 && ' | '}
                        {l}
                      </span>
                    ))}
                  </Typography>
                  {preview.suggestedName && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={useMetadataAsLayerName}
                          onChange={(e) =>
                            setUseMetadataAsLayerName(e.target.checked)
                          }
                        />
                      }
                      label={`Als Layer-Name verwenden: "${preview.suggestedName}"`}
                    />
                  )}
                </Box>
              )}

              {/* CSV-specific: Row stats */}
              {preview.format === 'csv' && (
                <>
                  <Typography variant="body2">
                    Spalten: {preview.result.headers.length} | Zeilen gesamt:{' '}
                    {preview.result.totalRows}
                    {preview.result.skippedRows > 0 &&
                      ` | Übersprungen: ${preview.result.skippedRows} (fehlende Koordinaten)`}
                    {' '}| Gültig: {preview.result.records.length}
                  </Typography>

                  {preview.result.latIndex < 0 && (
                    <Typography variant="body2" color="error">
                      Keine Latitude-Spalte erkannt
                    </Typography>
                  )}
                  {preview.result.lngIndex < 0 && (
                    <Typography variant="body2" color="error">
                      Keine Longitude-Spalte erkannt
                    </Typography>
                  )}
                </>
              )}

              {/* CSV-specific: Column mapping */}
              {preview.format === 'csv' && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Spalten-Mapping
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 1,
                    }}
                  >
                    {(
                      [
                        ['latColumn', 'Latitude'],
                        ['lngColumn', 'Longitude'],
                        ['nameColumn', 'Name'],
                        ['timestampColumn', 'Zeitstempel'],
                      ] as [keyof ColumnMapping, string][]
                    ).map(([field, label]) => (
                      <TextField
                        key={field}
                        label={label}
                        size="small"
                        select
                        value={preview.mapping[field]}
                        onChange={(e) =>
                          handleMappingChange(field, Number(e.target.value))
                        }
                        fullWidth
                      >
                        <MenuItem value={NOT_ASSIGNED}>
                          {NOT_ASSIGNED_LABEL}
                        </MenuItem>
                        {preview.result.headers.map((h, i) => (
                          <MenuItem key={i} value={i}>
                            {h}
                          </MenuItem>
                        ))}
                      </TextField>
                    ))}
                  </Box>
                </Box>
              )}

              {/* CSV-specific: Extra column checkboxes */}
              {preview.format === 'csv' && extraColumns.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Zusätzliche Spalten importieren
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {extraColumns.map(({ header, index }) => (
                      <FormControlLabel
                        key={index}
                        control={
                          <Checkbox
                            size="small"
                            checked={!preview.excludedColumns.has(index)}
                            onChange={() => handleExcludedColumnToggle(index)}
                          />
                        }
                        label={header}
                        sx={{ mr: 2 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* GeoJSON formats: Type count chips */}
              {preview.format !== 'csv' && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${count} ${TYPE_LABELS[type] ?? type}`}
                      size="small"
                    />
                  ))}
                </Box>
              )}

              {/* CSV-specific: Downsampling slider */}
              {preview.format === 'csv' &&
                preview.result.records.length > 10 && (
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Jede {everyNth}. Zeile importieren ({csvValidCount}{' '}
                      Messpunkte)
                    </Typography>
                    <Slider
                      value={everyNth}
                      onChange={(_, val) => setEveryNth(val as number)}
                      min={1}
                      max={Math.min(
                        Math.ceil(preview.result.records.length / 2),
                        100
                      )}
                      step={1}
                      size="small"
                      valueLabelDisplay="auto"
                    />
                  </Box>
                )}

              {/* Shared: Schema editor */}
              <DataSchemaEditor
                dataSchema={preview.schema}
                onChange={handleSchemaChange}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreview(null)}>Abbrechen</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importDisabled}
            >
              {totalCount}{' '}
              {preview.format === 'csv' ? 'Messpunkte' : 'Objekte'} importieren
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
