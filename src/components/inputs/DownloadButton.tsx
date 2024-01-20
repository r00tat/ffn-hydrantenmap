import DownloadIcon from '@mui/icons-material/Download';
import IconButton, { IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

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
