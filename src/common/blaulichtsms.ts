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
