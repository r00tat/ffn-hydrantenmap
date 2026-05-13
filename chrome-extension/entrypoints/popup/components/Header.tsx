import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import Logout from '@mui/icons-material/Logout';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { signOut } from '@shared/auth';
import { EINSATZKARTE_URL } from '@shared/config';
import { useTranslations } from '@shared/i18n';

interface HeaderProps {
  email: string;
}

export default function Header({ email }: HeaderProps) {
  const t = useTranslations('app');
  return (
    <AppBar position="static" color="primary" elevation={1}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 'bold' }}>
          {t('title')}
        </Typography>
        <Tooltip title={t('openInTab')}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => chrome.tabs.create({ url: EINSATZKARTE_URL })}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('signOut', { email })}>
          <IconButton size="small" color="inherit" onClick={signOut}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
