import 'server-only';

import { z } from 'zod';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import {
  BUG_REPORT_COMMENT_VISIBILITIES,
  BUG_REPORT_STATUSES,
  type BugReport,
  type BugReportUpdateInput,
} from '../../common/bugReport';
import {
  isBugReportStoragePath,
  toReporterView,
} from '../../common/bugReportReporterView';
import { MCP_SOURCE } from '../../common/mcp/provenance';
import {
  addBugReportComment,
  getBugReport,
  listBugReportComments,
  listBugReports,
  readStorageImage,
  updateBugReport,
  type BugReportActor,
  type BugReportWriteOrigin,
} from '../bugReport/bugReportService';
import { errorResult, jsonResult } from './toolResult';
import type { McpUser } from './userAccess';

/**
 * Bug-Report-Tools (Scopes `bugreport:read` und `bugreport:write`).
 *
 * **Der Scope schneidet ein, das Adminflag entscheidet den Umfang.** Mit
 * `bugreport:read` sieht ein Admin alle Reports samt Logs, Kontext, internen
 * Feldern und dem ganzen Verlauf; jeder andere nur seine eigenen, und davon
 * nur die Projektion für den Melder (`toReporterView`) — dieselbe wie auf
 * „Meine Meldungen“.
 *
 * Die schreibenden Tools registriert der Server **nur für Admins** und prüft
 * das beim Aufruf noch einmal. Sie hängen bewusst nicht an
 * `MCP_WRITE_ENABLED`: Der Schalter ist der Notaus für Schreibzugriffe auf
 * Einsatzdaten. Bug-Reports sind keine Einsatzdaten, nur
 * Admins können sie ändern, und gerade die produktiven Reports sollen über
 * MCP bearbeitet werden (siehe docs/mcp-server.md).
 */

/** Ein Screenshot darf höchstens so groß sein, um als Bild zurückzugehen. */
export const MAX_SCREENSHOT_BYTES = 1_500_000;
/** Und höchstens so viele je Aufruf — sonst sprengt Base64 den Kontext. */
export const MAX_SCREENSHOTS = 4;

const reportId = z
  .string()
  .min(1)
  .regex(/^[^/]+$/, 'ID ohne Schrägstrich')
  .describe('ID des Bug-Reports, wie sie list_bug_reports liefert');

const NOT_FOUND = 'Bug-Report nicht gefunden.';
const ADMIN_ONLY = 'Nur Administratoren dürfen Bug-Reports bearbeiten.';

function isOwnReport(user: McpUser, report: BugReport): boolean {
  return !!user.uid && report.createdBy?.uid === user.uid;
}

/** Kurzform eines Reports für die Liste eines Admins. */
function adminSummary(report: BugReport) {
  return {
    id: report.id,
    kind: report.kind,
    title: report.title,
    status: report.status,
    createdAt: report.createdAt,
    createdBy: report.createdBy,
    updatedAt: report.updatedAt,
    database: report.context?.database || 'prod',
    resolution: report.resolution,
    githubIssue: report.githubIssue,
    assignee: report.assignee,
    screenshotCount: report.screenshots?.length ?? 0,
  };
}

export interface ListBugReportsArgs {
  status?: (typeof BUG_REPORT_STATUSES)[number];
  kind?: 'bug' | 'feature';
  limit?: number;
  onlyMine?: boolean;
}

export async function listBugReportsForUser(
  user: McpUser,
  { status, kind, limit, onlyMine }: ListBugReportsArgs,
): Promise<CallToolResult> {
  const mineOnly = !user.isAdmin || !!onlyMine;
  const reports = await listBugReports({
    status,
    kind,
    limit: limit ?? 25,
    ...(mineOnly ? { createdByUid: user.uid } : {}),
  });
  if (!user.isAdmin) {
    return jsonResult(
      reports.map((report) => {
        const view = toReporterView(report, []);
        return {
          id: view.id,
          kind: view.kind,
          title: view.title,
          status: view.status,
          createdAt: view.createdAt,
          updatedAt: view.updatedAt,
          resolution: view.resolution,
        };
      }),
    );
  }
  return jsonResult(reports.map(adminSummary));
}

