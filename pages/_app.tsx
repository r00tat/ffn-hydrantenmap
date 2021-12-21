import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';
import AppDrawer from '../components/AppDrawer';
import '../styles/globals.css';
import styles from '../styles/Home.module.css';

function MyApp({ Component, pageProps }: AppProps) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  return (
    <div className={styles.container}>
      <Head>
        <title>Hydrantenkarte</title>
        <meta
          name="description"
          content="Hydrantenkarte der Freiwilligen Feuerwehr Neusiedl am See"
        />
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <CssBaseline enableColorScheme />

      <AppDrawer isOpen={isDrawerOpen} setIsOpen={setIsDrawerOpen} />

      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Hydrantenkarte
            </Typography>
            {/* <Button color="inherit">Login</Button> */}
          </Toolbar>
        </AppBar>
      </Box>

      <Component {...pageProps} />

      <footer className={styles.footer}>
        <a
          href="https://www.ff-neusiedlamsee.at"
          target="_blank"
          rel="noopener noreferrer"
        >
          Hydranten Karte der Freiwilligen Feuerwehr Neusiedl am See
        </a>
      </footer>
    </div>
  );
}

export default MyApp;
