'use server';
import 'server-only';

import { google, gmail_v1 } from 'googleapis';
import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import { extractEinsaetzeFromHtml, Einsatz } from '../../server/ai/vertexai';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  FirecallLocation,
} from '../firebase/firestore';
import { geocodeAddress } from './geocode';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

export interface EmailImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse an address string into street, number, and city components.
 * Expected formats:
 * - "Hauptstraße 12, 7100 Neusiedl am See"
 * - "Seestraße 5"
 * - "Bahnhof, 7100 Neusiedl am See"
 */
function parseAdresse(adresse: string): {
  strasse: string;
  nummer: string;
  ort: string;
} {
  // Default values
  let strasse = '';
  let nummer = '';
  let ort = '';

  if (!adresse) {
    return { strasse, nummer, ort };
  }

  // Look for PLZ (4-digit Austrian postal code) to split location
  const plzMatch = adresse.match(/,?\s*(\d{4})\s+(.+)$/);
  let addressPart = adresse;

  if (plzMatch) {
    ort = plzMatch[2].trim();
    // Remove the PLZ and city from the address part
    addressPart = adresse.substring(0, plzMatch.index).trim();
    // Remove trailing comma if present
    addressPart = addressPart.replace(/,\s*$/, '');
  }

  // Now parse street and number from the address part
  // Match patterns like "Hauptstraße 12" or "Hauptstraße 12a"
  const streetNumberMatch = addressPart.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/);

  if (streetNumberMatch) {
    strasse = streetNumberMatch[1].trim();
    nummer = streetNumberMatch[2].trim();
  } else {
    // No number found, treat whole part as street name
    strasse = addressPart.trim();
  }

  return { strasse, nummer, ort };
}

/**
 * Extract time portion from a datetime string.
 * Expected format: "01.02.2026 14:30" -> "14:30"
 */
function extractTime(zeitpunkt: string): string {
  if (!zeitpunkt) {
    return '';
  }

  // Match time in HH:MM format
  const timeMatch = zeitpunkt.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    return timeMatch[1];
  }

  return '';
}

/**
 * Map an Einsatz object to a partial FirecallLocation
 */
function mapEinsatzToLocation(einsatz: Einsatz): Partial<FirecallLocation> {
  const { strasse, nummer, ort } = parseAdresse(einsatz.einsatzzielAdresse);

  // Build description with caller info and priority
  const descriptionParts: string[] = [];
  if (einsatz.meldender) {
    let meldenderInfo = `Meldender: ${einsatz.meldender}`;
    if (einsatz.meldenderTelefon) {
      meldenderInfo += ` (${einsatz.meldenderTelefon})`;
    }
    descriptionParts.push(meldenderInfo);
  }
  if (einsatz.einsatzstichwort || einsatz.prioritaet) {
    const stichwortPrio = [einsatz.einsatzstichwort, `Prio: ${einsatz.prioritaet}`]
      .filter(Boolean)
      .join(' | ');
    descriptionParts.push(stichwortPrio);
  }

  return {
    name: einsatz.sachverhalt,
    street: strasse,
    number: nummer,
    city: ort || 'Neusiedl am See',
    description: descriptionParts.join('\n'),
    alarmTime: extractTime(einsatz.zeitpunkt),
    auftragsNummer: einsatz.auftragsNummer,
    status: 'offen',
    vehicles: '',
    info: '',
    created: new Date().toISOString(),
    creator: 'email-import',
  };
}

/**
 * Get HTML body from a Gmail message
 */
function getHtmlBodyFromMessage(message: gmail_v1.Schema$Message): string | null {
  const payload = message.payload;
  if (!payload) {
    return null;
  }

  // Helper to decode base64url content
  const decodeBody = (data: string | null | undefined): string => {
    if (!data) return '';
    // Gmail uses base64url encoding
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  };

  // Check if payload itself has the body
  if (payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      return decodeBody(payload.body.data);
    }
  }

  // Check parts for multipart messages
  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBody(part.body.data);
    }
    // Handle nested multipart
    if (part.parts) {
      for (const nestedPart of part.parts) {
        if (nestedPart.mimeType === 'text/html' && nestedPart.body?.data) {
          return decodeBody(nestedPart.body.data);
        }
      }
    }
  }

  // Fallback: try to get plain text if no HTML
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBody(part.body.data);
    }
  }

  // Last resort: check if the body is directly in the payload
  if (payload.body?.data) {
    return decodeBody(payload.body.data);
  }

  return null;
}

