'use client';

import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import RescueSheetCard from '../../components/Rettungskarten/RescueSheetCard';
import { loadRescueMakesAction, searchRescueSheetsAction } from './rescueActions';
import type { RescueSheetView } from '../../common/rescue/types';

/** Wartezeit nach der letzten Eingabe, bevor gesucht wird. */
const SEARCH_DEBOUNCE_MS = 350;

const RettungskartenPage = () => {
  const t = useTranslations('rettungskarten');

  const [term, setTerm] = useState('');
  const [makes, setMakes] = useState<string[]>([]);
  const [makesError, setMakesError] = useState(false);
  // Das Ergebnis trägt seinen Suchbegriff mit sich: solange er nicht zum
  // aktuellen Eingabefeld passt, läuft die Suche noch. Damit kommt die Seite
  // ohne ein zweites, im Effekt gesetztes „lädt gerade“ aus.
  const [result, setResult] = useState<{
    term: string;
    sheets: RescueSheetView[];
    error: boolean;
  } | null>(null);

  const trimmed = term.trim();

  useEffect(() => {
    loadRescueMakesAction()
      .then((res) => {
        setMakes(res.makes);
        setMakesError(!!res.error);
      })
      .catch((err) => {
        console.error('Failed to load rescue makes:', err);
        setMakesError(true);
      });
  }, []);

  useEffect(() => {
    if (!trimmed) return;

    // Eine abgebrochene Suche darf ein späteres Ergebnis nicht überschreiben.
    let current = true;
    const timer = setTimeout(() => {
      searchRescueSheetsAction(trimmed)
        .then((res) => {
          if (current) {
            setResult({ term: trimmed, sheets: res.sheets, error: !!res.error });
          }
        })
        .catch((err) => {
          console.error('Rescue sheet search failed:', err);
          if (current) {
            setResult({ term: trimmed, sheets: [], error: true });
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const shown = result?.term === trimmed ? result : null;
  const searching = trimmed !== '' && shown === null;

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('title')}
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        {t('source')}
      </Alert>

      <TextField
        fullWidth
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
      />

      {(makesError || shown?.error) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {t('errorUpstream')}
        </Alert>
      )}

      {!trimmed && makes.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            {t('makesHeading')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {makes.map((make) => (
              <Chip
                key={make}
                label={make}
                onClick={() => setTerm(make)}
                clickable
              />
            ))}
          </Stack>
        </Box>
      )}

      {searching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {shown !== null && (
        <Box sx={{ mt: 3 }}>
          {shown.sheets.length === 0 ? (
            <Alert severity="info">{t('noResults')}</Alert>
          ) : (
            <>
              <Typography variant="subtitle1" gutterBottom>
                {t('resultCount', { count: shown.sheets.length })}
              </Typography>
              {shown.sheets.map((sheet) => (
                <RescueSheetCard key={sheet.id} sheet={sheet} />
              ))}
            </>
          )}
        </Box>
      )}
    </Container>
  );
};

export default RettungskartenPage;
