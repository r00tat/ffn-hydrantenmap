import { describe, expect, it } from 'vitest';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from './aiTools';

/**
 * Diese Tests hüten den Vertrag zwischen Prompt und Werkzeugen. Ein Bruch
 * äußert sich sonst nur darin, dass das Modell ein Werkzeug nicht mehr
 * benutzt — ohne Fehler, ohne Log, ohne fehlschlagenden Test.
 */
describe('AI tool declarations', () => {
  it('has a unique, well-formed name for every tool', () => {
    const names = AI_TOOL_DECLARATIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
    }
  });

  it('describes every tool, because that is what the model selects on', () => {
    for (const declaration of AI_TOOL_DECLARATIONS) {
      expect(declaration.description.length).toBeGreaterThan(20);
    }
  });

  it('mentions every tool in the system prompt', () => {
    for (const { name } of AI_TOOL_DECLARATIONS) {
      expect(AI_SYSTEM_PROMPT).toContain(name);
    }
  });
});

describe('AI system prompt', () => {
  it('carves water supply questions out of the answerQuestion rule', () => {
    // Ohne diese Ausnahme gewinnt die frühere, allgemeinere Regel „Bei Fragen
    // … verwende answerQuestion" und „Wo ist der nächste Hydrant?" wird ohne
    // Datenabfrage beantwortet.
    const answerRule = AI_SYSTEM_PROMPT.slice(
      AI_SYSTEM_PROMPT.indexOf('Bei Fragen über den Einsatz'),
      AI_SYSTEM_PROMPT.indexOf('Bei Unklarheiten')
    );
    expect(answerRule).toContain('searchWaterSupply');
    expect(answerRule).toContain('Hydranten');
  });

  it('forbids answering about hydrants from the model’s own knowledge', () => {
    expect(AI_SYSTEM_PROMPT).toMatch(
      /kennst KEINE Hydranten[\s\S]*searchWaterSupply/
    );
  });

  it('tells the model that one search call is enough', () => {
    expect(AI_SYSTEM_PROMPT).toContain('searchWaterSupply EINMAL aufrufen');
  });
});
