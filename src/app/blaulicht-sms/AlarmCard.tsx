'use client';

import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Link from 'next/link';
import { BlaulichtSmsAlarm } from './actions';
import AlarmMap from './Map';

export interface AlarmCardProps {
  alarm: BlaulichtSmsAlarm;
  firecall?: { id: string; name: string };
  onCreateEinsatz?: (alarm: BlaulichtSmsAlarm) => void;
}

const AlarmCard = ({ alarm, firecall, onCreateEinsatz }: AlarmCardProps) => {
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);

  const attendees = alarm.recipients.filter((r) => r.participation === 'yes');
  const totalCount = attendees.length;

  const functionCounts = attendees
    .flatMap((r) => r.functions)
    .reduce(
      (acc, func) => {
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
      },
      {} as Record<string, { count: number; background: string; color: string }>
    );

  const filteredAttendees = selectedFunction
    ? attendees.filter((r) =>
        r.functions.some((f) => f.shortForm === selectedFunction)
      )
    : attendees;

  return (
    <Card key={alarm.alarmId} sx={{ mb: 2 }}>
      <CardHeader
        title={alarm.alarmText}
        subheader={`Alarmzeit: ${new Date(alarm.alarmDate).toLocaleString()}`}
      />
      <CardContent>
        {firecall && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInNewIcon />}
              component={Link}
              href={`/einsatz/${firecall.id}/details`}
            >
              Einsatz: {firecall.name}
            </Button>
          </Box>
        )}
        {!firecall && onCreateEinsatz && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onCreateEinsatz(alarm)}
            >
              Einsatz erstellen
            </Button>
          </Box>
        )}
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <Typography variant="h6" component="div">
            Funktionen
          </Typography>
          <Chip label={totalCount} size="small" />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(functionCounts).map(([func, data]) => (
            <Chip
              key={func}
              label={`${func}: ${data.count}`}
              onClick={() =>
                setSelectedFunction((prev) => (prev === func ? null : func))
              }
              sx={{
                backgroundColor: data.background,
                color: data.color,
                cursor: 'pointer',
                outline:
                  selectedFunction === func
                    ? '3px solid'
                    : '3px solid transparent',
                outlineColor:
                  selectedFunction === func ? 'primary.main' : 'transparent',
              }}
            />
          ))}
        </Box>

        <Typography variant="h6" component="div" sx={{ mt: 2 }}>
          Zusagen{' '}
          {selectedFunction && (
            <Chip
              label={`${selectedFunction}: ${filteredAttendees.length}`}
              size="small"
              onDelete={() => setSelectedFunction(null)}
            />
          )}
        </Typography>
        <Box>
          {filteredAttendees.map((recipient) => (
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
        {alarm.geolocation?.coordinates && (
          <AlarmMap
            lat={alarm.geolocation.coordinates.lat}
            lon={alarm.geolocation.coordinates.lon}
            alarmText={alarm.alarmText}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default AlarmCard;
