'use client';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import { useFirecallItems } from '../../components/firebase/firestoreHooks';
import useAiAssistant from '../../hooks/useAiAssistant';
import { AiAssistantResult } from '../../hooks/aiAssistant/types';
import AiAssistantButton from '../../components/Map/AiAssistantButton';

function AiAssistantPageQuery({ firecallItems }: { firecallItems: import('../../components/firebase/firestore').FirecallItem[] }) {
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

export default function AiAssistantPage() {
  const firecallId = useFirecallId();
  const firecallItems = useFirecallItems();

  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        AI Assistant
      </Typography>

      {firecallId != 'unknown' && (
        <>
          <AiAssistantPageQuery firecallItems={firecallItems} />
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
