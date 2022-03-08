import { Box, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import React from 'react';

const DynamicLogin = dynamic(
  () => {
    return import('../components/LoginUi');
  },
  { ssr: false }
);

export default function Login() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h3" gutterBottom>
        Login
      </Typography>
      <DynamicLogin />
    </Box>
  );
}
