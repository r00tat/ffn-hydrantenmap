import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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
import { generateSchemaFromRecords } from './importUtils';

interface CsvPreviewState {
  rawText: string;
  delimiter: Delimiter;
  headerRow: number;
  preHeaderLines: string[];
  suggestedName: string;
  result: CsvParseResult;
  schema: DataSchemaField[];
  /** Stable mapping: original CSV header → initial schema key (survives user edits) */
  headerToSchemaKey: Map<string, string>;
  fileName: string;
  mapping: ColumnMapping;
  excludedColumns: Set<number>;
}

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

/** Compute set of column indices that are used in mapping (lat/lng/name/timestamp). */
function mappedColumnIndices(mapping: ColumnMapping): Set<number> {
  const s = new Set<number>();
  if (mapping.latColumn >= 0) s.add(mapping.latColumn);
  if (mapping.lngColumn >= 0) s.add(mapping.lngColumn);
  if (mapping.nameColumn >= 0) s.add(mapping.nameColumn);
  if (mapping.timestampColumn >= 0) s.add(mapping.timestampColumn);
  return s;
}

function buildPreview(
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

  // Derive mapping from result (auto-detected or passed through)
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

export default function CsvImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [preview, setPreview] = useState<CsvPreviewState | null>(null);
  const [everyNth, setEveryNth] = useState(1);
  const [useMetadataAsLayerName, setUseMetadataAsLayerName] = useState(false);
  const addFirecallItem = useFirecallItemAdd();

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const rawText = await readFileAsText(file);
    const delimiter = detectDelimiter(rawText);
    const headerRow = detectHeaderRow(rawText, delimiter);
    setEveryNth(1);
    setUseMetadataAsLayerName(false);
    setPreview(buildPreview(rawText, delimiter, file.name, headerRow));
  }, []);

  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      if (!preview) return;
      const headerRow = detectHeaderRow(preview.rawText, newDelimiter);
      setEveryNth(1);
      setPreview(
        buildPreview(preview.rawText, newDelimiter, preview.fileName, headerRow)
      );
    },
    [preview]
  );

  const handleHeaderRowChange = useCallback(
    (newHeaderRow: number) => {
      if (!preview) return;
      setEveryNth(1);
      setUseMetadataAsLayerName(false);
      setPreview(
        buildPreview(
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
      if (!preview) return;
      const newMapping = { ...preview.mapping, [field]: value };
      setEveryNth(1);
      setPreview(
        buildPreview(
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
      if (!preview) return;
      const newExcluded = new Set(preview.excludedColumns);
      if (newExcluded.has(colIndex)) {
        newExcluded.delete(colIndex);
      } else {
        newExcluded.add(colIndex);
      }
      setPreview(
        buildPreview(
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

  const handleSchemaChange = useCallback(
    (schema: DataSchemaField[]) => {
      if (!preview) return;
      setPreview({ ...preview, schema });
    },
    [preview]
  );

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setPreview(null);
    setUploadInProgress(true);

    try {
      const { result, schema, headerToSchemaKey } = preview;
      const sampled = downsample(result.records, everyNth);
      const items = csvRecordsToItems(result, sampled, schema, headerToSchemaKey);

      // Determine layer name
      let layerName: string;
      if (useMetadataAsLayerName && preview.suggestedName) {
        layerName = preview.suggestedName;
      } else {
        layerName =
          preview.fileName.replace(/\.\w+$/, '') ||
          `CSV Import ${new Date().toLocaleDateString('de-AT')}`;
      }

      // Create layer
      const layer = await addFirecallItem({
        name: layerName,
        type: 'layer',
        dataSchema: schema,
        showLabels: 'false',
      } as FirecallItem);

      // Create items in parallel
      await Promise.allSettled(
        items
          .map((i) => ({ ...i, layer: layer.id }))
          .map(addFirecallItem)
      );
    } catch (err) {
      console.error('Failed to import CSV', err);
    }

    setUploadInProgress(false);
  }, [preview, everyNth, useMetadataAsLayerName, addFirecallItem]);

  const validCount = preview
    ? Math.ceil(preview.result.records.length / everyNth)
    : 0;

  // Compute max selectable header row (up to 5 or total lines - 1)
  const maxHeaderRow = preview
    ? Math.min(
        5,
        preview.rawText
          .split('\n')
          .filter((l) => l.trim() !== '').length - 1
      )
    : 0;

  // Extra columns = headers not used in mapping
  const mapped = preview ? mappedColumnIndices(preview.mapping) : new Set<number>();
  const extraColumns = preview
    ? preview.result.headers
        .map((h, i) => ({ header: h, index: i }))
        .filter(({ index }) => !mapped.has(index))
    : [];

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
        sx={{ ml: 1 }}
      >
        CSV importieren
        <VisuallyHiddenInput
          type="file"
          accept=".csv,.tsv,.txt"
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
        <Dialog open onClose={() => setPreview(null)} maxWidth="sm" fullWidth>
          <DialogTitle>CSV Import: {preview.fileName}</DialogTitle>
          <DialogContent>
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}
            >
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

              {/* Header row selector */}
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

              {/* Pre-header metadata */}
              {preview.preHeaderLines.length > 0 && (
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

              {/* Column mapping dropdowns */}
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

              {/* Extra column checkboxes */}
              {extraColumns.length > 0 && (
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

              {preview.result.records.length > 10 && (
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Jede {everyNth}. Zeile importieren ({validCount} Messpunkte)
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
              disabled={
                preview.result.latIndex < 0 ||
                preview.result.lngIndex < 0 ||
                validCount === 0
              }
            >
              {validCount} Messpunkte importieren
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
