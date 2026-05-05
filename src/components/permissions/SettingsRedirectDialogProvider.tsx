'use client';

import React, { useEffect, useState } from 'react';
import {
  PermissionType,
  subscribeSettingsDialog,
} from '../../lib/permissions';
import SettingsRedirectDialog from './SettingsRedirectDialog';

interface State {
  open: boolean;
  type: PermissionType | null;
  message: string;
}

export default function SettingsRedirectDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>({
    open: false,
    type: null,
    message: '',
  });

  useEffect(() => {
    return subscribeSettingsDialog(({ type, message }) => {
      setState({ open: true, type, message });
    });
  }, []);

  return (
    <>
      {children}
      <SettingsRedirectDialog
        open={state.open}
        type={state.type}
        message={state.message}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </>
  );
}
