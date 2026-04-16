import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  CssBaseline,
  Box,
  CircularProgress,
  Tabs,
  Tab,
  Fab,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import { onAuthChange } from '@shared/auth';
import Login from './components/Login';
import Header from './components/Header';
import FirecallSelect from './components/FirecallSelect';
import FirecallOverview from './components/FirecallOverview';
import DiaryList from './components/DiaryList';
import DiaryForm from './components/DiaryForm';
import { useFirecalls } from './hooks/useFirecalls';
import { useFirecallItems } from './hooks/useFirecallItems';
import { useDiaries } from './hooks/useDiaries';
import { useCrewAssignments } from './hooks/useCrewAssignments';
import { useUserClaims } from './hooks/useUserClaims';


function MainContent({ email }: { email: string }) {
  const { groups, firecall: firecallClaim, loading: claimsLoading } = useUserClaims();
  const { firecalls, loading: firecallsLoading } = useFirecalls(groups, firecallClaim);
  const [selectedFirecallId, setSelectedFirecallId] = useState<string | null>(
    null
  );
  const [tab, setTab] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const { items, loading: itemsLoading } = useFirecallItems(selectedFirecallId);
  const { crew, loading: crewLoading } = useCrewAssignments(selectedFirecallId);
  const { diaries, loading: diariesLoading } = useDiaries(selectedFirecallId);

  const selectedFirecall = firecalls.find(
    (fc) => fc.id === selectedFirecallId
  );

  // Load persisted selection
  useEffect(() => {
    chrome.storage.local.get('selectedFirecallId', (result) => {
      if (result.selectedFirecallId) {
        setSelectedFirecallId(result.selectedFirecallId);
      }
    });
  }, []);

  // Auto-select most recent firecall if nothing persisted or the persisted
  // selection no longer exists in the current database (e.g. after switching
  // from dev to prod).
  // setState during render is the React 19 pattern for deriving state from
  // changing props — avoids the set-state-in-effect lint rule.
  if (
    firecalls.length > 0 &&
    (!selectedFirecallId || !firecalls.some((fc) => fc.id === selectedFirecallId))
  ) {
    setSelectedFirecallId(firecalls[0].id!);
  }

  // Persist the selection whenever it changes.
  useEffect(() => {
    if (selectedFirecallId) {
      chrome.storage.local.set({ selectedFirecallId });
    }
  }, [selectedFirecallId]);

  const handleSelect = (id: string) => {
    setSelectedFirecallId(id);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Header email={email} />
      <Box sx={{ p: 2, pb: 1 }}>
        <FirecallSelect
          firecalls={firecalls}
          selectedId={selectedFirecallId}
          onSelect={handleSelect}
          loading={firecallsLoading || claimsLoading}
        />
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab label="Übersicht" />
        <Tab label="Tagebuch" />
      </Tabs>
      {tab === 0 && (
        <FirecallOverview
          firecall={selectedFirecall}
          firecallId={selectedFirecallId}
          items={items}
          crew={crew}
          loading={itemsLoading || crewLoading}
        />
      )}
      {tab === 1 && (
        <Box sx={{ position: 'relative' }}>
          {showForm ? (
            <DiaryForm
              firecallId={selectedFirecallId!}
              onClose={() => setShowForm(false)}
              onSaved={() => setShowForm(false)}
            />
          ) : (
            <>
              <DiaryList diaries={diaries} loading={diariesLoading} />
              <Fab
                color="primary"
                size="small"
                onClick={() => setShowForm(true)}
                sx={{ position: 'fixed', bottom: 16, right: 16 }}
              >
                <Add />
              </Fab>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <CssBaseline enableColorScheme />
      <Box sx={{ width: 400, minHeight: 500 }}>
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 500,
            }}
          >
            <CircularProgress />
          </Box>
        ) : user ? (
          <MainContent email={user.email || ''} />
        ) : (
          <Login />
        )}
      </Box>
    </>
  );
}
