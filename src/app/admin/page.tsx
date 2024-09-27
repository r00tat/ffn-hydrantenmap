'use client';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { setAuthorizedToBool, setEmptyFirecallGroup } from './adminActions';
import Box from '@mui/material/Box';

export default function AdminPage() {
  const [status, setStatus] = useState('');

  const updateAuthorized = useCallback(async () => {
    const fixedUsers = await setAuthorizedToBool();
    setStatus(
      `${fixedUsers.length} users corrected. (${fixedUsers
        .map((user) => user.email)
        .join(', ')})`
    );
  }, []);
  const setFirecallGroup = useCallback(async () => {
    const calls = await setEmptyFirecallGroup();
    setStatus(
      `${calls.length} calls corrected. (${calls
        .map((call) => call.name)
        .join(', ')})`
    );
  }, []);

  return (
    <Box margin={2}>
      <Typography variant="h3">Admin Actions</Typography>
      <Typography>{status}</Typography>
      <Typography>
        Set authorized from on to true{' '}
        <Button onClick={updateAuthorized} variant="contained">
          Fix users authorized
        </Button>
      </Typography>
      <Typography>
        Set ffnd as default group on firecalls{' '}
        <Button onClick={setFirecallGroup} variant="contained">
          Fix empty firecall group
        </Button>
      </Typography>
    </Box>
  );
}