/**
 * Process starred emails with einsatz-unwetter label and import them as FirecallLocations
 */
export async function processUnwetterEmails(
  firecallId: string
): Promise<EmailImportResult> {
  const result: EmailImportResult = {
    added: 0,
    skipped: 0,
    errors: [],
  };

  // Validate required environment variables
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    return {
      ...result,
      errors: ['GOOGLE_SERVICE_ACCOUNT environment variable is not set'],
    };
  }

  if (!process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    return {
      ...result,
      errors: ['EINSATZMAPPE_IMPERSONATION_ACCOUNT environment variable is not set'],
    };
  }

  // Check authorization
  try {
    await actionUserAuthorizedForFirecall(firecallId);
  } catch (error: any) {
    return {
      ...result,
      errors: [`Authorization failed: ${error.message}`],
    };
  }

  // Initialize Gmail API
  const auth = createWorkspaceAuth(GMAIL_SCOPES);
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    // Search for starred emails with the einsatz-unwetter label
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'label:einsatz-unwetter is:starred',
    });

    const messages = listResponse.data.messages || [];

    if (messages.length === 0) {
      return result;
    }

    // Collect all extracted Einsätze
    const allEinsaetze: { einsatz: Einsatz; messageId: string }[] = [];

    // Process each message
    for (const messageRef of messages) {
      if (!messageRef.id) continue;

      try {
        // Get full message content
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: messageRef.id,
          format: 'full',
        });

        const htmlBody = getHtmlBodyFromMessage(messageResponse.data);

        if (!htmlBody) {
          result.errors.push(`Message ${messageRef.id}: No HTML body found`);
          continue;
        }

        // Extract Einsatz data using Gemini
        const einsaetze = await extractEinsaetzeFromHtml(htmlBody);

        for (const einsatz of einsaetze) {
          allEinsaetze.push({ einsatz, messageId: messageRef.id });
        }
      } catch (error: any) {
        result.errors.push(`Message ${messageRef.id}: ${error.message}`);
      }
    }

    // Query existing auftragsNummer values for deduplication
    const existingLocationsSnapshot = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(FIRECALL_LOCATIONS_COLLECTION_ID)
      .where('auftragsNummer', '!=', '')
      .get();

    const existingAuftragsNummern = new Set<string>();
    existingLocationsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.auftragsNummer) {
        existingAuftragsNummern.add(data.auftragsNummer);
      }
    });

    // Filter out duplicates and prepare locations to add
    const locationsToAdd: Partial<FirecallLocation>[] = [];
    const processedMessageIds = new Set<string>();

    for (const { einsatz, messageId } of allEinsaetze) {
      if (
        einsatz.auftragsNummer &&
        existingAuftragsNummern.has(einsatz.auftragsNummer)
      ) {
        result.skipped++;
        // Still mark message as processed even if skipped
        processedMessageIds.add(messageId);
        continue;
      }

      const location = mapEinsatzToLocation(einsatz);
      locationsToAdd.push(location);

      // Track this auftragsNummer to avoid duplicates within the same import
      if (einsatz.auftragsNummer) {
        existingAuftragsNummern.add(einsatz.auftragsNummer);
      }
      processedMessageIds.add(messageId);
    }

    // Geocode locations that have addresses
    for (const location of locationsToAdd) {
      if (location.street && location.city) {
        try {
          const coords = await geocodeAddress(
            location.street,
            location.number || '',
            location.city
          );
          if (coords) {
            location.lat = coords.lat;
            location.lng = coords.lng;
          }
        } catch (error) {
          console.error('Geocoding failed for location:', location.street, error);
        }
      }
    }

    // Write locations to Firestore using batch writes
    if (locationsToAdd.length > 0) {
      const batch = firestore.batch();
      const locationCollectionRef = firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(firecallId)
        .collection(FIRECALL_LOCATIONS_COLLECTION_ID);

      for (const location of locationsToAdd) {
        const newDocRef = locationCollectionRef.doc();
        batch.set(newDocRef, {
          ...location,
          id: newDocRef.id,
        });
      }

      await batch.commit();
      result.added = locationsToAdd.length;
    }

    // Unstar processed emails
    for (const messageId of processedMessageIds) {
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            removeLabelIds: ['STARRED'],
          },
        });
      } catch (error: any) {
        result.errors.push(`Failed to unstar message ${messageId}: ${error.message}`);
      }
    }

    return result;
  } catch (error: any) {
    console.error('Error processing unwetter emails:', error);
    return {
      ...result,
      errors: [`Gmail API error: ${error.message}`],
    };
  }
}
