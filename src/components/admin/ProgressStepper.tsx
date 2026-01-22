'use client';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

export interface ProgressStep {
  label: string;
  description?: string;
}

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface ProgressStepperProps {
  steps: ProgressStep[];
  activeStep: number;
  status: StepStatus;
  error?: string;
}

function StepIcon({
  stepIndex,
  activeStep,
  status,
}: {
  stepIndex: number;
  activeStep: number;
  status: StepStatus;
}) {
  // Completed steps (before active step)
  if (stepIndex < activeStep) {
    return <CheckCircleIcon sx={{ color: 'success.main' }} />;
  }

  // Active step
  if (stepIndex === activeStep) {
    if (status === 'completed') {
      return <CheckCircleIcon sx={{ color: 'success.main' }} />;
    }
    if (status === 'error') {
      return <ErrorIcon sx={{ color: 'error.main' }} />;
    }
    if (status === 'in_progress') {
      return <CircularProgress size={24} />;
    }
    // pending state for active step
    return <RadioButtonUncheckedIcon sx={{ color: 'primary.main' }} />;
  }

  // Future steps (after active step)
  return <RadioButtonUncheckedIcon sx={{ color: 'grey.400' }} />;
}

export default function ProgressStepper({
  steps,
  activeStep,
  status,
  error,
}: ProgressStepperProps) {
  return (
    <Stepper activeStep={activeStep} orientation="vertical">
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isError = isActive && status === 'error';

        return (
          <Step key={step.label} completed={index < activeStep}>
            <StepLabel
              error={isError}
              StepIconComponent={() => (
                <StepIcon
                  stepIndex={index}
                  activeStep={activeStep}
                  status={status}
                />
              )}
            >
              {step.label}
            </StepLabel>
            <StepContent>
              {step.description && (
                <Typography variant="body2" color="text.secondary">
                  {step.description}
                </Typography>
              )}
              {isError && error && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="error">
                    {error}
                  </Typography>
                </Box>
              )}
            </StepContent>
          </Step>
        );
      })}
    </Stepper>
  );
}
