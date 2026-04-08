'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Container,
  Typography,
} from '@mui/material';
import {
  getBlaulichtSmsAlarms,
  getFirecallsByAlarmIds,
  BlaulichtSmsAlarm,
} from './actions';
import { hasBlaulichtsmsConfig } from './credentialsActions';
import AlarmCard from './AlarmCard';
import EinsatzDialog from '../../components/FirecallItems/EinsatzDialog';
import { Firecall } from '../../components/firebase/firestore';
import useFirecall from '../../hooks/useFirecall';

const BlaulichtSmsPage = () => {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [noCredentials, setNoCredentials] = useState(false);
  const [firecallMap, setFirecallMap] = useState<
    Record<string, { id: string; name: string }>
  >({});
  const [createFromAlarm, setCreateFromAlarm] =
    useState<BlaulichtSmsAlarm | null>(null);
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

        const alarmIds = sorted.map((a) => a.alarmId);
        if (alarmIds.length > 0) {
          const mapping = await getFirecallsByAlarmIds(alarmIds);
          setFirecallMap(mapping);
        }
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

  const handleCreateEinsatz = (alarm: BlaulichtSmsAlarm) => {
    setCreateFromAlarm(alarm);
  };

  const buildEinsatzFromAlarm = (alarm: BlaulichtSmsAlarm): Firecall => {
    const parts = alarm.alarmText.split('/');
    const name =
      parts.length >= 5
        ? [parts[2], parts[3], parts[4]].join(' ').trim()
        : alarm.alarmText;
    const coords =
      alarm.geolocation?.coordinates ?? alarm.coordinates ?? null;
    return {
      name,
      date: new Date(alarm.alarmDate).toISOString(),
      description: alarm.alarmText,
      blaulichtSmsAlarmId: alarm.alarmId,
      group: groupId ?? '',
      fw: firecall?.fw ?? '',
      ...(coords ? { lat: coords.lat, lng: coords.lon } : {}),
    };
  };

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
              <AlarmCard
                alarm={currentAlarm}
                firecall={firecallMap[currentAlarm.alarmId]}
                onCreateEinsatz={handleCreateEinsatz}
              />
            </Box>
          )}

          {recentAlarms.length > 0 && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Vergangene Alarme
              </Typography>
              {recentAlarms.map((alarm) => (
                <AlarmCard
                  key={alarm.alarmId}
                  alarm={alarm}
                  firecall={firecallMap[alarm.alarmId]}
                  onCreateEinsatz={handleCreateEinsatz}
                />
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

      {createFromAlarm && (
        <EinsatzDialog
          einsatz={buildEinsatzFromAlarm(createFromAlarm)}
          onClose={(fc?: Firecall) => {
            if (fc && createFromAlarm) {
              setFirecallMap((prev) => ({
                ...prev,
                [createFromAlarm.alarmId]: {
                  id: fc.id ?? '',
                  name: fc.name,
                },
              }));
            }
            setCreateFromAlarm(null);
          }}
        />
      )}
    </Container>
  );
};

export default BlaulichtSmsPage;
