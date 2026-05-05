import { PermissionType } from './AppPermissions';

export interface SettingsDialogRequest {
  type: PermissionType;
  message: string;
}

type Listener = (req: SettingsDialogRequest) => void;
const listeners = new Set<Listener>();

export function subscribeSettingsDialog(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function triggerSettingsDialog(req: SettingsDialogRequest): void {
  listeners.forEach((fn) => fn(req));
}
