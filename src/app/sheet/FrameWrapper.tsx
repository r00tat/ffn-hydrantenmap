import Typography from '@mui/material/Typography';
import React, { useEffect } from 'react';
import DrivePickerComponent from './DrivePicker/DrivePicker';

export interface FrameWrapperProps {
  spreadsheetId?: string;
}

export default function FrameWrapper({ spreadsheetId }: FrameWrapperProps) {
  if (!spreadsheetId) {
    return (
      <>
        <Typography variant="h3">Einsatzsheet</Typography>
        <Typography>Bitte die Google Sheet ID im Einsatz eintragen!</Typography>
        <DrivePickerComponent />
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
        height: '94vh',
      }}
    ></iframe>
  );
}
