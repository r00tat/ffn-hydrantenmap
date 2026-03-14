'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useCallback, useState } from 'react';
import {
  cleanupOrphanedItems,
  copyUserAndGroupsToDev,
  findOrphanedItems,
  OrphanedItemsResult,
  setAuthorizedToBool,
  setCustomClaimsForAllUsers,
  setEmptyFirecallGroup,
} from '../../app/admin/adminActions';

export default function AdminActions() {
  const [status, setStatus] = useState('');
  const [orphanedResults, setOrphanedResults] = useState<
    OrphanedItemsResult[]
  >([]);

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

  const findOrphaned = useCallback(async () => {
    setStatus('Scanning all firecalls for orphaned items...');
    const results = await findOrphanedItems();
    setOrphanedResults(results);
    const total = results.reduce((sum, r) => sum + r.totalOrphaned, 0);
    if (total === 0) {
      setStatus('No orphaned items found.');
    } else {
      setStatus(
        `Found ${total} orphaned items across ${results.length} firecall(s).`
      );
    }
  }, []);

  const cleanupOrphaned = useCallback(
    async (firecallId: string, firecallName: string) => {
      setStatus(`Cleaning up orphaned items in "${firecallName}"...`);
      const fixed = await cleanupOrphanedItems(firecallId);
      setOrphanedResults((prev) =>
        prev.filter((r) => r.firecallId !== firecallId)
      );
      setStatus(`Marked ${fixed} orphaned items as deleted in "${firecallName}".`);
    },
    []
  );

  const copyToDev = useCallback(async () => {
    setStatus('Copying users and groups to dev...');
    const result = await copyUserAndGroupsToDev();
    setStatus(
      `Copied ${result.usersCount} users and ${result.groupsCount} groups from prod to dev (ffndev).`
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
        <Box>
          <Button onClick={copyToDev} variant="contained" color="warning">
            Copy users & groups to dev
          </Button>{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            Copy user and groups collections from prod to ffndev
          </Typography>
        </Box>
        <Box>
          <Button onClick={findOrphaned} variant="contained" color="secondary">
            Find orphaned items
          </Button>{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            Find items in deleted layers that were not marked as deleted
          </Typography>
        </Box>
        {orphanedResults.map((result) => (
          <Box
            key={result.firecallId}
            sx={{ ml: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Typography variant="subtitle2">
              {result.firecallName} ({result.totalOrphaned} orphaned items)
            </Typography>
            {result.deletedLayers.map((layer) => (
              <Typography key={layer.layerId} variant="body2" sx={{ ml: 1 }}>
                Layer &quot;{layer.layerName}&quot;: {layer.orphanedCount} items (
                {layer.orphanedItems
                  .slice(0, 5)
                  .map((i) => i.name)
                  .join(', ')}
                {layer.orphanedCount > 5 && ', ...'})
              </Typography>
            ))}
            <Button
              onClick={() =>
                cleanupOrphaned(result.firecallId, result.firecallName)
              }
              variant="outlined"
              color="warning"
              size="small"
              sx={{ mt: 1 }}
            >
              Mark as deleted
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
