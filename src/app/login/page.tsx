'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import DynamicLogin from '../../components/pages/LoginUi';

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
