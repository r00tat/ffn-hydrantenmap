import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import { firebaseApp } from './admin';

let cachedProjectId: string | null = null;

/**
 * Resolve the GCP project ID from environment variables, Firebase config,
 * or the metadata server (on Cloud Run).
 */
export async function getGcpProjectId(): Promise<string> {
  if (cachedProjectId) return cachedProjectId;

  const fromEnv =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    firebaseApp.options.projectId;

  if (fromEnv) {
    cachedProjectId = fromEnv;
    return fromEnv;
  }

  // Fallback: resolve from ADC / metadata server (works on Cloud Run)
  const auth = new GoogleAuth();
  const project = await auth.getProjectId();
  if (!project) {
    throw new Error(
      'No GCP project ID found. Set GOOGLE_CLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
    );
  }
  cachedProjectId = project;
  return project;
}
