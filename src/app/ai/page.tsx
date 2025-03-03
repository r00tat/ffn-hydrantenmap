'use client';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { marked } from 'marked';
import { useCallback, useState } from 'react';
import firecallAIQuery from './aiQuery';
import useFirecallSummary from './firecallSummary';
import CircularProgress from '@mui/material/CircularProgress';

export default function AiAssistantPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const summary = useFirecallSummary();
  const askQuestion = useCallback(async () => {
    setAnswer('');
    setIsLoading(true);
    const answer = await firecallAIQuery(question, summary);
    const htmlText = await marked(answer);
    setAnswer(htmlText);
    setIsLoading(false);
  }, [question, summary]);

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
