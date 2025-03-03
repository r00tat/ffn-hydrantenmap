'use client';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { useFirecallAIQueryStream } from './aiQuery';

export default function AiAssistantPage() {
  const [question, setQuestion] = useState('');
  const {
    resultHtml: answer,
    query,
    isQuerying: isLoading,
  } = useFirecallAIQueryStream();
  const askQuestion = useCallback(async () => {
    await query(question);
  }, [query, question]);

  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        AI Assistant
      </Typography>

      <TextField
        id="outlined"
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
        disabled={isLoading}
      >
        Ask &nbsp; {isLoading && <CircularProgress color="primary" size={20} />}
      </Button>

      <Typography>
        <span dangerouslySetInnerHTML={{ __html: answer }}></span>
      </Typography>
    </Paper>
  );
}
