import { describe, expect, it, vi } from 'vitest';
import { FunctionCall } from 'firebase/ai';
import { runLiveTurn, LiveMessage } from './liveTurn';
import { AiAssistantResult } from './types';

/** Baut einen Nachrichtenstrom, wie ihn `LiveSession.receive()` liefert. */
async function* stream(...messages: LiveMessage[]): AsyncGenerator<LiveMessage> {
  for (const message of messages) {
    yield message;
  }
}

function transcript(text: string, turnComplete = false): LiveMessage {
  return { type: 'serverContent', outputTranscription: { text }, turnComplete } as LiveMessage;
}

function toolCall(...functionCalls: FunctionCall[]): LiveMessage {
  return { type: 'toolCall', functionCalls } as LiveMessage;
}

function audio(data: string): LiveMessage {
  return {
    type: 'serverContent',
    modelTurn: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/pcm', data } }] },
  } as LiveMessage;
}

const ok: AiAssistantResult = { success: true, message: 'Fahrzeug angelegt' };

describe('runLiveTurn', () => {
  it('führt einen Werkzeugaufruf aus und schickt das Ergebnis zurück', async () => {
    const executeTool = vi.fn().mockResolvedValue({ ...ok, createdItemId: 'item-1' });
    const sendFunctionResponses = vi.fn().mockResolvedValue(undefined);

    const result = await runLiveTurn({
      messages: stream(
        toolCall({ name: 'createVehicle', args: { name: 'TLFA 4000' } }),
        transcript('Das TLFA 4000 '),
        transcript('ist eingetragen.', true),
      ),
      executeTool,
      sendFunctionResponses,
    });

    expect(executeTool).toHaveBeenCalledWith({ name: 'createVehicle', args: { name: 'TLFA 4000' } });
    expect(sendFunctionResponses).toHaveBeenCalledWith([
      { name: 'createVehicle', response: { result: { ...ok, createdItemId: 'item-1' } } },
    ]);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Das TLFA 4000 ist eingetragen.');
    expect(result.createdItemId).toBe('item-1');
  });

  it('wirft die Antwort nach einem Werkzeugaufruf nicht weg', async () => {
    // Die gemessene Reihenfolge einer echten Sitzung: Der Werkzeugaufruf
    // beendet den Sprecherwechsel, und erst im nächsten spricht das Modell.
    //
    //   1203ms  toolCall
    //   1205ms  turnComplete        <- nur das Ende des Werkzeug-Turns
    //   1905ms  audio + Abschrift
    //   5617ms  turnComplete        <- das echte Ende
    //
    // Wer beim ersten aussteigt, verliert jedes Mal die gesprochene Antwort.
    const onAudio = vi.fn();

    const result = await runLiveTurn({
      messages: stream(
        toolCall({ name: 'answerQuestion', args: { frage: 'Wie ist die Lage?' } }),
        { type: 'serverContent', turnComplete: true } as LiveMessage,
        audio('AAAA'),
        transcript('Drei Fahrzeuge im Einsatz.', true),
      ),
      executeTool: vi.fn().mockResolvedValue(ok),
      sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
      onAudio,
    });

    expect(result.message).toBe('Drei Fahrzeuge im Einsatz.');
    expect(result.isAnswer).toBe(true);
    expect(result.spokenByModel).toBe(true);
    expect(onAudio).toHaveBeenCalledWith('AAAA');
  });

  it('beendet den Sprecherwechsel auch über zwei Werkzeugrunden hinweg', async () => {
    const result = await runLiveTurn({
      messages: stream(
        toolCall({ name: 'searchWaterSupply', args: {} }),
        { type: 'serverContent', turnComplete: true } as LiveMessage,
        toolCall({ name: 'proposeHoseLine', args: {} }),
        { type: 'serverContent', turnComplete: true } as LiveMessage,
        transcript('Leitung vorgeschlagen.', true),
      ),
      executeTool: vi.fn().mockResolvedValue(ok),
      sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.message).toBe('Leitung vorgeschlagen.');
  });

  it('beantwortet eine reine Frage ohne Werkzeugaufruf', async () => {
    const result = await runLiveTurn({
      messages: stream(transcript('Es sind drei Hydranten in der Nähe.', true)),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
    });

    expect(result.success).toBe(true);
    expect(result.isAnswer).toBe(true);
    expect(result.message).toBe('Es sind drei Hydranten in der Nähe.');
  });

  it('führt mehrere Werkzeuge einer Nachricht aus und antwortet in einem Zug', async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValueOnce({ success: true, message: 'Marker angelegt' })
      .mockResolvedValueOnce({ success: true, message: 'Rohr angelegt' });
    const sendFunctionResponses = vi.fn().mockResolvedValue(undefined);

    await runLiveTurn({
      messages: stream(
        toolCall({ name: 'createMarker', args: {} }, { name: 'createRohr', args: {} }),
        transcript('Erledigt.', true),
      ),
      executeTool,
      sendFunctionResponses,
    });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(sendFunctionResponses).toHaveBeenCalledTimes(1);
    expect(sendFunctionResponses.mock.calls[0][0]).toHaveLength(2);
  });

  it('meldet ein fehlgeschlagenes Werkzeug an das Modell zurück', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: false, message: 'Kein Einsatzort bekannt' });
    const sendFunctionResponses = vi.fn().mockResolvedValue(undefined);

    await runLiveTurn({
      messages: stream(
        toolCall({ name: 'createVehicle', args: {} }),
        transcript('Das ging nicht, der Einsatzort fehlt.', true),
      ),
      executeTool,
      sendFunctionResponses,
    });

    expect(sendFunctionResponses).toHaveBeenCalledWith([
      { name: 'createVehicle', response: { result: { success: false, message: 'Kein Einsatzort bekannt' } } },
    ]);
  });

  it('reicht Leitungsentwürfe an die Oberfläche durch', async () => {
    const drafts = [{ id: 'draft-1' }] as never;
    const executeTool = vi.fn().mockResolvedValue({ success: true, message: 'Vorschlag', drafts });

    const result = await runLiveTurn({
      messages: stream(toolCall({ name: 'proposeHoseLine', args: {} }), transcript('Vorschlag liegt vor.', true)),
      executeTool,
      sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.drafts).toBe(drafts);
  });

  it('gibt die Tonausgabe des Modells an die Wiedergabe weiter', async () => {
    const onAudio = vi.fn();

    await runLiveTurn({
      messages: stream(
        {
          type: 'serverContent',
          modelTurn: { role: 'model', parts: [{ inlineData: { mimeType: 'audio/pcm', data: 'AAAA' } }] },
        } as LiveMessage,
        transcript('Fertig.', true),
      ),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onAudio,
    });

    expect(onAudio).toHaveBeenCalledWith('AAAA');
  });

  it('bricht die Wiedergabe ab, wenn das Modell unterbrochen wurde', async () => {
    const onInterrupt = vi.fn();

    await runLiveTurn({
      messages: stream(
        { type: 'serverContent', interrupted: true } as LiveMessage,
        transcript('Ja?', true),
      ),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onInterrupt,
    });

    expect(onInterrupt).toHaveBeenCalled();
  });

  it('läuft über eine Abschiedsmeldung der Sitzung hinweg', async () => {
    const result = await runLiveTurn({
      messages: stream(
        { type: 'goingAwayNotice', timeLeft: 5 } as LiveMessage,
        transcript('Alles klar.', true),
      ),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
    });

    expect(result.message).toBe('Alles klar.');
  });

  it('meldet einen Fehler, wenn die Verbindung ohne Antwort endet', async () => {
    const result = await runLiveTurn({
      messages: stream(),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
    });

    expect(result.success).toBe(false);
  });

  it('behält das Werkzeugergebnis, wenn die Verbindung vor dem Turnende abreißt', async () => {
    const executeTool = vi.fn().mockResolvedValue({ ...ok, createdItemId: 'item-2' });

    const result = await runLiveTurn({
      messages: stream(toolCall({ name: 'createVehicle', args: {} })),
      executeTool,
      sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Fahrzeug angelegt');
    expect(result.createdItemId).toBe('item-2');
  });

  it('meldet den Statuswechsel für die Oberfläche', async () => {
    const onStatus = vi.fn();

    await runLiveTurn({
      messages: stream(toolCall({ name: 'createMarker', args: {} }), transcript('Fertig.', true)),
      executeTool: vi.fn().mockResolvedValue(ok),
      sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
      onStatus,
    });

    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['analyzing', 'executing', 'analyzing']);
  });
});
