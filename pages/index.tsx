import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

const DynamicMap = dynamic(
  () => {
    return import('../components/Map');
  },
  { ssr: false }
);

const Home: NextPage = () => {
  return (
    <div className={styles.container}>
      <Head>
        <title>Hydrantenkarte</title>
        <meta
          name="description"
          content="Hydrantenkarte der Freiwilligen Feuerwehr Neusiedl am See"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
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

      <DynamicMap />

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
};

export default Home;
