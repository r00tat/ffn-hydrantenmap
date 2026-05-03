import {
  FirebaseCrashlytics,
  type CustomKeyAndValue,
  type StackFrame,
} from '@capacitor-firebase/crashlytics';

export type CrashlyticsContext = Record<string, string | number | boolean>;

interface NormalizedError {
  message: string;
  stacktrace?: StackFrame[];
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Error',
      stacktrace: parseStack(error.stack),
    };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: String(error) };
}

// V8/Chromium stack frame: "    at functionName (file:line:col)"
//                          "    at file:line:col"
// StackFrame im Plugin hat keine columnNumber — wird verworfen.
const FRAME_NAMED = /^\s*at\s+(.+?)\s+\((.+?):(\d+):\d+\)\s*$/;
const FRAME_ANON = /^\s*at\s+(.+?):(\d+):\d+\s*$/;

function parseFrame(line: string): StackFrame | null {
  const named = line.match(FRAME_NAMED);
  if (named) {
    return {
      functionName: named[1],
      fileName: named[2],
      lineNumber: Number(named[3]),
    };
  }
  const anon = line.match(FRAME_ANON);
  if (anon) {
    return {
      fileName: anon[1],
      lineNumber: Number(anon[2]),
    };
  }
  return null;
}

function parseStack(stack?: string): StackFrame[] | undefined {
  if (!stack) return undefined;
  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const frame = parseFrame(raw.trim());
    if (frame) frames.push(frame);
  }
  return frames.length > 0 ? frames : undefined;
}

function pickType(
  value: string | number | boolean,
): CustomKeyAndValue['type'] {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  return 'long';
}

async function applyContext(context: CrashlyticsContext): Promise<void> {
  for (const [key, value] of Object.entries(context)) {
    try {
      await FirebaseCrashlytics.setCustomKey({
        key,
        value,
        type: pickType(value),
      });
    } catch {
      // best-effort; do not let a bad key swallow the actual error
    }
  }
}

export async function recordError(
  error: unknown,
  context?: CrashlyticsContext,
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[crashlytics] recordError', error, context);
  }

  try {
    const normalized = normalize(error);

    if (context) {
      await applyContext(context);
    }

    await FirebaseCrashlytics.recordException({
      message: normalized.message,
      ...(normalized.stacktrace ? { stacktrace: normalized.stacktrace } : {}),
    });
  } catch {
    // never throw — reporting failures must not break the app
  }
}

export async function logCrashlyticsMessage(message: string): Promise<void> {
  try {
    await FirebaseCrashlytics.log({ message });
  } catch {
    // best-effort
  }
}

export async function setCrashlyticsUserId(
  userId: string | null,
): Promise<void> {
  try {
    await FirebaseCrashlytics.setUserId({ userId: userId ?? '' });
  } catch {
    // best-effort
  }
}
