'use server';
import { actionUserRequired } from '../auth';

export interface BlaulichtSmsAlarm {
  productType: string;
  customerId: string;
  customerName: string;
  alarmId: string;
  scenarioId: string | null;
  indexNumber: number;
  alarmGroups: {
    groupId: string;
    groupName: string;
  }[];
  alarmDate: string;
  endDate: string;
  authorName: string;
  alarmText: string;
  audioUrl: string | null;
  needsAcknowledgement: boolean;
  usersAlertedCount: number;
  geolocation: {
    coordinates: { lat: number; lon: number };
    positionSetByAuthor: boolean;
    radius: number | null;
    distance: number | null;
    duration: number | null;
    address: string | null;
  } | null;
  coordinates: { lat: number; lon: number } | null;
  recipients: {
    id: string;
    name: string;
    msisdn: string;
    comment: string;
    participation: 'yes' | 'no' | 'unknown' | 'pending';
    participationMessage: string | null;
    functions: {
      functionId: string;
      name: string;
      order: number;
      shortForm: string;
      backgroundHexColorCode: string;
      foregroundHexColorCode: string;
    }[];
  }[];
}

export async function getBlaulichtSmsAlarms(): Promise<BlaulichtSmsAlarm[]> {
  const session = await actionUserRequired();
  const requiredGroup = process.env.BLAULICHTSMS_REQUIRED_GROUP || 'ffnd';

  if (!session.user.groups.includes(requiredGroup)) {
    return [];
  }
  const username = process.env.BLAULICHTSMS_USERNAME;
  const password = process.env.BLAULICHTSMS_PASSWORD;
  const customerId = process.env.BLAULICHTSMS_CUSTOMER_ID;

  if (!username || !password || !customerId) {
    console.error(
      'BlaulichtSMS credentials (BLAULICHTSMS_USERNAME, BLAULICHTSMS_PASSWORD, BLAULICHTSMS_CUSTOMER_ID) are not set in environment variables.'
    );
    return [];
  }

  // Step 1: Login to get sessionId
  const loginResponse = await fetch(
    'https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        customerId,
      }),
    }
  );

  if (!loginResponse.ok) {
    console.error(
      'BlaulichtSMS dashboard login failed',
      loginResponse.status,
      loginResponse.statusText
    );
    const errorBody = await loginResponse.text();
    console.error('Error body:', errorBody);
    return [];
  }

  const loginData: { sessionId: string } = await loginResponse.json();
  const sessionId = loginData.sessionId;

  // Step 2: Fetch dashboard data using sessionId
  const dashboardResponse = await fetch(
    `https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/${sessionId}`
  );

  if (!dashboardResponse.ok) {
    console.error(
      'Failed to fetch BlaulichtSMS dashboard data',
      dashboardResponse.status,
      dashboardResponse.statusText
    );
    const errorBody = await dashboardResponse.text();
    console.error('Error body:', errorBody);
    return [];
  }

  const dashboardData: BlaulichtSmsAlarm[] = (await dashboardResponse.json())
    .alarms;

  // console.info(`active alarms: ${JSON.stringify(dashboardData)}`);

  return dashboardData;
}
