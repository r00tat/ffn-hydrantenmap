'use client';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import NextLink from 'next/link';
import DebugLoggingSwitch from '../../components/logging/DebugLoggingSwitch';

const FEATURES = [
  'map',
  'operation',
  'breathing',
  'water',
  'reference',
  'assistant',
  'admin',
] as const;

export default function About() {
  const t = useTranslations('about');
  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Image
          src="/FFND_logo.png"
          alt="Logo FF Neusiedl am See"
          width={1921}
          height={378}
          priority
          style={{ width: '100%', maxWidth: 400, height: 'auto' }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
          {/* Logo der App, das Feuerwehr-Logo darüber steht für den Betreiber. */}
          <Image src="/brand/logo.png" alt="" width={72} height={72} />
          <Typography variant="h3">{t('title')}</Typography>
        </Box>
      </Box>
      <Typography sx={{ mb: 1 }}>{t('intro')}</Typography>
      <Typography>{t('featuresIntro')}</Typography>
      <Box component="ul" sx={{ mt: 0.5 }}>
        {FEATURES.map((feature) => (
          <Typography component="li" key={feature}>
            {t(`features.${feature}`)}
          </Typography>
        ))}
      </Box>
      <Typography sx={{ mb: 2 }}>
        {t('docsIntro')}
        <Link component={NextLink} href="/docs">
          {t('docsLink')}
        </Link>
        .
      </Typography>
      <Typography variant="h4" gutterBottom>
        {t('impressum')}
      </Typography>
      <Typography variant="h5">
        <b>{t('responsible')}</b>
      </Typography>
      <Typography>
        Feuerwehr Neusiedl am See
        <br />
        A-7100 Neusiedl am See, Satzgasse 9<br />
        Tel: +43 2167 / 2250
        <br />
        email: verwaltung [at] ff-neusiedlamsee [dot] at
        <br />
        <a href="http://www.ff-neusiedlamsee.at/" target="_blank" rel="noopener noreferrer">
          http://www.ff-neusiedlamsee.at/
        </a>
      </Typography>
      <Typography variant="h5">{t('copyright')}</Typography>
      <Typography>
        {t('copyrightBody')}
        <br />
      </Typography>
      <Typography variant="h5">{t('liability')}</Typography>
      <Typography>{t('liabilityBody')}</Typography>

      <Typography variant="h5">{t('privacy')}</Typography>
      <Typography>
        {t('privacyIntro')}
        <Link component={NextLink} href="/datenschutz">
          {t('privacyLink')}
        </Link>
        .
      </Typography>

      <Typography variant="h5">{t('version')}</Typography>
      <Typography>{t('buildId', { id: process.env.NEXT_PUBLIC_BUILD_ID || '' })}</Typography>

      <DebugLoggingSwitch />
    </Paper>
  );
}
