'use client';

import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useState } from 'react';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { downloadBlob } from '../firebase/download';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';

export interface KostenersatzPdfButtonProps {
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates?: unknown[];
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
  onClick?: () => Promise<boolean | string | undefined>;
}

export default function KostenersatzPdfButton({
  calculation,
  firecall,
  variant = 'outlined',
  size = 'medium',
  onClick,
}: KostenersatzPdfButtonProps) {
  const [generating, setGenerating] = useState(false);
  const { idToken } = useFirebaseLogin();

  const handleGeneratePdf = async () => {
    setGenerating(true);
    try {
      let calcId = calculation.id;

      // If an onClick handler is provided (e.g. to save the calculation first), call it
      if (onClick) {
        const result = await onClick();
        if (result === false || result === undefined) {
          setGenerating(false);
          return;
        }
        // If result is a string, it's the (potentially new) calculation ID
        if (typeof result === 'string') {
          calcId = result;
        }
      }

      // Re-check ID after potential save
      if (!calcId) {
        throw new Error('Calculation ID is missing');
      }

      const params = new URLSearchParams({
        firecallId: firecall.id!,
        calculationId: calcId,
      });
      
      const headers: HeadersInit = {};
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(`/api/kostenersatz/pdf?${params}`, {
        headers,
      });

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
      disabled={generating || (!calculation.id && !onClick)}
    >
      {generating ? 'Erstelle PDF...' : 'PDF herunterladen'}
    </Button>
  );
}
