'use client';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useState } from 'react';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { downloadBlob } from '../firebase/download';

export interface KostenersatzPdfButtonProps {
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates?: unknown[];
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
}

export default function KostenersatzPdfButton({
  calculation,
  firecall,
  variant = 'outlined',
  size = 'medium',
}: KostenersatzPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      const params = new URLSearchParams({
        firecallId: firecall.id!,
        calculationId: calculation.id!,
      });
      const response = await fetch(`/api/kostenersatz/pdf?${params}`);

      if (!response.ok) {
        throw new Error(`PDF generation failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const date = calculation.callDateOverride || firecall.date || new Date().toISOString();
      const dateStr = date.split('T')[0];
      const recipientName = calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Kostenersatz';
      await downloadBlob(blob, `Kostenersatz_${dateStr}_${recipientName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
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
