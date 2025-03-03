'use client';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { marked } from 'marked';
import { useCallback, useState } from 'react';
import firecallAIQuery from './aiQuery';
import useFirecallSummary from './firecallSummary';

export default function AiAssistantPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const summary = useFirecallSummary();
  const askQuestion = useCallback(async () => {
    const answer = await firecallAIQuery(question, summary);
    const htmlText = await marked(answer);
    setAnswer(htmlText);
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            askQuestion();
          }
        }}
      />
      <Button variant="contained" color="primary" onClick={askQuestion}>
        Ask
      </Button>

      <Typography>
        Antwort: <br />
        <span dangerouslySetInnerHTML={{ __html: answer }}></span>
      </Typography>
    </Paper>
  );
}
