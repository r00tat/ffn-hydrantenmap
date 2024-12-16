'use client';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import {
  setAuthorizedToBool,
  setCustomClaimsForAllUsers,
  setEmptyFirecallGroup,
} from './adminActions';
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

  const setCustomClaimsForAllUsersCb = useCallback(async () => {
    const users = await setCustomClaimsForAllUsers();
    setStatus(
      `${users.length} users corrected. (${users
        .map((user) => user.email)
        .join(', ')})`
    );
  }, []);

  return (
    <Box margin={2}>
      <Typography variant="h3">Admin Actions</Typography>
      <Typography>{status}</Typography>
      <Typography margin={2}>
        <Button onClick={updateAuthorized} variant="contained">
          Fix users authorized
        </Button>{' '}
        Set authorized from on to true
      </Typography>
      <Typography margin={2}>
        <Button onClick={setFirecallGroup} variant="contained">
          Fix empty firecall group
        </Button>{' '}
        Set ffnd as default group on firecalls
      </Typography>
      <Typography margin={2}>
        <Button onClick={setCustomClaimsForAllUsersCb} variant="contained">
          Set custom claims
        </Button>{' '}
        Set claims for users
      </Typography>
    </Box>
  );
}
