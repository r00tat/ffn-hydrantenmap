import Typography from '@mui/material/Typography';
import DrivePickerComponent from './DrivePicker/DrivePicker';
import { useCallback } from 'react';
import { useFirecallUpdateSheet } from '../../hooks/useFirecall';

export interface FrameWrapperProps {
  spreadsheetId?: string;
}

export default function FrameWrapper({ spreadsheetId }: FrameWrapperProps) {
  const updateFirecallSheet = useFirecallUpdateSheet();

  const onClose = useCallback(
    (doc?: google.picker.DocumentObject) => {
      if (doc) {
        updateFirecallSheet(doc.id);
      }
    },
    [updateFirecallSheet]
  );
  if (!spreadsheetId) {
    return (
      <>
        <Typography variant="h3">Einsatzsheet</Typography>
        <Typography>Bitte die Google Sheet ID im Einsatz eintragen!</Typography>
        <DrivePickerComponent onClose={onClose} />
      </>
    );
  }

  return (
    <iframe
      id="sheetFrame"
      src={`https://docs.google.com/spreadsheets/d/${
        spreadsheetId || process.env.EINSATZMAPPE_SHEET_ID
      }/edit`}
      style={{
        maxWidth: '100%',
        width: '100%',
        overflow: 'auto',
        height: '93vh',
      }}
    ></iframe>
  );
}
