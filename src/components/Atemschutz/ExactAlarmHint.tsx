'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useTranslations } from 'next-intl';
import { useEffect, useSyncExternalStore } from 'react';
import {
  peekExactAlarmState,
  refreshExactAlarmState,
  requestExactAlarms,
  subscribeExactAlarmState,
} from '../../lib/nativeLocalNotifications';

/**
 * Hinweis in der Android-App, solange die Warnungen nicht auf die Minute
 * genau kommen können.
 *
 * Ohne die Erlaubnis „Alarme & Erinnerungen" (Android 12+) bündelt Android
 * geplante Benachrichtigungen im Ruhezustand — eine Rückzugswarnung kann sich
 * dann um Minuten verspäten. Die Erlaubnis wird nur auf Knopfdruck erfragt:
 * Das Plugin öffnete sonst bei jeder Planung die Systemeinstellungen (siehe
 * `syncNativeNotifications`).
 *
 * Im Browser und in einer App ohne das Plugin steht hier nichts
 * (`unavailable`).
 */
export default function ExactAlarmHint() {
  const t = useTranslations('atemschutz.ueberwachung.exakteAlarme');
  const state = useSyncExternalStore(
    subscribeExactAlarmState,
    peekExactAlarmState,
    () => undefined,
  );

  useEffect(() => {
    void refreshExactAlarmState();
    // Die Erlaubnis wird in den Systemeinstellungen erteilt, und Android
    // meldet das der WebView nicht — beim Zurückkehren nachlesen.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshExactAlarmState();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (state !== 'denied' && state !== 'prompt') return null;

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <Button
          color="inherit"
          size="small"
          onClick={() => void requestExactAlarms()}
        >
          {t('erlauben')}
        </Button>
      }
    >
      {t('hinweis')}
    </Alert>
  );
}
