'use client';
import DownloadIcon from '@mui/icons-material/Download';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useCallback, useState } from 'react';
import { FirecallItem } from './firestore';
import { downloadText } from './download';
import {
  exportLayerItemsToCsv,
  exportLayerItemsToGpx,
  exportLayerItemsToKml,
} from './layerExport';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').substring(0, 50);
}

export default function LayerExportMenu({
  layerName,
  items,
}: {
  layerName: string;
  items: FirecallItem[];
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const baseName = sanitizeFilename(layerName);

  const handleCsv = useCallback(() => {
    downloadText(
      exportLayerItemsToCsv(items),
      `${baseName}.csv`,
      'text/csv;charset=utf-8'
    );
    handleClose();
  }, [items, baseName, handleClose]);

  const handleGpx = useCallback(() => {
    downloadText(
      exportLayerItemsToGpx(items, layerName),
      `${baseName}.gpx`,
      'application/gpx+xml;charset=utf-8'
    );
    handleClose();
  }, [items, layerName, baseName, handleClose]);

  const handleKml = useCallback(() => {
    downloadText(
      exportLayerItemsToKml(items, layerName),
      `${baseName}.kml`,
      'application/vnd.google-earth.kml+xml;charset=utf-8'
    );
    handleClose();
  }, [items, layerName, baseName, handleClose]);

  if (items.length === 0) return null;

  return (
    <>
      <IconButton
        size="small"
        onClick={handleClick}
        aria-label="Ebene exportieren"
      >
        <DownloadIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={handleCsv}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>CSV exportieren</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleGpx}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>GPX exportieren</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleKml}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>KML exportieren</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
