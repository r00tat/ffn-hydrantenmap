'use client';

import BluetoothIcon from '@mui/icons-material/Bluetooth';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import MobileStepper from '@mui/material/MobileStepper';
import Typography from '@mui/material/Typography';
import React, { useState } from 'react';
import { PermissionType } from '../../lib/permissions';
import PermissionStep, { StepResult } from './PermissionStep';

interface StepDef {
  type: PermissionType;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: StepDef[] = [
  {
    type: 'location',
    icon: <LocationOnIcon fontSize="inherit" />,
    title: 'Standort',
    description:
      'Damit dein Standort auf der Einsatzkarte angezeigt wird und GPS-Tracks aufgezeichnet werden können, benötigt die App Zugriff auf deinen Standort.',
  },
  {
    type: 'bluetooth',
    icon: <BluetoothIcon fontSize="inherit" />,
    title: 'Bluetooth',
    description:
      'Für die Verbindung zu Radiacode-Strahlungsmessgeräten benötigt die App Zugriff auf Bluetooth. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen.',
  },
  {
    type: 'notifications',
    icon: <NotificationsIcon fontSize="inherit" />,
    title: 'Mitteilungen',
    description:
      'Während die Radiacode-Aufzeichnung im Hintergrund läuft, zeigt die App eine Benachrichtigung an. Dafür benötigt sie die Erlaubnis, Mitteilungen anzuzeigen. Wenn du keine Radiacode-Geräte verwendest, kannst du diesen Schritt überspringen.',
  },
];

interface Props {
  onComplete: () => void;
}

export default function PermissionOnboardingWizard({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleResult = (_: StepResult) => {
    if (currentStep + 1 >= STEPS.length) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const step = STEPS[currentStep];

  return (
    <Dialog open fullScreen>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
          Berechtigungen einrichten
        </Typography>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PermissionStep
            type={step.type}
            icon={step.icon}
            title={step.title}
            description={step.description}
            onResult={handleResult}
          />
        </div>
        <MobileStepper
          variant="dots"
          steps={STEPS.length}
          position="static"
          activeStep={currentStep}
          backButton={null}
          nextButton={null}
          sx={{ justifyContent: 'center' }}
        />
      </DialogContent>
    </Dialog>
  );
}
