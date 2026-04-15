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

interface HeaderProps {
  email: string;
}

export default function Header({ email }: HeaderProps) {
  return (
    <AppBar position="static" color="primary" elevation={1}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 'bold' }}>
          Einsatzkarte
        </Typography>
        <Tooltip title="In Einsatzkarte öffnen">
          <IconButton
            size="small"
            color="inherit"
            onClick={() => chrome.tabs.create({ url: EINSATZKARTE_URL })}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={`Abmelden (${email})`}>
          <IconButton size="small" color="inherit" onClick={signOut}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
