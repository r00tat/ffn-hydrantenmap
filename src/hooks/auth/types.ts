import { User } from 'firebase/auth';
import { Group } from '../../app/groups/groupTypes';

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
  firecall?: string;
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
