'use client';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { pdf } from '@react-pdf/renderer';
import { useState } from 'react';
import { KostenersatzCalculation, KostenersatzRate } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import KostenersatzPdf from './KostenersatzPdf';

export interface KostenersatzPdfButtonProps {
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates: KostenersatzRate[];
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
}

export default function KostenersatzPdfButton({
  calculation,
  firecall,
  rates,
  variant = 'outlined',
  size = 'medium',
}: KostenersatzPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const doc = <KostenersatzPdf calculation={calculation} firecall={firecall} rates={rates} />;
      const blob = await pdf(doc).toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename
      const date = calculation.callDateOverride || firecall.date || new Date().toISOString();
      const dateStr = date.split('T')[0];
      const recipientName = calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Kostenersatz';
      link.download = `Kostenersatz_${dateStr}_${recipientName}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      // TODO: Show error notification
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      startIcon={generating ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
      onClick={handleGeneratePdf}
      disabled={generating}
    >
      {generating ? 'Erstelle PDF...' : 'PDF herunterladen'}
    </Button>
  );
}
