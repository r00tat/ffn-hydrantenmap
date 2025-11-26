'use client';

import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Box,
  CircularProgress,
  Chip,
} from '@mui/material';
import { getBlaulichtSmsAlarms, BlaulichtSmsAlarm } from './actions';

const BlaulichtSmsPage = () => {
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlarms = async () => {
      setLoading(true);
      const fetchedAlarms = await getBlaulichtSmsAlarms();
      // Sort alarms by date, newest first
      const sortedAlarms = fetchedAlarms.sort(
        (a, b) =>
          new Date(b.alarmDate).getTime() - new Date(a.alarmDate).getTime()
      );
      setAlarms(sortedAlarms);
      setLoading(false);
    };

    fetchAlarms();
  }, []);

  const currentAlarm = alarms.length > 0 ? alarms[0] : null;
  const recentAlarms = alarms.length > 1 ? alarms.slice(1) : [];

  const renderAlarmCard = (alarm: BlaulichtSmsAlarm) => {
    const functionCounts = alarm.recipients
      .filter((r) => r.participation === 'yes')
      .flatMap((r) => r.functions)
      .reduce((acc, func) => {
        const key = func.shortForm;
        if (!acc[key]) {
          acc[key] = {
            count: 0,
            background: func.backgroundHexColorCode,
            color: func.foregroundHexColorCode,
          };
        }
        acc[key].count++;
        return acc;
      }, {} as Record<string, { count: number; background: string; color: string }>);

    return (
      <Card key={alarm.alarmId} sx={{ mb: 2 }}>
        <CardHeader
          title={alarm.alarmText}
          subheader={`Alarmzeit: ${new Date(alarm.alarmDate).toLocaleString()}`}
        />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            <strong>Endzeit:</strong> {new Date(alarm.endDate).toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Ersteller:</strong> {alarm.authorName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Gruppen:</strong>{' '}
            {alarm.alarmGroups.map((g) => g.groupName).join(', ')}
          </Typography>

          <Typography variant="h6" component="div" sx={{ mt: 2 }}>
            Funktionen
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {Object.entries(functionCounts).map(([func, data]) => (
              <Chip
                key={func}
                label={`${func}: ${data.count}`}
                sx={{
                  backgroundColor: data.background,
                  color: data.color,
                }}
              />
            ))}
          </Box>

          <Typography variant="h6" component="div" sx={{ mt: 2 }}>
            Zusagen
          </Typography>
          <Box>
            {alarm.recipients
              .filter((r) => r.participation === 'yes')
              .map((recipient) => (
                <Box
                  key={recipient.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <Typography variant="body2">{recipient.name}</Typography>
                  <Box>
                    {recipient.functions.map((func) => (
                      <Chip
                        key={func.functionId}
                        label={func.shortForm}
                        size="small"
                        sx={{
                          ml: 1,
                          backgroundColor: func.backgroundHexColorCode,
                          color: func.foregroundHexColorCode,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
          </Box>
        </CardContent>
      </Card>
    );
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
      ) : (
        <>
          {currentAlarm && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Aktive Einsätze
              </Typography>
              {renderAlarmCard(currentAlarm)}
            </Box>
          )}

          {recentAlarms.length > 0 && (
            <Box sx={{ my: 4 }}>
              <Typography variant="h5" component="h2" gutterBottom>
                Recent Alarms
              </Typography>
              {recentAlarms.map(renderAlarmCard)}
            </Box>
          )}

          {!currentAlarm && !recentAlarms.length && (
            <Typography variant="body1" sx={{ mt: 4 }}>
              No alarms found.
            </Typography>
          )}
        </>
      )}
    </Container>
  );
};

export default BlaulichtSmsPage;
