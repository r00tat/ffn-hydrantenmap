#!/usr/bin/env node
/**
 * Renders an OpenTofu plan as a short Markdown overview for the PR comment and
 * the job summary of .github/workflows/terraform.yml: a status icon, the number
 * of changes per action, and the affected resources as a diff list. The full
 * plan text follows collapsed.
 *
 * The overview is built from `tofu show -json`, not from the text output — the
 * text has no stable format to count from. The JSON contains sensitive values
 * in clear text; only addresses and actions are taken from it, nothing else
 * reaches the output.
 *
 * Usage (success):
 *   node scripts/tofuPlanSummary.mts --title prod --json plan.json --text plan.txt
 * Usage (plan failed):
 *   node scripts/tofuPlanSummary.mts --title prod --failed --log plan.log --run-url <url>
 *
 * The Markdown goes to stdout.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

/** The parts of `tofu show -json` this script reads. */
export interface TofuPlanJson {
  resource_changes?: Array<{
    address: string;
    previous_address?: string;
    mode?: string;
    change: {
      actions: string[];
      importing?: unknown;
    };
  }>;
}

export type PlanAction =
  | 'delete'
  | 'replace'
  | 'update'
  | 'create'
  | 'import'
  | 'move'
  | 'forget';

export interface PlanEntry {
  address: string;
  action: PlanAction;
  /** Imported in this run and changed at the same time. */
  importing: boolean;
  previousAddress?: string;
}

export type PlanCounts = Record<PlanAction, number>;

/** Most consequential first — a deletion must not hide at the end of the list. */
const ACTION_ORDER: PlanAction[] = [
  'delete',
  'replace',
  'update',
  'create',
  'import',
  'move',
  'forget',
];

const SYMBOL: Record<PlanAction, string> = {
  delete: '-',
  replace: '-/+',
  update: '~',
  create: '+',
  import: '←',
  move: '→',
  forget: '⊘',
};

const LABEL: Record<PlanAction, string> = {
  delete: 'löschen',
  replace: 'ersetzen',
  update: 'ändern',
  create: 'hinzufügen',
  import: 'importieren',
  move: 'verschieben',
  forget: 'vergessen',
};

/** Columns of the count table; move and forget only appear when they occur. */
const TABLE_ACTIONS: PlanAction[] = [
  'create',
  'update',
  'replace',
  'delete',
  'import',
];

/** GitHub rejects comments above 65 536 characters. */
const MAX_COMMENT = 64_000;
const MAX_ERROR_TEXT = 20_000;

function classify(
  actions: string[],
  importing: boolean,
  moved: boolean,
): PlanAction | undefined {
  const key = actions.join(',');
  switch (key) {
    case 'create':
      return 'create';
    case 'update':
      return 'update';
    case 'delete':
      return 'delete';
    case 'delete,create':
    case 'create,delete':
      return 'replace';
    case 'forget':
      return 'forget';
    case 'no-op':
      if (importing) return 'import';
      if (moved) return 'move';
      return undefined;
    default:
      // "read" (data sources) changes nothing.
      return undefined;
  }
}

export function summarizePlan(plan: TofuPlanJson): {
  entries: PlanEntry[];
  counts: PlanCounts;
} {
  const counts: PlanCounts = {
    delete: 0,
    replace: 0,
    update: 0,
    create: 0,
    import: 0,
    move: 0,
    forget: 0,
  };
  const entries: PlanEntry[] = [];

  for (const rc of plan.resource_changes ?? []) {
    if (rc.mode === 'data') continue;
    const importing = rc.change.importing != null;
    const moved =
      rc.previous_address != null && rc.previous_address !== rc.address;
    const action = classify(rc.change.actions, importing, moved);
    if (!action) continue;

    counts[action] += 1;
    // An import that also changes the resource counts as import as well, like
    // tofu's own "Plan: N to import" line does.
    if (importing && action !== 'import') counts.import += 1;
    if (moved && action !== 'move') counts.move += 1;

    entries.push({
      address: rc.address,
      action,
      importing: importing && action !== 'import',
      previousAddress: moved ? rc.previous_address : undefined,
    });
  }

  entries.sort(
    (a, b) =>
      ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) ||
      a.address.localeCompare(b.address),
  );
  return { entries, counts };
}

