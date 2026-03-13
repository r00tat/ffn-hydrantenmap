import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
  csvRecordsToItems,
  csvToRecords,
  CsvParseResult,
  Delimiter,
  detectDelimiter,
  downsample,
  parseCsv,
} from './csvParser';
import { DataSchemaField, FirecallItem } from './firestore';
import { generateSchemaFromRecords } from './importUtils';

interface CsvPreviewState {
  rawText: string;
  delimiter: Delimiter;
  result: CsvParseResult;
  schema: DataSchemaField[];
  /** Stable mapping: original CSV header → initial schema key (survives user edits) */
  headerToSchemaKey: Map<string, string>;
  fileName: string;
}

const DELIMITER_LABELS: Record<Delimiter, string> = {
  ';': 'Semikolon (;)',
  ',': 'Komma (,)',
  '\t': 'Tab',
};

function buildExcludeKeys(result: CsvParseResult): Set<string> {
  const excludeKeys = new Set<string>();
  if (result.latIndex >= 0) excludeKeys.add(result.headers[result.latIndex]);
  if (result.lngIndex >= 0) excludeKeys.add(result.headers[result.lngIndex]);
  if (result.nameIndex >= 0) excludeKeys.add(result.headers[result.nameIndex]);
  if (result.timestampIndex >= 0)
    excludeKeys.add(result.headers[result.timestampIndex]);
  return excludeKeys;
}

function buildPreview(
  rawText: string,
  delimiter: Delimiter,
  fileName: string
): CsvPreviewState {
  const { headers, rows } = parseCsv(rawText, delimiter);
  const result = csvToRecords(headers, rows);
  const excludeKeys = buildExcludeKeys(result);
  const { schema, headerToSchemaKey } = generateSchemaFromRecords(
    result.records,
    excludeKeys,
    result.headers
  );
  return { rawText, delimiter, result, schema, headerToSchemaKey, fileName };
}

export default function CsvImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [preview, setPreview] = useState<CsvPreviewState | null>(null);
  const [everyNth, setEveryNth] = useState(1);
  const addFirecallItem = useFirecallItemAdd();

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const rawText = await readFileAsText(file);
    const delimiter = detectDelimiter(rawText);
    setEveryNth(1);
    setPreview(buildPreview(rawText, delimiter, file.name));
  }, []);

  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      if (!preview) return;
      setEveryNth(1);
      setPreview(
        buildPreview(preview.rawText, newDelimiter, preview.fileName)
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

      // Create layer
      const layer = await addFirecallItem({
        name: preview.fileName.replace(/\.\w+$/, '') || `CSV Import ${new Date().toLocaleDateString('de-AT')}`,
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
  }, [preview, everyNth, addFirecallItem]);

  const validCount = preview
    ? Math.ceil(preview.result.records.length / everyNth)
    : 0;

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

              <Typography variant="body2" color="text.secondary">
                Erkannte Spalten:{' '}
                {[
                  preview.result.latIndex >= 0 &&
                    `Lat: "${preview.result.headers[preview.result.latIndex]}"`,
                  preview.result.lngIndex >= 0 &&
                    `Lng: "${preview.result.headers[preview.result.lngIndex]}"`,
                  preview.result.nameIndex >= 0 &&
                    `Name: "${preview.result.headers[preview.result.nameIndex]}"`,
                  preview.result.timestampIndex >= 0 &&
                    `Zeit: "${preview.result.headers[preview.result.timestampIndex]}"`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Typography>

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
