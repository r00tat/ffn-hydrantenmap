'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Container,
  Typography,
} from '@mui/material';
import { getBlaulichtSmsAlarms, BlaulichtSmsAlarm } from './actions';
import { hasBlaulichtsmsConfig } from './credentialsActions';
import AlarmCard from './AlarmCard';
import useFirecall from '../../hooks/useFirecall';

const BlaulichtSmsPage = () => {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [noCredentials, setNoCredentials] = useState(false);
  const firecall = useFirecall();
  const groupId = firecall?.group;

  useEffect(() => {
    const loadData = async () => {
      if (!groupId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setNoCredentials(false);

      try {
        const [hasCreds, fetchedAlarms] = await Promise.all([
          hasBlaulichtsmsConfig(groupId),
          getBlaulichtSmsAlarms(groupId),
        ]);
        setNoCredentials(!hasCreds && fetchedAlarms.length === 0);
        const sorted = [...fetchedAlarms].sort(
          (a, b) =>
            new Date(b.alarmDate).getTime() - new Date(a.alarmDate).getTime()
        );
        setAlarms(sorted);
      } catch (err) {
        console.error('Failed to load BlaulichtSMS data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [groupId]);

  const currentAlarm = alarms.length > 0 ? alarms[0] : null;
  const recentAlarms = alarms.length > 1 ? alarms.slice(1) : [];

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        BlaulichtSMS Einsätze
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : !groupId ? (
        <Typography variant="body1" sx={{ mt: 4 }}>
          Kein aktiver Einsatz ausgewählt.
        </Typography>
      ) : noCredentials ? (
        <Typography variant="body1" sx={{ mt: 4 }}>
          Keine BlaulichtSMS-Zugangsdaten für diese Gruppe konfiguriert. Bitte
          in den Admin-Einstellungen hinterlegen.
        </Typography>
      ) : (
        <>
          {currentAlarm && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Aktive Einsätze
              </Typography>
              <AlarmCard alarm={currentAlarm} />
            </Box>
          )}

          {recentAlarms.length > 0 && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Vergangene Alarme
              </Typography>
              {recentAlarms.map((alarm) => (
                <AlarmCard key={alarm.alarmId} alarm={alarm} />
              ))}
            </Box>
          )}

          {!currentAlarm && !recentAlarms.length && (
            <Typography variant="body1" sx={{ mt: 4 }}>
              Keine Alarme gefunden.
            </Typography>
          )}
        </>
      )}
    </Container>
  );
};

export default BlaulichtSmsPage;
