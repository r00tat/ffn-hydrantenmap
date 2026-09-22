import { describe, expect, it } from 'vitest';
import {
  buildLiveTokenRequest,
  LIVE_TOKEN_EXPIRE_SECONDS,
  LIVE_TOKEN_NEW_SESSION_SECONDS,
  liveModelPath,
  normalizeSchemaTypes,
} from './aiLiveToken';

const NOW = Date.parse('2026-09-22T10:00:00.000Z');

interface TestSchema {
  type: string;
  enum?: string[];
  properties: Record<string, TestSchema>;
}

interface TestDeclaration {
  name: string;
  description: string;
  parameters: TestSchema;
}

const toolDeclarations: TestDeclaration[] = [
  {
    name: 'createItem',
    description: 'Legt ein Einsatzmittel an',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', properties: {} },
        position: {
          type: 'object',
          properties: {
            // Eine Eigenschaft, die selbst „type" heisst — die darf die
            // Umschrift nicht mit einem Schema-Typ verwechseln.
            type: { type: 'string', enum: ['auto', 'mapCenter'], properties: {} },
          },
        },
      },
    },
  },
];

describe('liveModelPath', () => {
  it('stellt den Sammelnamen voran', () => {
    expect(liveModelPath('gemini-3.1-flash-live-preview')).toBe(
      'models/gemini-3.1-flash-live-preview',
    );
  });

  it('laesst einen bereits vollstaendigen Pfad unveraendert', () => {
    expect(liveModelPath('models/gemini-3.1-flash-live-preview')).toBe(
      'models/gemini-3.1-flash-live-preview',
    );
  });
});

describe('normalizeSchemaTypes', () => {
  it('schreibt Schema-Typen gross', () => {
    const normalized = normalizeSchemaTypes(toolDeclarations)[0];
    expect(normalized.parameters.type).toBe('OBJECT');
    expect(normalized.parameters.properties.name.type).toBe('STRING');
  });

  it('fasst eine Eigenschaft namens „type" nicht an, nur ihren Schema-Typ', () => {
    const normalized = normalizeSchemaTypes(toolDeclarations)[0];
    const position = normalized.parameters.properties.position;
    // Der Schluessel bleibt stehen ...
    expect(Object.keys(position.properties)).toContain('type');
    // ... und der Typ darunter wird umgeschrieben.
    expect(position.properties.type.type).toBe('STRING');
    expect(position.properties.type.enum).toEqual(['auto', 'mapCenter']);
  });

  it('laesst die Vorlage unveraendert', () => {
    normalizeSchemaTypes(toolDeclarations);
    expect(toolDeclarations[0].parameters.type).toBe('object');
  });
});

describe('buildLiveTokenRequest', () => {
  const request = buildLiveTokenRequest({
    model: 'gemini-3.1-flash-live-preview',
    systemInstruction: 'Du bist ein Einsatz-Assistent.',
    toolDeclarations,
    now: NOW,
  });

  it('gibt das Token fuer genau eine Sitzung aus', () => {
    expect(request.uses).toBe(1);
  });

  it('setzt beide Fristen ab jetzt', () => {
    expect(request.newSessionExpireTime).toBe(
      new Date(NOW + LIVE_TOKEN_NEW_SESSION_SECONDS * 1000).toISOString(),
    );
    expect(request.expireTime).toBe(
      new Date(NOW + LIVE_TOKEN_EXPIRE_SECONDS * 1000).toISOString(),
    );
  });

  it('nagelt Modell, Systemanweisung und Werkzeuge im Token fest', () => {
    const setup = request.bidiGenerateContentSetup;
    expect(setup.model).toBe('models/gemini-3.1-flash-live-preview');
    expect(setup.systemInstruction).toEqual({
      role: 'system',
      parts: [{ text: 'Du bist ein Einsatz-Assistent.' }],
    });
    const [tool] = setup.tools as [{ functionDeclarations: TestDeclaration[] }];
    expect(tool.functionDeclarations[0].name).toBe('createItem');
    expect(tool.functionDeclarations[0].parameters.type).toBe('OBJECT');
  });

  it('bestellt Ton und beide Abschriften', () => {
    const setup = request.bidiGenerateContentSetup;
    expect(setup.generationConfig).toEqual({ responseModalities: ['AUDIO'] });
    // Die Abschriften gehoeren in das Setup, nicht in die generationConfig —
    // sonst wirft der Server sie weg.
    expect(setup.inputAudioTranscription).toEqual({});
    expect(setup.outputAudioTranscription).toEqual({});
  });

  it('schickt keine fieldMask', () => {
    // Ohne fieldMask gilt das Setup des Tokens vollstaendig und das Setup des
    // Browsers wird ignoriert. Genau das ist der Schutz: ein manipulierter
    // Client kann weder Systemanweisung noch Modell austauschen.
    expect('fieldMask' in request).toBe(false);
  });
});
