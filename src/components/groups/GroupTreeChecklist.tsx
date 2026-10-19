'use client';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import {
  impliedGroupIds,
  orderGroupsAsTree,
  withAncestorGroups,
  type HierarchyGroup,
} from '../../common/groupHierarchy';

export interface GroupTreeChecklistProps {
  groups: HierarchyGroup[];
  /** Die ausdrücklich gewählten Gruppen, ohne die abgeleiteten Elterngruppen. */
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Hinweis an Elterngruppen, die sich aus einer Untergruppe ergeben. */
  impliedLabel: string;
  'aria-label'?: string;
}

const INDENT = 24;

/**
 * Gruppenauswahl als Baum: Untergruppen eingerückt unter ihrer Elterngruppe.
 * Wer eine Untergruppe anhakt, hat damit alle Gruppen darüber — sie sind
 * angehakt und gesperrt, bis die Untergruppe wieder abgewählt ist.
 */
export default function GroupTreeChecklist({
  groups,
  selected,
  onChange,
  impliedLabel,
  'aria-label': ariaLabel,
}: GroupTreeChecklistProps) {
  const tree = useMemo(() => orderGroupsAsTree(groups), [groups]);
  const effective = useMemo(
    () => new Set(withAncestorGroups(selected, groups)),
    [selected, groups]
  );
  const implied = useMemo(
    () => impliedGroupIds(selected, groups),
    [selected, groups]
  );

  const toggle = (groupId: string, checked: boolean) =>
    onChange(
      checked
        ? [...selected, groupId]
        : selected.filter((id) => id !== groupId)
    );

  return (
    <Paper
      variant="outlined"
      role="group"
      aria-label={ariaLabel}
      sx={{ maxHeight: 320, overflowY: 'auto', py: 0.5 }}
    >
      {tree.map(({ group, depth }) => {
        const id = group.id ?? '';
        const locked = implied.has(id);
        return (
          <Box
            key={id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              pl: 1,
              position: 'relative',
              ml: `${depth * INDENT}px`,
              // Verbindungslinie zur Elterngruppe.
              ...(depth > 0 && {
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: -INDENT / 2,
                  top: 0,
                  height: '50%',
                  width: INDENT / 2 + 4,
                  borderLeft: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                },
              }),
            }}
          >
            <FormControlLabel
              sx={{ mr: 0, flexGrow: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={effective.has(id)}
                  disabled={locked}
                  onChange={(e) => toggle(id, e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: depth === 0 ? 600 : 400 }}
                  >
                    {group.name}
                  </Typography>
                  {locked && (
                    <Typography variant="caption" color="text.secondary">
                      {impliedLabel}
                    </Typography>
                  )}
                </Box>
              }
            />
          </Box>
        );
      })}
    </Paper>
  );
}
