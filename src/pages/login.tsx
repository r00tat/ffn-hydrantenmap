import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import dynamic from 'next/dynamic';

const DynamicLogin = dynamic(
  () => {
    return import('../components/pages/LoginUi');
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
