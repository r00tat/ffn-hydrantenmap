import { NextRequest, NextResponse } from 'next/server';
import { ApiException } from '../errors';
import { authorizeTokenForGroup } from '../../../server/auth/authorizeTokenForGroup';
import {
  fetchBlaulichtSmsAlarms,
  fetchBlaulichtSmsAlarmById,
} from '../../../server/blaulichtsms/fetchAlarms';
import { createFirecallFromAlarm } from '../../../server/blaulichtsms/createFirecallFromAlarm';
import type { BlaulichtSmsAlarm } from '../../../common/blaulichtsms';

interface CreateEinsatzBody {
  group?: string;
  alarmId?: string;
  latest?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    let body: CreateEinsatzBody;
    try {
      body = (await req.json()) as CreateEinsatzBody;
    } catch {
      throw new ApiException('invalid JSON body', { status: 400 });
    }

    const { group, alarmId, latest } = body;
    if (!group) {
      throw new ApiException('field "group" is required', { status: 400 });
    }
    const hasAlarmId = typeof alarmId === 'string' && alarmId.length > 0;
    if (hasAlarmId === (latest === true)) {
      // both set or neither set
      throw new ApiException(
        'provide exactly one of "alarmId" or "latest": true',
        { status: 400 },
      );
    }

    const auth = await authorizeTokenForGroup(req, group);

    let alarm: BlaulichtSmsAlarm | null;
    if (hasAlarmId) {
      alarm = await fetchBlaulichtSmsAlarmById(group, alarmId as string);
      if (!alarm) {
        throw new ApiException(
          `alarm ${alarmId} not found for group ${group}`,
          { status: 404 },
        );
      }
    } else {
      const alarms = await fetchBlaulichtSmsAlarms(group);
      if (alarms.length === 0) {
        throw new ApiException(`no alarms available for group ${group}`, {
          status: 404,
        });
      }
      alarm = alarms[0]; // list is newest-first
    }

    const result = await createFirecallFromAlarm(alarm, group, auth.owner);

    return NextResponse.json({
      ...result,
      url: `${req.nextUrl.origin}/einsatz/${result.id}`,
    });
  } catch (err: any) {
    console.error(`POST /api/einsatz failed: ${err}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 },
    );
  }
}
