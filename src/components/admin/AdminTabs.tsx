'use client';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState, SyntheticEvent, ReactNode } from 'react';
import AdminActions from './AdminActions';
import GisDataPipeline from './GisDataPipeline';
import HydrantClusters from './HydrantClusters';
import KostenersatzAdminSettings from '../Kostenersatz/KostenersatzAdminSettings';
import PegelstandStations from './PegelstandStations';

interface TabPanelProps {
  children?: ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `admin-tab-${index}`,
    'aria-controls': `admin-tabpanel-${index}`,
  };
}

export default function AdminTabs() {
  const [value, setValue] = useState(0);

  const handleChange = (_event: SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h3" sx={{ mb: 2 }}>
        Admin
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={value} onChange={handleChange} aria-label="admin tabs" variant="scrollable" scrollButtons="auto">
          <Tab label="Admin Actions" {...a11yProps(0)} />
          <Tab label="GIS Data Pipeline" {...a11yProps(1)} />
          <Tab label="Hydrant Clusters" {...a11yProps(2)} />
          <Tab label="Kostenersatz" {...a11yProps(3)} />
          <Tab label="Pegelstände" {...a11yProps(4)} />
        </Tabs>
      </Box>
      <TabPanel value={value} index={0}>
        <AdminActions />
      </TabPanel>
      <TabPanel value={value} index={1}>
        <GisDataPipeline />
      </TabPanel>
      <TabPanel value={value} index={2}>
        <HydrantClusters />
      </TabPanel>
      <TabPanel value={value} index={3}>
        <KostenersatzAdminSettings />
      </TabPanel>
      <TabPanel value={value} index={4}>
        <PegelstandStations />
      </TabPanel>
    </Box>
  );
}