function entryLine(entry: PlanEntry): string {
  const notes: string[] = [];
  if (entry.importing) notes.push('Import');
  if (entry.previousAddress) notes.push(`von ${entry.previousAddress}`);
  const suffix = notes.length ? ` (${notes.join(', ')})` : '';
  return `${SYMBOL[entry.action].padEnd(3)} ${entry.address}${suffix}`;
}

function countTable(counts: PlanCounts): string {
  const columns = [
    ...TABLE_ACTIONS,
    ...(['move', 'forget'] as const).filter((a) => counts[a] > 0),
  ];
  const head = columns.map((a) => `\`${SYMBOL[a]}\` ${LABEL[a]}`);
  const row = columns.map((a) =>
    (a === 'delete' || a === 'replace') && counts[a] > 0
      ? `**${counts[a]}**`
      : String(counts[a]),
  );
  return [
    `| ${head.join(' | ')} |`,
    `| ${columns.map(() => ':---:').join(' | ')} |`,
    `| ${row.join(' | ')} |`,
  ].join('\n');
}

function collapsedPlan(planText: string, budget: number): string {
  let text = planText.trimEnd();
  let note = '';
  if (text.length > budget) {
    text = text.slice(0, Math.max(0, budget));
    note =
      '\n\n_Plan gekürzt — der vollständige Text steht in der Job-Zusammenfassung._';
  }
  return `<details><summary>Vollständiger Plan</summary>\n\n\`\`\`terraform\n${text}\n\`\`\`${note}\n\n</details>`;
}

export function renderPlanMarkdown({
  title,
  plan,
  planText,
}: {
  title: string;
  plan: TofuPlanJson;
  planText: string;
}): string {
  const { entries, counts } = summarizePlan(plan);
  const heading = `### ✅ Terraform plan — \`${title}\``;

  if (entries.length === 0) {
    return `${heading}\n\nKeine Änderungen.`;
  }

  const parts = [heading, '', countTable(counts), ''];

  const destructive = counts.delete + counts.replace;
  if (destructive > 0) {
    const what = [
      counts.delete > 0 ? `${counts.delete} gelöscht` : '',
      counts.replace > 0 ? `${counts.replace} ersetzt` : '',
    ]
      .filter(Boolean)
      .join(', ');
    parts.push(
      `> [!WARNING]\n> Ressourcen werden ${what} — vor dem Merge prüfen.`,
      '',
    );
  }

  parts.push('```diff', ...entries.map(entryLine), '```', '');

  const head = parts.join('\n');
  // Room left for the plan text, minus the wrapper around it.
  const budget = MAX_COMMENT - head.length - 300;
  return `${head}${collapsedPlan(planText, budget)}`;
}

/** The part of a failed tofu run worth showing: from the first error on. */
export function extractErrors(log: string): string {
  const trimmed = log.trimEnd();
  const match = /^(?:│\s*)?Error: /m.exec(trimmed);
  const text = match ? trimmed.slice(match.index) : trimmed;
  return text.length > MAX_ERROR_TEXT ? text.slice(-MAX_ERROR_TEXT) : text;
}

export function renderPlanFailure({
  title,
  log,
  runUrl,
}: {
  title: string;
  log: string;
  runUrl: string;
}): string {
  const heading = `### ❌ Terraform plan — \`${title}\``;
  const errors = extractErrors(log);
  const link = `[Job-Log](${runUrl})`;
  if (!errors) {
    return `${heading}\n\nDer Plan ist fehlgeschlagen, bevor tofu eine Ausgabe geschrieben hat. Details im ${link}.`;
  }
  return `${heading}\n\nDer Plan ist fehlgeschlagen (${link}):\n\n\`\`\`\n${errors}\n\`\`\``;
}

function readIfExists(path: string | undefined): string {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function main(): void {
  const { values } = parseArgs({
    options: {
      title: { type: 'string' },
      failed: { type: 'boolean', default: false },
      json: { type: 'string' },
      text: { type: 'string' },
      log: { type: 'string' },
      'run-url': { type: 'string', default: '' },
    },
  });
  const title = values.title ?? 'plan';

  const markdown = values.failed
    ? renderPlanFailure({
        title,
        log: readIfExists(values.log),
        runUrl: values['run-url'] ?? '',
      })
    : renderPlanMarkdown({
        title,
        plan: JSON.parse(readIfExists(values.json) || '{}') as TofuPlanJson,
        planText: readIfExists(values.text),
      });
  process.stdout.write(`${markdown}\n`);
}

if (import.meta.main) {
  main();
}
