import { describe, expect, it } from 'vitest';
import {
  extractErrors,
  renderPlanFailure,
  renderPlanMarkdown,
  summarizePlan,
  type TofuPlanJson,
} from './tofuPlanSummary.mts';

function change(
  address: string,
  actions: string[],
  extra: Record<string, unknown> = {},
) {
  return { address, change: { actions, ...extra } };
}

const plan: TofuPlanJson = {
  resource_changes: [
    change('module.a.google_x.created', ['create']),
    change('module.a.google_x.updated', ['update']),
    change('module.a.google_x.deleted', ['delete']),
    change('module.a.google_x.replaced', ['delete', 'create']),
    change('module.a.google_x.replaced_cbd', ['create', 'delete']),
    change('module.a.google_x.imported', ['no-op'], {
      importing: { id: 'projects/p/x' },
    }),
    change('module.a.google_x.imported_and_updated', ['update'], {
      importing: { id: 'projects/p/y' },
    }),
    change('module.a.google_x.unchanged', ['no-op']),
    change('data.google_project.this', ['read']),
    change('module.a.google_x.moved', ['no-op'], {}),
  ],
};
// moved: previous_address sits on the resource change, not on `change`
(plan.resource_changes![9] as Record<string, unknown>).previous_address =
  'module.old.google_x.moved';

describe('summarizePlan', () => {
  it('zählt jede Aktion einzeln, Ersetzen nicht doppelt', () => {
    expect(summarizePlan(plan).counts).toEqual({
      create: 1,
      update: 2,
      replace: 2,
      delete: 1,
      import: 2,
      move: 1,
      forget: 0,
    });
  });

  it('übergeht unveränderte Ressourcen und Datenquellen', () => {
    const addresses = summarizePlan(plan).entries.map((e) => e.address);
    expect(addresses).not.toContain('module.a.google_x.unchanged');
    expect(addresses).not.toContain('data.google_project.this');
  });

  it('sortiert Löschen und Ersetzen nach vorn', () => {
    const actions = summarizePlan(plan).entries.map((e) => e.action);
    expect(actions).toEqual([
      'delete',
      'replace',
      'replace',
      'update',
      'update',
      'create',
      'import',
      'move',
    ]);
  });

  it('kommt mit einem Plan ohne resource_changes aus', () => {
    expect(summarizePlan({}).entries).toEqual([]);
  });
});

describe('renderPlanMarkdown', () => {
  const markdown = renderPlanMarkdown({
    title: 'prod',
    plan,
    planText: 'FULL PLAN TEXT',
  });

  it('zeigt die Anzahlen als Tabelle', () => {
    expect(markdown).toContain('### ✅ Terraform plan — `prod`');
    // Spalten: hinzufügen, ändern, ersetzen, löschen, importieren, verschieben.
    // Ersetzen und Löschen stehen fett, sobald sie vorkommen.
    expect(markdown).toContain('| 1 | 2 | **2** | **1** | 2 | 1 |');
  });

  it('listet die Ressourcen mit Symbol in einem diff-Block', () => {
    expect(markdown).toContain('```diff');
    expect(markdown).toContain('-   module.a.google_x.deleted');
    expect(markdown).toContain('-/+ module.a.google_x.replaced');
    expect(markdown).toContain('~   module.a.google_x.updated');
    expect(markdown).toContain(
      '~   module.a.google_x.imported_and_updated (Import)',
    );
    expect(markdown).toContain('+   module.a.google_x.created');
    expect(markdown).toContain('←   module.a.google_x.imported');
    expect(markdown).toContain(
      '→   module.a.google_x.moved (von module.old.google_x.moved)',
    );
  });

  it('warnt, wenn etwas gelöscht oder ersetzt wird', () => {
    expect(markdown).toContain('[!WARNING]');
  });

  it('hängt den vollen Plan zugeklappt an', () => {
    expect(markdown).toContain('<details><summary>Vollständiger Plan');
    expect(markdown).toContain('FULL PLAN TEXT');
  });

  it('meldet einen leeren Plan ohne Tabelle und ohne Warnung', () => {
    const empty = renderPlanMarkdown({
      title: 'dev',
      plan: { resource_changes: [change('x.y', ['no-op'])] },
      planText: 'No changes.',
    });
    expect(empty).toContain('### ✅ Terraform plan — `dev`');
    expect(empty).toContain('Keine Änderungen.');
    expect(empty).not.toContain('```diff');
    expect(empty).not.toContain('[!WARNING]');
  });

  it('kürzt den Plantext, damit der Kommentar unter dem GitHub-Limit bleibt', () => {
    const long = renderPlanMarkdown({
      title: 'prod',
      plan,
      planText: 'x'.repeat(200_000),
    });
    expect(long.length).toBeLessThan(65_000);
    expect(long).toContain('gekürzt');
  });
});

const FAILED_LOG = `module.x: Refreshing state... [id=a]
module.y: Refreshing state... [id=b]

Planning failed. OpenTofu encountered an error while generating this plan.


Error: Duplicate import configuration for "module.a.b[\\"K\\"]"

  on imports.tf line 69:
  69: import {

A resource can have only one import block.
`;

describe('extractErrors', () => {
  it('schneidet das Rauschen vor der ersten Fehlermeldung ab', () => {
    const text = extractErrors(FAILED_LOG);
    expect(text.startsWith('Error: Duplicate import configuration')).toBe(true);
    expect(text).not.toContain('Refreshing state');
    expect(text).toContain('on imports.tf line 69');
  });

  it('nimmt das Ende der Ausgabe, wenn keine Fehlermeldung erkennbar ist', () => {
    expect(extractErrors('a\nb\nc')).toBe('a\nb\nc');
  });

  it('bleibt bei einer sehr langen Ausgabe begrenzt', () => {
    expect(extractErrors('z'.repeat(100_000)).length).toBeLessThanOrEqual(
      20_000,
    );
  });
});

describe('renderPlanFailure', () => {
  it('zeigt ❌, die Fehlermeldung und den Link zum Job', () => {
    const markdown = renderPlanFailure({
      title: 'base',
      log: FAILED_LOG,
      runUrl: 'https://github.com/o/r/actions/runs/1',
    });
    expect(markdown).toContain('### ❌ Terraform plan — `base`');
    expect(markdown).toContain('Duplicate import configuration');
    expect(markdown).toContain('https://github.com/o/r/actions/runs/1');
  });

  it('verweist auf das Job-Log, wenn keine Ausgabe vorliegt', () => {
    const markdown = renderPlanFailure({
      title: 'dev',
      log: '',
      runUrl: 'https://github.com/o/r/actions/runs/2',
    });
    expect(markdown).toContain('### ❌ Terraform plan — `dev`');
    expect(markdown).toContain('Job-Log');
    expect(markdown).not.toContain('```');
  });
});
