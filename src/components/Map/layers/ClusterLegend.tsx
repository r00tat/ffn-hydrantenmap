'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface LegendEntry {
  iconUrl: string;
  label: string;
  count: number;
}

function collectVisibleMarkerTypes(map: L.Map): LegendEntry[] {
  const bounds = map.getBounds();
  const iconCounts = new Map<string, { count: number; label: string }>();

  map.eachLayer((layer) => {
    if (
      layer instanceof L.Marker &&
      !('getAllChildMarkers' in layer)
    ) {
      const latLng = layer.getLatLng();
      if (bounds.contains(latLng)) {
        const icon = layer.options.icon;
        const iconUrl = icon?.options?.iconUrl;
        if (iconUrl) {
          const existing = iconCounts.get(iconUrl);
          const title = layer.options.title || '';
          if (existing) {
            existing.count++;
          } else {
            // Derive a label from the icon URL: /icons/hydrant.png -> Hydrant
            const label =
              title ||
              iconUrl
                .replace(/^.*\//, '')
                .replace(/[-_]/g, ' ')
                .replace(/\.\w+$/, '')
                .replace(/\bicon\b/gi, '')
                .trim() || 'Marker';
            iconCounts.set(iconUrl, { count: 1, label });
          }
        }
      }
    }
  });

  return Array.from(iconCounts.entries())
    .map(([iconUrl, { count, label }]) => ({ iconUrl, count, label }))
    .sort((a, b) => b.count - a.count);
}

export default function ClusterLegend() {
  const map = useMap();
  const [entries, setEntries] = useState<LegendEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const updateLegend = useMemo(
    () => () => {
      setEntries(collectVisibleMarkerTypes(map));
    },
    [map]
  );

  useMapEvent('moveend', updateLegend);
  useMapEvent('zoomend', updateLegend);
  useMapEvent('layeradd', updateLegend);
  useMapEvent('layerremove', updateLegend);

  useEffect(() => {
    // Initial population
    const timer = setTimeout(updateLegend, 500);
    return () => clearTimeout(timer);
  }, [updateLegend]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Paper
      elevation={2}
      sx={{
        position: 'absolute',
        bottom: 24,
        left: 10,
        zIndex: 1000,
        maxWidth: 200,
        maxHeight: collapsed ? 'auto' : 300,
        overflow: collapsed ? 'visible' : 'auto',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderRadius: 1,
        pointerEvents: 'auto',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.25,
          borderBottom: collapsed ? 'none' : '1px solid rgba(0,0,0,0.1)',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Typography variant="caption" fontWeight={600} fontSize={11}>
          Legende
        </Typography>
        <IconButton size="small" sx={{ p: 0 }}>
          {collapsed ? (
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ExpandLessIcon fontSize="small" />
          )}
        </IconButton>
      </Box>
      {!collapsed && (
        <Box sx={{ px: 1, py: 0.5 }}>
          {entries.map((entry) => (
            <Box
              key={entry.iconUrl}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                py: 0.25,
              }}
            >
              <img
                src={entry.iconUrl}
                width={16}
                height={16}
                alt={entry.label}
                style={{ flexShrink: 0, objectFit: 'contain' }}
              />
              <Typography
                variant="caption"
                fontSize={11}
                sx={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.label}
              </Typography>
              <Typography variant="caption" fontSize={11} fontWeight={600}>
                {entry.count}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}
