'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Map icon URL patterns to type keys and German labels */
const ICON_TYPE_MAP: { pattern: string | RegExp; typeKey: string; label: string; defaultIcon: string }[] = [
  { pattern: '/icons/hydrant.png', typeKey: 'hydrant', label: 'Hydranten', defaultIcon: '/icons/hydrant.png' },
  { pattern: '/icons/unterflur-hydrant-icon.png', typeKey: 'hydrant', label: 'Hydranten', defaultIcon: '/icons/hydrant.png' },
  { pattern: '/icons/hydrant-icon-fuellen.png', typeKey: 'hydrant-fuell', label: 'Füllhydranten', defaultIcon: '/icons/hydrant-icon-fuellen.png' },
  { pattern: '/icons/saugstelle-icon.png', typeKey: 'saugstelle', label: 'Saugstellen', defaultIcon: '/icons/saugstelle-icon.png' },
  { pattern: '/icons/loeschteich-icon.png', typeKey: 'loeschteich', label: 'Löschteiche', defaultIcon: '/icons/loeschteich-icon.png' },
  { pattern: '/icons/risiko.svg', typeKey: 'risiko', label: 'Risiko Objekte', defaultIcon: '/icons/risiko.svg' },
  { pattern: '/icons/gefahr.svg', typeKey: 'gefahr', label: 'Gefahr Objekte', defaultIcon: '/icons/gefahr.svg' },
  { pattern: '/icons/fire.svg', typeKey: 'fire', label: 'Einsatz', defaultIcon: '/icons/fire.svg' },
  { pattern: /^\/api\/fzg\?/, typeKey: 'vehicle', label: 'Fahrzeuge', defaultIcon: '/icons/leaflet/marker-icon.png' },
  { pattern: /^\/api\/icons\/marker\?/, typeKey: 'marker', label: 'Marker', defaultIcon: '/icons/leaflet/marker-icon.png' },
];

function getTypeInfo(iconUrl: string): { typeKey: string; label: string; icon: string } {
  for (const entry of ICON_TYPE_MAP) {
    if (typeof entry.pattern === 'string') {
      if (iconUrl === entry.pattern) return { typeKey: entry.typeKey, label: entry.label, icon: entry.defaultIcon };
    } else {
      if (entry.pattern.test(iconUrl)) return { typeKey: entry.typeKey, label: entry.label, icon: entry.defaultIcon };
    }
  }
  // Fallback: use the URL itself as type key
  const label = iconUrl
    .replace(/^.*\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\.\w+$/, '')
    .replace(/\bicon\b/gi, '')
    .trim() || 'Marker';
  return { typeKey: iconUrl, label, icon: iconUrl };
}

function collectVisibleMarkerTypes(map: L.Map): LegendEntry[] {
  const bounds = map.getBounds();
  const typeCounts = new Map<string, { count: number; label: string; iconUrl: string }>();

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
          const typeInfo = getTypeInfo(iconUrl);
          const existing = typeCounts.get(typeInfo.typeKey);
          if (existing) {
            existing.count++;
          } else {
            typeCounts.set(typeInfo.typeKey, {
              count: 1,
              label: typeInfo.label,
              iconUrl: typeInfo.icon,
            });
          }
        }
      }
    }
  });

  return Array.from(typeCounts.values())
    .sort((a, b) => b.count - a.count);
}

export default function ClusterLegend() {
  const map = useMap();
  const [entries, setEntries] = useState<LegendEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const updateLegend = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setEntries(collectVisibleMarkerTypes(map));
    }, 150);
  }, [map]);

  useMapEvent('moveend', updateLegend);
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
