'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useState, MouseEvent } from 'react';
import {
  formatCurrency,
  formatStatus,
  getStatusColor,
  KostenersatzCalculation,
} from '../../common/kostenersatz';
import { formatTimestamp, parseTimestamp } from '../../common/time-format';

export interface KostenersatzCardProps {
  calculation: KostenersatzCalculation;
  onEdit: (calculation: KostenersatzCalculation) => void;
  onDuplicate: (calculation: KostenersatzCalculation) => void;
  onDelete: (calculation: KostenersatzCalculation) => void;
  onGeneratePdf?: (calculation: KostenersatzCalculation) => void;
  onSendEmail?: (calculation: KostenersatzCalculation) => void;
}

export default function KostenersatzCard({
  calculation,
  onEdit,
  onDuplicate,
  onDelete,
  onGeneratePdf,
  onSendEmail,
}: KostenersatzCardProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleMenuClose();
    onEdit(calculation);
  };

  const handleDuplicate = () => {
    handleMenuClose();
    onDuplicate(calculation);
  };

  const handleDelete = () => {
    handleMenuClose();
    onDelete(calculation);
  };

  const handleGeneratePdf = () => {
    handleMenuClose();
    onGeneratePdf?.(calculation);
  };

  const handleSendEmail = () => {
    handleMenuClose();
    onSendEmail?.(calculation);
  };

  const createdDate = parseTimestamp(calculation.createdAt);
  const formattedDate = createdDate
    ? formatTimestamp(createdDate.toDate())
    : calculation.createdAt;

  return (
    <Card sx={{ position: 'relative' }}>
      {/* Menu button positioned outside CardActionArea to avoid nested buttons */}
      <IconButton
        size="small"
        onClick={handleMenuClick}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 1,
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <CardActionArea onClick={() => onEdit(calculation)}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              mb: 1,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={500}>
                {calculation.recipient.name || 'Kein Empfänger'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formattedDate}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 4 }}>
              <Chip
                label={formatStatus(calculation.status)}
                size="small"
                color={getStatusColor(calculation.status)}
              />
            </Box>
          </Box>

          {calculation.comment && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {calculation.comment}
            </Typography>
          )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {calculation.items.length} Positionen •{' '}
              {calculation.defaultStunden}h
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {formatCurrency(calculation.totalSum)}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleEdit}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Bearbeiten
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplizieren
        </MenuItem>
        {onGeneratePdf && (
          <MenuItem onClick={handleGeneratePdf}>
            <PictureAsPdfIcon fontSize="small" sx={{ mr: 1 }} />
            PDF erstellen
          </MenuItem>
        )}
        {onSendEmail && (
          <MenuItem
            onClick={handleSendEmail}
            disabled={!calculation.recipient.email || calculation.status === 'draft'}
          >
            <EmailIcon fontSize="small" sx={{ mr: 1 }} />
            Per E-Mail senden
          </MenuItem>
        )}
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Löschen
        </MenuItem>
      </Menu>
    </Card>
  );
}
