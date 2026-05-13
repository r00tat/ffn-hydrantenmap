'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useCallback, useState } from 'react';
import { updateMyLanguage } from '../../app/actions/userSettings';
import { LOCALES, Locale, isLocale } from '../../i18n/config';

export default function LanguageSelector() {
  const t = useTranslations('profile.language');
  const currentLocale = useLocale() as Locale;
  const { update: updateSession } = useSession();

  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  const handleChange = useCallback(
    async (event: SelectChangeEvent<string>) => {
      const next = event.target.value;
      if (!isLocale(next) || next === currentLocale) return;

      setPending(true);
      setFeedback(null);
      try {
        await updateMyLanguage(next);
        // Push the new language into the JWT so subsequent renders are
        // already localized when the page reloads.
        await updateSession({ language: next });
        setFeedback({ kind: 'success', message: t('saved') });
        // Force a re-fetch of the localized layout.
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } catch (err) {
        console.error('updateMyLanguage failed', err);
        setFeedback({ kind: 'error', message: t('error') });
      } finally {
        setPending(false);
      }
    },
    [currentLocale, t, updateSession],
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('sectionTitle')}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
        {t('description')}
      </Typography>
      <FormControl size="small" sx={{ minWidth: 220 }} disabled={pending}>
        <InputLabel id="language-selector-label">{t('label')}</InputLabel>
        <Select
          labelId="language-selector-label"
          id="language-selector"
          value={currentLocale}
          label={t('label')}
          onChange={handleChange}
        >
          {LOCALES.map((locale) => (
            <MenuItem key={locale} value={locale}>
              {locale === 'de' ? t('optionDe') : t('optionEn')}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {pending && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2">{t('saving')}</Typography>
        </Box>
      )}
      {feedback && (
        <Alert severity={feedback.kind} sx={{ mt: 2 }}>
          {feedback.message}
        </Alert>
      )}
    </Box>
  );
}
