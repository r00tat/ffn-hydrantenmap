import { User } from 'firebase/auth';
import { Group } from '../../app/groups/groupTypes';

export type LoginStep =
  | 'idle'
  | 'authenticating'
  | 'verifying'
  | 'loading_permissions'
  | 'done';

export interface LoginData {
  isSignedIn: boolean;
  isAuthorized: boolean;
  isAdmin: boolean;
  isAuthLoading: boolean;
  user?: User;
  email?: string;
  displayName?: string;
  uid?: string;
  photoURL?: string;
  messagingTokens?: string[];
  expiration?: string;
  idToken?: string;
  groups?: string[];
  isRefreshing?: boolean;
  myGroups: Group[];
  needsReLogin?: boolean;
  /** Einsatz-Gast: der einzige Einsatz, auf den dieser Benutzer Zugriff hat. */
  firecall?: string;
  /** Schreibrecht eines Einsatz-Gasts, siehe `guestCanWrite`. */
  firecallWrite?: boolean;
  loginStep: LoginStep;
}

export interface LoginStatus extends LoginData {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  credentialsRefreshed: boolean;
  clearCredentialsRefreshed: () => void;
}

export interface AuthState {
  authorized?: boolean;
  groups?: string[];
}
