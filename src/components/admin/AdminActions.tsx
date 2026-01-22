'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useCallback, useState } from 'react';
import {
  setAuthorizedToBool,
  setCustomClaimsForAllUsers,
  setEmptyFirecallGroup,
} from '../../app/admin/adminActions';

export default function AdminActions() {
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
    <Box>
      <Typography variant="body1" sx={{ mb: 2 }}>
        {status}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Button onClick={updateAuthorized} variant="contained">
            Fix users authorized
          </Button>{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            Set authorized from on to true
          </Typography>
        </Box>
        <Box>
          <Button onClick={setFirecallGroup} variant="contained">
            Fix empty firecall group
          </Button>{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            Set ffnd as default group on firecalls
          </Typography>
        </Box>
        <Box>
          <Button onClick={setCustomClaimsForAllUsersCb} variant="contained">
            Set custom claims
          </Button>{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            Set claims for users
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
