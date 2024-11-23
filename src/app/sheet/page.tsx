'use client';
import { NextPage } from 'next';
import useFirecall from '../../hooks/useFirecall';
import Typography from '@mui/material/Typography';
import FrameWrapper from './FrameWrapper';

const SheetPage: NextPage = () => {
  const firecall = useFirecall();
  return (
    <>
      <FrameWrapper spreadsheetId={firecall.sheetId} />
    </>
  );
};

export default SheetPage;
