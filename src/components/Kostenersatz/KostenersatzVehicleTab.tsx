'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState } from 'react';
import {
  KostenersatzRate,
  KostenersatzVehicle,
} from '../../common/kostenersatz';
import { generateVehicleId } from '../../common/defaultKostenersatzRates';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';
import {
  useKostenersatzVehicleUpsert,
  useKostenersatzVehicleDelete,
  useKostenersatzSeedDefaultVehicles,
  useKostenersatzVehicleReorder,
} from '../../hooks/useKostenersatzMutations';

interface SortableTableRowProps {
  vehicle: KostenersatzVehicle;
  getRateDescription: (rateId: string) => string;
  onEdit: (vehicle: KostenersatzVehicle) => void;
  onDelete: (vehicle: KostenersatzVehicle) => void;
  disabled?: boolean;
}

function SortableTableRow({
  vehicle,
  getRateDescription,
  onEdit,
  onDelete,
  disabled,
}: SortableTableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: vehicle.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell sx={{ width: 40, cursor: disabled ? 'default' : 'grab' }}>
        <Box
          {...attributes}
          {...listeners}
          sx={{
            display: 'flex',
            alignItems: 'center',
            color: disabled ? 'text.disabled' : 'text.secondary',
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </TableCell>
      <TableCell>
        <Typography fontWeight={500}>{vehicle.name}</Typography>
      </TableCell>
      <TableCell>{vehicle.description || '-'}</TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {vehicle.rateId} - {getRateDescription(vehicle.rateId)}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <IconButton
          size="small"
          onClick={() => onEdit(vehicle)}
          title="Bearbeiten"
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={() => onDelete(vehicle)}
          title="Löschen"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

interface KostenersatzVehicleTabProps {
  rates: KostenersatzRate[];
}

export default function KostenersatzVehicleTab({
  rates,
}: KostenersatzVehicleTabProps) {
  const { vehicles, loading, isUsingDefaults } = useKostenersatzVehicles();
  const upsertVehicle = useKostenersatzVehicleUpsert();
  const deleteVehicle = useKostenersatzVehicleDelete();
  const seedVehicles = useKostenersatzSeedDefaultVehicles();
  const reorderVehicles = useKostenersatzVehicleReorder();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] =
    useState<KostenersatzVehicle | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRateId, setFormRateId] = useState('');

  // Filter rates to categories 2, 4, 8
  const vehicleRates = rates.filter((r) => [2, 4, 8].includes(r.categoryNumber));

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormName('');
    setFormDescription('');
    setFormRateId('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (vehicle: KostenersatzVehicle) => {
    setEditingVehicle(vehicle);
    setFormName(vehicle.name);
    setFormDescription(vehicle.description || '');
    setFormRateId(vehicle.rateId);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingVehicle(null);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formRateId) return;

    setSaving(true);
    try {
      const vehicleId = editingVehicle?.id || generateVehicleId(formName);
      const sortOrder = editingVehicle?.sortOrder || vehicles.length + 1;

      await upsertVehicle({
        id: vehicleId,
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        rateId: formRateId,
        sortOrder,
      });
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      alert('Fehler beim Speichern des Fahrzeugs.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicle: KostenersatzVehicle) => {
    if (confirm(`Fahrzeug "${vehicle.name}" wirklich löschen?`)) {
      try {
        await deleteVehicle(vehicle.id);
      } catch (error) {
        console.error('Error deleting vehicle:', error);
        alert('Fehler beim Löschen des Fahrzeugs.');
      }
    }
  };

  const handleSeedVehicles = async () => {
    setSeeding(true);
    try {
      await seedVehicles();
      setSeedDialogOpen(false);
    } catch (error) {
      console.error('Error seeding vehicles:', error);
      alert('Fehler beim Laden der Standard-Fahrzeuge.');
    } finally {
      setSeeding(false);
    }
  };

  // Get rate description for display
  const getRateDescription = (rateId: string): string => {
    const rate = rates.find((r) => r.id === rateId);
    return rate ? rate.description : rateId;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = vehicles.findIndex((v) => v.id === active.id);
      const newIndex = vehicles.findIndex((v) => v.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(vehicles, oldIndex, newIndex);
        const vehicleIds = newOrder.map((v) => v.id);

        try {
          await reorderVehicles(vehicleIds);
        } catch (error) {
          console.error('Error reordering vehicles:', error);
          alert('Fehler beim Sortieren der Fahrzeuge.');
        }
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography variant="h6">Fahrzeuge</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => setSeedDialogOpen(true)}
            variant="outlined"
          >
            Standard-Fahrzeuge laden
          </Button>
          <Button
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            variant="contained"
          >
            Fahrzeug hinzufügen
          </Button>
        </Box>
      </Box>

      {isUsingDefaults && (
        <Typography variant="body2" color="text.secondary">
          Zeigt Standard-Fahrzeuge. Klicken Sie &quot;Standard-Fahrzeuge
          laden&quot; um sie in die Datenbank zu übernehmen.
        </Typography>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell>Name</TableCell>
              <TableCell>Beschreibung</TableCell>
              <TableCell>Tarif</TableCell>
              <TableCell align="center" sx={{ width: 100 }}>
                Aktionen
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <SortableContext
              items={vehicles.map((v) => v.id)}
              strategy={verticalListSortingStrategy}
            >
              {vehicles.map((vehicle) => (
                <SortableTableRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  getRateDescription={getRateDescription}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  disabled={isUsingDefaults}
                />
              ))}
            </SortableContext>
            {vehicles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary">
                    Keine Fahrzeuge vorhanden.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DndContext>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingVehicle ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              required
              autoFocus
              placeholder="z.B. RLFA 3000"
            />
            <TextField
              label="Beschreibung (optional)"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              fullWidth
              placeholder="z.B. RüstLösch Neusiedl am See"
            />
            <FormControl fullWidth required>
              <InputLabel>Tarif</InputLabel>
              <Select
                value={formRateId}
                onChange={(e) => setFormRateId(e.target.value)}
                label="Tarif"
              >
                {vehicleRates.map((rate) => (
                  <MenuItem key={rate.id} value={rate.id}>
                    {rate.id} - {rate.description}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !formName.trim() || !formRateId}
          >
            {saving ? <CircularProgress size={20} /> : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Seed Dialog */}
      <Dialog open={seedDialogOpen} onClose={() => setSeedDialogOpen(false)}>
        <DialogTitle>Standard-Fahrzeuge laden</DialogTitle>
        <DialogContent>
          <Typography>
            Möchten Sie die Standard-Fahrzeuge der FF Neusiedl am See in die
            Datenbank laden?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bestehende Fahrzeuge mit gleicher ID werden überschrieben.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedDialogOpen(false)} disabled={seeding}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            onClick={handleSeedVehicles}
            disabled={seeding}
          >
            {seeding ? <CircularProgress size={20} /> : 'Laden'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
