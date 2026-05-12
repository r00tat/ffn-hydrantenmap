import HistoryIcon from '@mui/icons-material/History';
import LocalFireDepartmentTwoToneIcon from '@mui/icons-material/LocalFireDepartmentTwoTone';
import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useCallback, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecall from '../../hooks/useFirecall';
import useMapEditor from '../../hooks/useMapEditor';
import { FirecallHistory } from '../firebase/firestore';
import EinsatzDialog from '../FirecallItems/EinsatzDialog';
import HistoryDialog from './HistoryDialog';

function HeaderBar({
  isDrawerOpen,
  setIsDrawerOpen,
}: {
  isDrawerOpen: boolean;
  setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const t = useTranslations('header');
  const { isSignedIn, displayName, photoURL, isAuthorized } =
    useFirebaseLogin();
  const firecall = useFirecall();
  const { history, selectHistory, selectedHistory, historyModeActive } =
    useMapEditor();
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const historyDialogClose = useCallback(
    (history?: FirecallHistory) => {
      setIsHistoryDialogOpen(false);
      selectHistory(history?.id);
    },
    [selectHistory]
  );
  const [einsatzDialog, setEinsatzDialog] = useState(false);

  return (
    <>
      <Box sx={{ flexShrink: 0 }}>
        <AppBar position="static">
          <Toolbar>
            {isSignedIn && (
              <IconButton
                size="large"
                edge="start"
                color="inherit"
                aria-label={t('menuAria')}
                sx={{ mr: 2 }}
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Box
              sx={{
                flexGrow: 1,
                display: 'flex',
                alignItems: 'baseline',
                minWidth: 0,
              }}
            >
              <Typography
                variant="h6"
                component="div"
                noWrap
                sx={(theme) => ({
                  display: 'none',
                  [theme.breakpoints.up('sm')]: {
                    display: 'inline',
                  },
                })}
                style={{
                  paddingRight: 4,
                }}
              >
                {t('appTitle')}{' '}
              </Typography>
              <Typography
                variant="h6"
                component="div"
                noWrap
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {firecall?.id ? (
                  <Link
                    href={`/einsatz/${firecall.id}/details`}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {firecall.name || ''}
                  </Link>
                ) : (
                  firecall?.name || ''
                )}
                {!isSignedIn && t('loginRequired')}
                {isSignedIn && !isAuthorized && t('authorizationRequired')}
              </Typography>

              {selectedHistory && (
                <Typography
                  noWrap
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    pl: 2,
                  }}
                >
                  {selectedHistory?.description}
                </Typography>
              )}
            </Box>

            {isSignedIn && (
              <Tooltip title={t('newFirecallTooltip')}>
                <Button
                  color={'info'}
                  style={{
                    backgroundColor: '#fff',
                    marginLeft: 8,
                    marginRight: 8,
                  }}
                  onClick={() => {
                    setEinsatzDialog(true);
                  }}
                >
                  <LocalFireDepartmentTwoToneIcon />
                </Button>
              </Tooltip>
            )}

            {isSignedIn && (
              <Tooltip title={t('historyTooltip')}>
                <Button
                  color={historyModeActive ? 'error' : 'info'}
                  style={{
                    backgroundColor: '#fff',
                    marginLeft: 8,
                    marginRight: 8,
                  }}
                  onClick={() => {
                    setIsHistoryDialogOpen(true);
                  }}
                >
                  <HistoryIcon />
                </Button>
              </Tooltip>
            )}
            {!isSignedIn && (
              <Link href="/login" passHref>
                <Button color="inherit">{t('loginButton')}</Button>
              </Link>
            )}
            {isSignedIn && (
              <Link href="/profile" passHref>
                <Avatar alt={displayName} src={photoURL} />
              </Link>
            )}
          </Toolbar>
        </AppBar>
      </Box>
      {isHistoryDialogOpen && <HistoryDialog onClose={historyDialogClose} />}
      {einsatzDialog && (
        <EinsatzDialog onClose={() => setEinsatzDialog(false)} />
      )}
    </>
  );
}

export default HeaderBar;
