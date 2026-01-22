'use client';

import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export interface DataPreviewColumn {
  key: string;
  label: string;
}

export interface DataPreviewProps {
  data: Record<string, unknown>[];
  columns: DataPreviewColumn[];
  maxRows?: number;
  total?: number;
}

export default function DataPreview({
  data,
  columns,
  maxRows = 20,
  total,
}: DataPreviewProps) {
  const displayedRows = data.slice(0, maxRows);
  const totalCount = total ?? data.length;
  const showingCount = Math.min(displayedRows.length, totalCount);

  return (
    <Box>
      <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} sx={{ fontWeight: 'bold' }}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={`${rowIndex}-${column.key}`}>
                    {String(row[column.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {totalCount > showingCount && (
        <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
          Showing {showingCount} of {totalCount} records
        </Typography>
      )}
    </Box>
  );
}