/** Screenshots als Bild-Inhalt, damit das Modell sie ansehen kann. */
async function screenshotContent(
  report: BugReport,
): Promise<CallToolResult['content']> {
  const paths = (report.screenshots ?? []).filter((path) =>
    isBugReportStoragePath(report.id, path),
  );
  const content: CallToolResult['content'] = [];
  const notes: string[] = [];
  for (const [index, path] of paths.entries()) {
    if (index >= MAX_SCREENSHOTS) {
      notes.push(
        `${paths.length - MAX_SCREENSHOTS} weitere Screenshots ausgelassen (höchstens ${MAX_SCREENSHOTS} je Aufruf).`,
      );
      break;
    }
    try {
      const image = await readStorageImage(path, MAX_SCREENSHOT_BYTES);
      if (image.ok) {
        content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
      } else {
        notes.push(`Screenshot ${index + 1} ausgelassen: ${image.reason}`);
      }
    } catch (err) {
      notes.push(
        `Screenshot ${index + 1} nicht lesbar: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (notes.length > 0) {
    content.push({ type: 'text', text: notes.join('\n') });
  }
  return content;
}

export interface GetBugReportArgs {
  id: string;
  includeScreenshots?: boolean;
}

export async function getBugReportForUser(
  user: McpUser,
  { id, includeScreenshots }: GetBugReportArgs,
): Promise<CallToolResult> {
  const report = await getBugReport(id);
  // Ein fremder Report ist für Nicht-Admins dasselbe wie ein fehlender.
  if (!report || (!user.isAdmin && !isOwnReport(user, report))) {
    return errorResult(NOT_FOUND);
  }
  const comments = await listBugReportComments(id);
  const data = user.isAdmin
    ? { report, comments }
    : { report: toReporterView(report, comments) };
  const result = jsonResult(data);
  if (includeScreenshots) {
    result.content.push(...(await screenshotContent(report)));
  }
  return result;
}

export interface BugReportWriteContext {
  user: McpUser;
  clientId: string;
  clientName?: string;
}

function actorOf(user: McpUser): BugReportActor {
  return {
    uid: user.uid,
    email: user.email ?? '',
    ...(user.displayName ? { displayName: user.displayName } : {}),
  };
}

function originOf({
  clientId,
  clientName,
}: BugReportWriteContext): BugReportWriteOrigin {
  return {
    source: MCP_SOURCE,
    ...(clientId ? { clientId } : {}),
    ...(clientName ? { clientName } : {}),
  };
}

export interface UpdateBugReportArgs extends BugReportUpdateInput {
  id: string;
  notifyReporter?: boolean;
}

export async function updateBugReportViaMcp(
  ctx: BugReportWriteContext,
  { id, notifyReporter, ...patch }: UpdateBugReportArgs,
): Promise<CallToolResult> {
  if (!ctx.user.isAdmin) return errorResult(ADMIN_ONLY);
  const report = await getBugReport(id);
  if (!report) return errorResult(NOT_FOUND);
  try {
    const result = await updateBugReport(id, patch, actorOf(ctx.user), {
      origin: originOf(ctx),
      notifyReporter: !!notifyReporter,
    });
    return jsonResult({
      message:
        result.changes.length > 0
          ? 'Bug-Report aktualisiert.'
          : 'Keine Änderung — alle Werte waren schon so gespeichert.',
      changes: result.changes,
      notification: result.notification,
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

export interface AddBugReportCommentArgs {
  id: string;
  text: string;
  visibility?: (typeof BUG_REPORT_COMMENT_VISIBILITIES)[number];
  notifyReporter?: boolean;
}

export async function addBugReportCommentViaMcp(
  ctx: BugReportWriteContext,
  { id, text, visibility, notifyReporter }: AddBugReportCommentArgs,
): Promise<CallToolResult> {
  if (!ctx.user.isAdmin) return errorResult(ADMIN_ONLY);
  const report = await getBugReport(id);
  if (!report) return errorResult(NOT_FOUND);
  try {
    const result = await addBugReportComment(id, text, actorOf(ctx.user), {
      visibility: visibility ?? 'internal',
      origin: originOf(ctx),
      notifyReporter: !!notifyReporter,
    });
    return jsonResult({
      message: 'Kommentar gespeichert.',
      commentId: result.commentId,
      visibility: visibility ?? 'internal',
      notification: result.notification,
    });
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

const statusSchema = z
  .enum(BUG_REPORT_STATUSES)
  .describe(
    'open = offen, in_progress = in Bearbeitung, closed = erledigt, wontfix = wird nicht umgesetzt',
  );

export function registerBugReportReadTools(
  server: McpServer,
  user: McpUser,
): void {
  server.registerTool(
    'list_bug_reports',
    {
      title: 'Bug-Reports auflisten',
      description:
        'Listet Bug-Reports und Feature-Wünsche aus der Einsatzkarte, neueste zuerst. ' +
        'Administratoren sehen alle Reports, alle anderen nur ihre eigenen. ' +
        'Details samt Verlauf liefert get_bug_report.',
      inputSchema: z.object({
        status: statusSchema.optional(),
        kind: z.enum(['bug', 'feature']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        onlyMine: z
          .boolean()
          .optional()
          .describe('Nur selbst gemeldete Reports (für Nicht-Admins immer so)'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => listBugReportsForUser(user, args),
  );

  server.registerTool(
    'get_bug_report',
    {
      title: 'Bug-Report abrufen',
      description:
        'Ein Bug-Report mit Verlauf und Kommentaren. Administratoren bekommen alles ' +
        'samt Logs, Kontext und internen Feldern; alle anderen nur den eigenen Report ' +
        'mit Status, Lösung und den für sie bestimmten Kommentaren. Mit ' +
        `includeScreenshots kommen bis zu ${MAX_SCREENSHOTS} Screenshots als Bilder mit.`,
      inputSchema: z.object({
        id: reportId,
        includeScreenshots: z
          .boolean()
          .optional()
          .describe('Screenshots als Bilder mitliefern'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => getBugReportForUser(user, args),
  );
}

export function registerBugReportWriteTools(
  server: McpServer,
  ctx: BugReportWriteContext,
): void {
  // Nicht-Admins sehen die Tools gar nicht erst; der Aufruf prüft es erneut.
  if (!ctx.user.isAdmin) return;

  const notifyReporter = z
    .boolean()
    .optional()
    .describe(
      'Dem Melder eine kurze Mail mit Link auf „Meine Meldungen“ schicken — nur bei ' +
        'Abschluss (closed/wontfix), neuer Lösung oder einem Kommentar für den Melder',
    );

  server.registerTool(
    'update_bug_report',
    {
      title: 'Bug-Report bearbeiten',
      description:
        'Ändert Status, Lösung, GitHub-Issue, Zuständigkeit oder interne Notiz eines ' +
        'Bug-Reports. Nur angegebene Felder werden geändert, ein leerer Text löscht ' +
        'das Feld. Status und Lösung sieht der Melder unter „Meine Meldungen“; die ' +
        'übrigen Felder bleiben intern. Jede Änderung landet im Verlauf, gekennzeichnet ' +
        'als über MCP geschrieben.',
      inputSchema: z.object({
        id: reportId,
        status: statusSchema.optional(),
        resolution: z
          .string()
          .optional()
          .describe(
            'Lösung bzw. Rückmeldung an den Melder, in seiner Sprache (meist Deutsch)',
          ),
        githubIssue: z
          .string()
          .optional()
          .describe('Issue-Nummer (#704) oder URL'),
        assignee: z.string().optional().describe('Wer sich kümmert (intern)'),
        internalNote: z.string().optional().describe('Interne Notiz'),
        notifyReporter,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => updateBugReportViaMcp(ctx, args),
  );

  server.registerTool(
    'add_bug_report_comment',
    {
      title: 'Kommentar zu Bug-Report',
      description:
        'Schreibt einen Kommentar in den Verlauf eines Bug-Reports. visibility ' +
        '"internal" (Standard) sieht nur der Admin-Bereich, "reporter" zusätzlich der ' +
        'Melder unter „Meine Meldungen“.',
      inputSchema: z.object({
        id: reportId,
        text: z.string().min(1),
        visibility: z.enum(BUG_REPORT_COMMENT_VISIBILITIES).optional(),
        notifyReporter,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => addBugReportCommentViaMcp(ctx, args),
  );
}
