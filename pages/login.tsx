import { Box, Typography } from '@mui/material';
import * as firebaseui from 'firebaseui';
import { auth } from '../components/firebase/app';
import React, { useEffect, useState } from 'react';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import dynamic from 'next/dynamic';

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
