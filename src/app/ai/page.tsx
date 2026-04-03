'use client';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import { useFirecallItems } from '../../components/firebase/firestoreHooks';
import useAiAssistant from '../../hooks/useAiAssistant';
import { AiAssistantResult } from '../../hooks/aiAssistant/types';
import { useFirecallAIQueryStream } from './aiQuery';
import { instructionSet } from './assistantInstructions';
import AiAssistantButton from '../../components/Map/AiAssistantButton';
import { FirecallItem } from '../../components/firebase/firestore';

type AiMode = 'assistant' | string;

const AI_MODES: { value: AiMode; label: string }[] = [
  { value: 'assistant', label: 'Einsatz-Assistent' },
  ...Object.keys(instructionSet)
    .filter((key) => key !== 'Standard')
    .map((key) => ({ value: key, label: key })),
];

function AssistantQuery({ firecallItems }: { firecallItems: FirecallItem[] }) {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AiAssistantResult | null>(null);
  const { processText } = useAiAssistant(firecallItems);

  const askQuestion = useCallback(async () => {
    if (!question.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await processText(question);
      setResult(res);
      if (res.success) {
        setQuestion('');
      }
    } finally {
      setIsLoading(false);
    }
  }, [processText, question]);

  const handleClarification = useCallback(async (option: string) => {
    setIsLoading(true);
    setResult(null);
    try {
      const res = await processText(option);
      setResult(res);
    } finally {
      setIsLoading(false);
    }
  }, [processText]);

  return (
    <>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <TextField
          label="Frage oder Befehl"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          fullWidth
          variant="outlined"
          placeholder="z.B. 'Wie viele Fahrzeuge sind im Einsatz?' oder 'Erstelle Abschnitt Nord'"
          onKeyDown={(e) => {
            if (!isLoading && e.key === 'Enter') {
              askQuestion();
            }
          }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={askQuestion}
          disabled={isLoading || !question.trim()}
          sx={{ minWidth: 100, height: 56 }}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Senden'}
        </Button>
      </Stack>

      {result && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity={result.success ? 'success' : result.clarification ? 'warning' : 'error'}
            variant="outlined"
          >
            {result.message}
            {result.clarification?.options && result.clarification.options.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                {result.clarification.options.map((option) => (
                  <Button
                    key={option}
                    size="small"
                    variant="outlined"
                    onClick={() => handleClarification(option)}
                    disabled={isLoading}
                  >
                    {option}
                  </Button>
                ))}
              </Stack>
            )}
          </Alert>
        </Box>
      )}
    </>
  );
}

function TextGenerationQuery({ systemInstruction }: { systemInstruction?: string }) {
  const [question, setQuestion] = useState('');
  const {
    resultHtml: answer,
    query,
    isQuerying: isLoading,
  } = useFirecallAIQueryStream();

  const askQuestion = useCallback(async () => {
    if (!question.trim()) return;
    await query(question, systemInstruction);
  }, [query, question, systemInstruction]);

  return (
    <>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <TextField
          label="Frage"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          fullWidth
          variant="outlined"
          placeholder="Stelle Fragen oder Aufgaben zum Einsatz"
          onKeyDown={(e) => {
            if (!isLoading && e.key === 'Enter') {
              askQuestion();
            }
          }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={askQuestion}
          disabled={isLoading || !question.trim()}
          sx={{ minWidth: 100, height: 56 }}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Senden'}
        </Button>
      </Stack>

      {answer && (
        <Box sx={{ mt: 2 }}>
          {/* AI-generated HTML from Gemini streaming response - same pattern as original implementation */}
          <Typography component="div">
            <span dangerouslySetInnerHTML={{ __html: answer }} />
          </Typography>
        </Box>
      )}
    </>
  );
}

export default function AiAssistantPage() {
  const firecallId = useFirecallId();
  const firecallItems = useFirecallItems();
  const [mode, setMode] = useState<AiMode>('assistant');

  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        AI Assistant
      </Typography>

      {firecallId != 'unknown' && (
        <>
          <FormControl sx={{ mb: 2, minWidth: 200 }}>
            <InputLabel id="ai-mode-label">Modus</InputLabel>
            <Select
              labelId="ai-mode-label"
              value={mode}
              label="Modus"
              onChange={(e) => setMode(e.target.value)}
            >
              {AI_MODES.map((m) => (
                <MenuItem value={m.value} key={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mt: 1 }}>
            {mode === 'assistant' ? (
              <AssistantQuery firecallItems={firecallItems} />
            ) : (
              <TextGenerationQuery systemInstruction={instructionSet[mode]} />
            )}
          </Box>

          <AiAssistantButton
            firecallItems={firecallItems}
            containerSx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
            }}
          />
        </>
      )}
    </Paper>
  );
}
