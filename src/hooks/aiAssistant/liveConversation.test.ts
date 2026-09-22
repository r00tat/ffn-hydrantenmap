import { describe, expect, it, vi } from 'vitest';
import { FunctionCall } from 'firebase/ai';
import { runLiveConversation, LiveMessage } from './liveConversation';
import { AiAssistantResult } from './types';

/** Baut einen Nachrichtenstrom, wie ihn die Sitzung liefert. */
async function* stream(...messages: LiveMessage[]): AsyncGenerator<LiveMessage> {
  for (const message of messages) {
    yield message;
  }
}

function transcript(text: string, turnComplete = false): LiveMessage {
  return { type: 'serverContent', outputTranscription: { text }, turnComplete } as LiveMessage;
}

function heard(text: string): LiveMessage {
  return { type: 'serverContent', inputTranscription: { text } } as LiveMessage;
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

function turnEnd(): LiveMessage {
  return { type: 'serverContent', turnComplete: true } as LiveMessage;
}

const ok: AiAssistantResult = { success: true, message: 'Fahrzeug angelegt' };

describe('runLiveConversation', () => {
  it('meldet jeden Beitrag einzeln, ohne die Sitzung zu beenden', async () => {
    const onTurn = vi.fn();

    await runLiveConversation({
      messages: stream(
        transcript('Zwei Fahrzeuge '),
        transcript('sind vor Ort.', true),
        transcript('Das TLFA steht am Ortsende.', true),
      ),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onTurn,
    });

    expect(onTurn).toHaveBeenCalledTimes(2);
    expect(onTurn.mock.calls[0][0].message).toBe('Zwei Fahrzeuge sind vor Ort.');
    expect(onTurn.mock.calls[1][0].message).toBe('Das TLFA steht am Ortsende.');
  });

  it('gibt die Antwort schon während des Sprechens heraus', async () => {
    // Der Grund für diesen Rückruf: Die Meldung soll mit der Sprachausgabe
    // erscheinen und nicht erst, wenn der Satz zu Ende gesprochen ist.
    const onPartialAnswer = vi.fn();

    await runLiveConversation({
      messages: stream(transcript('Zwei Fahrzeuge '), transcript('sind vor Ort.', true)),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onPartialAnswer,
    });

    expect(onPartialAnswer.mock.calls.map((call) => call[0])).toEqual([
      'Zwei Fahrzeuge ',
      'Zwei Fahrzeuge sind vor Ort.',
    ]);
  });

  it('reicht weiter, was der Benutzer gesagt hat', async () => {
    const onHeard = vi.fn();

    await runLiveConversation({
      messages: stream(heard('Wie ist die '), heard('Lage?'), transcript('Ruhig.', true)),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onHeard,
    });

    expect(onHeard).toHaveBeenLastCalledWith('Wie ist die Lage?');
  });

  it('führt einen Werkzeugaufruf aus und wirft die Antwort danach nicht weg', async () => {
    // Die gemessene Reihenfolge einer echten Sitzung: Der Werkzeugaufruf
    // beendet den Sprecherwechsel, und erst im nächsten spricht das Modell.
    //
    //   1203 ms  toolCall
    //   1205 ms  turnComplete        <- nur das Ende des Werkzeug-Turns
    //   1905 ms  Ton samt Abschrift
    //   5617 ms  turnComplete        <- das echte Ende
    const executeTool = vi.fn().mockResolvedValue({ ...ok, createdItemId: 'item-1' });
    const sendFunctionResponses = vi.fn().mockResolvedValue(undefined);
    const onTurn = vi.fn();

    await runLiveConversation({
      messages: stream(
        toolCall({ name: 'createVehicle', args: { name: 'TLFA 4000' } }),
        turnEnd(),
        audio('AAAA'),
        transcript('Das TLFA 4000 ist eingetragen.', true),
      ),
      executeTool,
      sendFunctionResponses,
      onTurn,
    });

    expect(sendFunctionResponses).toHaveBeenCalledWith([
      { name: 'createVehicle', response: { result: { ...ok, createdItemId: 'item-1' } } },
    ]);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0]).toMatchObject({
      success: true,
      message: 'Das TLFA 4000 ist eingetragen.',
      createdItemId: 'item-1',
      spokenByModel: true,
    });
  });

  it('meldet das Werkzeugergebnis, wenn das Modell dazu nichts mehr sagt', async () => {
    // Sonst bliebe ein angelegtes Fahrzeug unbestätigt auf der Karte stehen.
    const onTurn = vi.fn();

    await runLiveConversation({
      messages: stream(
        toolCall({ name: 'createVehicle', args: {} }),
        turnEnd(),
        turnEnd(),
      ),
      executeTool: vi.fn().mockResolvedValue(ok),
      sendFunctionResponses: vi.fn(),
      onTurn,
    });

    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0].message).toBe('Fahrzeug angelegt');
  });

  it('verwirft die geplante Wiedergabe, wenn dazwischengeredet wird', async () => {
    const onInterrupt = vi.fn();

    await runLiveConversation({
      messages: stream(
        audio('AAAA'),
        { type: 'serverContent', interrupted: true } as LiveMessage,
        transcript('Ja?', true),
      ),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onInterrupt,
    });

    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('meldet den Status zurück: zuhören, ausführen, antworten', async () => {
    const onStatus = vi.fn();

    await runLiveConversation({
      messages: stream(
        toolCall({ name: 'createVehicle', args: {} }),
        turnEnd(),
        audio('AAAA'),
        transcript('Erledigt.', true),
      ),
      executeTool: vi.fn().mockResolvedValue(ok),
      sendFunctionResponses: vi.fn(),
      onStatus,
    });

    const states = onStatus.mock.calls.map((call) => call[0]);
    expect(states).toContain('executing');
    expect(states).toContain('speaking');
    // Nach dem Beitrag hört der Assistent wieder zu — die Sitzung lebt weiter.
    expect(states[states.length - 1]).toBe('listening');
  });

  it('endet erst, wenn der Nachrichtenstrom endet', async () => {
    const onEnd = vi.fn();

    await runLiveConversation({
      messages: stream(transcript('Erledigt.', true)),
      executeTool: vi.fn(),
      sendFunctionResponses: vi.fn(),
      onEnd,
    });

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
