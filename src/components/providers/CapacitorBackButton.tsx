'use client';

import Snackbar from '@mui/material/Snackbar';
import { useTranslations } from 'next-intl';
import {
  EXIT_CONFIRM_TIMEOUT_MS,
  useCapacitorBackButton,
} from '../../hooks/useCapacitorBackButton';

/**
 * Hängt die Android-Zurück-Taste ein und zeigt die Beenden-Bestätigung.
 *
 * Bewusst eine eigene Snackbar statt der globalen aus `SnackbarProvider`: Die
 * Einblendung muss exakt so lange stehen, wie der zweite Druck auch wirklich
 * beendet ({@link EXIT_CONFIRM_TIMEOUT_MS}). Eine länger sichtbare Meldung
 * würde zum Weiterdrücken auffordern, obwohl das Fenster schon zu ist.
 */
export default function CapacitorBackButton() {
  const t = useTranslations('app');
  const { exitPromptOpen, dismissExitPrompt } = useCapacitorBackButton();

  return (
    <Snackbar
      open={exitPromptOpen}
      autoHideDuration={EXIT_CONFIRM_TIMEOUT_MS}
      onClose={() => dismissExitPrompt()}
      message={t('backAgainToExit')}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  );
}
