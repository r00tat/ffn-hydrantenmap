'use client';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { useFirecallAIQueryStream } from './aiQuery';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import { MenuItem } from '@mui/material';
import { instructionSet } from './assistantInstructions';
import { useFirecallId } from '../../hooks/useFirecall';

export function AiAssistantPageQuery() {
  const [question, setQuestion] = useState('');
  const [assistant, setAssistant] = useState('Standard');
  const {
    resultHtml: answer,
    query,
    isQuerying: isLoading,
  } = useFirecallAIQueryStream();
  const askQuestion = useCallback(async () => {
    await query(question, instructionSet[assistant]);
  }, [assistant, query, question]);

  return (
    <>
      <FormControl fullWidth>
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
      </FormControl>
      <FormControl style={{ marginTop: 20 }}>
        <InputLabel id="assistant-select">Assistant</InputLabel>
        <Select
          labelId="assistant-select"
          value={assistant}
          label="Age"
          onChange={(e) => setAssistant(e.target.value)}
          variant="standard"
        >
          {Object.keys(instructionSet).map((key) => (
            <MenuItem value={key} key={key}>
              {key}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl style={{ marginTop: 28, marginLeft: 16 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={askQuestion}
          disabled={isLoading}
        >
          Ask &nbsp;{' '}
          {isLoading && <CircularProgress color="primary" size={20} />}
        </Button>
      </FormControl>

      <Typography>
        <span dangerouslySetInnerHTML={{ __html: answer }}></span>
      </Typography>
    </>
  );
}

export default function AiAssistantPage() {
  const firecallId = useFirecallId();

  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        AI Assistant
      </Typography>

      {firecallId != 'unknown' && <AiAssistantPageQuery />}
    </Paper>
  );
}
