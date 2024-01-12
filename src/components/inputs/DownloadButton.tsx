import DownloadIcon from '@mui/icons-material/Download';
import { IconButton, IconButtonProps, Tooltip } from '@mui/material';

export interface DownloadButtonProps extends IconButtonProps {
  tooltip: string;
}

export function DownloadButton({
  tooltip,
  ...iconButtonProps
}: DownloadButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <IconButton {...iconButtonProps}>
        <DownloadIcon />
      </IconButton>
    </Tooltip>
  );
}
