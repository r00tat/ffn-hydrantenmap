'use client';

import SmartToyIcon from '@mui/icons-material/SmartToy';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { isMcpItem, mcpClientLabel } from '../../common/mcp/provenance';

export interface McpOriginChipProps {
  item: { source?: string; mcpClientName?: string; mcpClientId?: string };
}

/**
 * Kennzeichnet einen Eintrag, den eine verbundene Anwendung über MCP
 * geschrieben hat.
 *
 * Im Einsatztagebuch muss erkennbar sein, dass eine Maschine geschrieben hat:
 * Der Eintrag kann Grundlage eines Einsatzberichts sein, und dann zählt, ob
 * ihn ein Mensch verfasst hat. Ohne Herkunft steht die Zeile genauso da wie
 * eine handgeschriebene.
 */
export default function McpOriginChip({ item }: McpOriginChipProps) {
  const t = useTranslations('connectedApps');

  if (!isMcpItem(item)) {
    return null;
  }

  const client = mcpClientLabel(item);
  return (
    <Tooltip title={t('mcpOriginTooltip', { client: client ?? '' })}>
      <Chip
        size="small"
        variant="outlined"
        icon={<SmartToyIcon />}
        label={t('mcpOrigin')}
        sx={{ ml: 0.5, verticalAlign: 'middle' }}
      />
    </Tooltip>
  );
}
