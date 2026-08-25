import { parseScopes } from '../../common/mcp/scopes';
import {
  isAllowedRedirectUri,
  type OAuthApplicationType,
} from './redirectUri';

/**
 * Prüfung der Client-Metadaten nach RFC 7591 Abschnitt 2.
 *
 * Dieselbe Prüfung gilt für beide Registrierungswege: für den Body von
 * `/api/oauth/register` (DCR) und für ein abgerufenes Client ID Metadata
 * Document (CIMD). Was der Client dort behauptet, ist in beiden Fällen
 * unbesehene Eingabe.
 */

export interface ClientMetadataInput {
  client_name?: unknown;
  redirect_uris?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  application_type?: unknown;
  scope?: unknown;
  client_uri?: unknown;
  logo_uri?: unknown;
  policy_uri?: unknown;
  tos_uri?: unknown;
  software_id?: unknown;
  software_version?: unknown;
}

export interface NormalizedClientMetadata {
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  application_type: OAuthApplicationType;
  scope?: string;
  client_uri?: string;
  logo_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
  software_id?: string;
  software_version?: string;
}

export class ClientMetadataError extends Error {
  readonly code:
    | 'invalid_redirect_uri'
    | 'invalid_client_metadata'
    | 'invalid_software_statement';

  constructor(
    code: ClientMetadataError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

/** Nur diese Grant Types werden ausgestellt. */
export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];
export const SUPPORTED_RESPONSE_TYPES = ['code'];

const MAX_REDIRECT_URIS = 10;
const MAX_STRING_LENGTH = 512;

function asString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} must be a string`,
    );
  }
  if (value.length > MAX_STRING_LENGTH) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} is too long`,
    );
  }
  return value;
}

function asHttpsUrl(value: unknown, field: string): string | undefined {
  const str = asString(value, field);
  if (!str) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(str);
  } catch {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} must be an absolute URL`,
    );
  }
  if (url.protocol !== 'https:') {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} must use https`,
    );
  }
  return str;
}

export function normalizeClientMetadata(
  input: ClientMetadataInput,
): NormalizedClientMetadata {
  const applicationTypeRaw = asString(
    input.application_type,
    'application_type',
  );
  if (
    applicationTypeRaw !== undefined &&
    applicationTypeRaw !== 'web' &&
    applicationTypeRaw !== 'native'
  ) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      'application_type must be "web" or "native"',
    );
  }
  const application_type: OAuthApplicationType = applicationTypeRaw ?? 'web';

  if (!Array.isArray(input.redirect_uris) || input.redirect_uris.length === 0) {
    throw new ClientMetadataError(
      'invalid_redirect_uri',
      'redirect_uris must be a non-empty array',
    );
  }
  if (input.redirect_uris.length > MAX_REDIRECT_URIS) {
    throw new ClientMetadataError(
      'invalid_redirect_uri',
      `at most ${MAX_REDIRECT_URIS} redirect_uris are allowed`,
    );
  }
  const redirect_uris = input.redirect_uris.map((uri, index) => {
    if (typeof uri !== 'string') {
      throw new ClientMetadataError(
        'invalid_redirect_uri',
        `redirect_uris[${index}] must be a string`,
      );
    }
    if (!isAllowedRedirectUri(uri, application_type)) {
      throw new ClientMetadataError(
        'invalid_redirect_uri',
        `redirect_uris[${index}] is not an allowed redirect target`,
      );
    }
    return uri;
  });

  const grant_types = normalizeList(
    input.grant_types,
    'grant_types',
    SUPPORTED_GRANT_TYPES,
    ['authorization_code', 'refresh_token'],
  );
  if (!grant_types.includes('authorization_code')) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      'grant_types must include authorization_code',
    );
  }

  const response_types = normalizeList(
    input.response_types,
    'response_types',
    SUPPORTED_RESPONSE_TYPES,
    ['code'],
  );

  const authMethod = asString(
    input.token_endpoint_auth_method,
    'token_endpoint_auth_method',
  );
  if (
    authMethod !== undefined &&
    authMethod !== 'none' &&
    authMethod !== 'client_secret_post' &&
    authMethod !== 'client_secret_basic'
  ) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      'unsupported token_endpoint_auth_method',
    );
  }

  // Ohne Angabe gilt `none`: Ein Client, der über einen Browser umleitet,
  // kann kein Geheimnis wahren. RFC 7591 sähe `client_secret_basic` als
  // Vorgabe vor — die passt hier zu keinem der erwarteten Clients und
  // verleitete nur dazu, einem Public Client ein Secret auszustellen.
  const token_endpoint_auth_method = (authMethod ?? 'none') as
    | 'none'
    | 'client_secret_post'
    | 'client_secret_basic';

  const scopeRaw = asString(input.scope, 'scope');
  const scope = scopeRaw ? parseScopes(scopeRaw).join(' ') : undefined;

  return {
    client_name: asString(input.client_name, 'client_name'),
    redirect_uris,
    grant_types,
    response_types,
    token_endpoint_auth_method,
    application_type,
    scope: scope || undefined,
    client_uri: asHttpsUrl(input.client_uri, 'client_uri'),
    logo_uri: asHttpsUrl(input.logo_uri, 'logo_uri'),
    policy_uri: asHttpsUrl(input.policy_uri, 'policy_uri'),
    tos_uri: asHttpsUrl(input.tos_uri, 'tos_uri'),
    software_id: asString(input.software_id, 'software_id'),
    software_version: asString(input.software_version, 'software_version'),
  };
}

function normalizeList(
  value: unknown,
  field: string,
  supported: string[],
  fallback: string[],
): string[] {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!Array.isArray(value)) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} must be an array`,
    );
  }
  const unsupported = value.filter(
    (entry) => typeof entry !== 'string' || !supported.includes(entry),
  );
  if (unsupported.length > 0) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `${field} contains unsupported values: ${unsupported.join(', ')}`,
    );
  }
  return value as string[];
}
