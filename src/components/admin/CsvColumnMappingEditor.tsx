'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { TARGET_FIELDS } from '../../server/hydrantenCsvParser';

export interface ColumnMapping {
  /** Original CSV header → target field key (or empty string for "ignore") */
  [csvHeader: string]: string;
}

interface CsvColumnMappingEditorProps {
  csvHeaders: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  disabled?: boolean;
}

export default function CsvColumnMappingEditor({
  csvHeaders,
  mapping,
  onMappingChange,
  disabled = false,
}: CsvColumnMappingEditorProps) {
  const requiredFields = TARGET_FIELDS.filter((f) => f.required).map((f) => f.key);
  const assignedTargets = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = requiredFields.filter((f) => !assignedTargets.has(f));

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Spalten-Zuordnung
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Prüfe und korrigiere die Zuordnung der CSV-Spalten zu den Hydrantenfeldern.
      </Typography>

      {missingRequired.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="error">
            Pflichtfelder nicht zugeordnet:{' '}
            {missingRequired.map((f) => (
              <Chip key={f} label={TARGET_FIELDS.find((t) => t.key === f)?.label ?? f} size="small" color="error" variant="outlined" sx={{ mr: 0.5 }} />
            ))}
          </Typography>
        </Box>
      )}

      <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>CSV-Spalte</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Zielfeld</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {csvHeaders.map((header) => (
              <TableRow key={header}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {header}
                  </Typography>
                </TableCell>
                <TableCell>
                  <FormControl size="small" fullWidth disabled={disabled}>
                    <Select
                      value={mapping[header] ?? ''}
                      onChange={(e) => {
                        onMappingChange({ ...mapping, [header]: e.target.value });
                      }}
                      displayEmpty
                    >
                      <MenuItem value="">
                        <em>— ignorieren —</em>
                      </MenuItem>
                      {TARGET_FIELDS.map((field) => {
                        const usedByOther = Object.entries(mapping).some(
                          ([h, v]) => h !== header && v === field.key
                        );
                        return (
                          <MenuItem key={field.key} value={field.key} disabled={usedByOther}>
                            {field.label}{field.required ? ' *' : ''}{usedByOther ? ' (bereits zugeordnet)' : ''}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
