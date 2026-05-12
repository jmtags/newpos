import React, { useEffect, useState } from 'react';
import { DoorOpen, Pencil, Plus, Save } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { roomService } from '../services/room.service';
import type { Room } from '../services/scheduling.types';

const emptyForm = {
  id: '',
  room_name: '',
  room_type: '',
  capacity: 1,
  is_active: true,
  notes: ''
};

export const RoomsManagement: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadRooms = async () => {
    const data = await roomService.getRooms(true);
    setRooms(data);
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const resetForm = () => setForm(emptyForm);

  const saveRoom = async () => {
    if (!form.room_name.trim()) {
      alert('Please enter room name.');
      return;
    }

    try {
      setSaving(true);

      if (form.id) {
        await roomService.updateRoom(form.id, form as any);
      } else {
        await roomService.addRoom(form as any);
      }

      resetForm();
      await loadRooms();
    } catch (error: any) {
      alert(`Error saving room: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editRoom = (room: Room) => {
    setForm({
      id: room.id,
      room_name: room.room_name || '',
      room_type: room.room_type || '',
      capacity: Number(room.capacity || 1),
      is_active: room.is_active,
      notes: room.notes || ''
    });
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Rooms</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage clinic rooms used for appointment scheduling.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <DoorOpen className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            {form.id ? 'Edit Room' : 'Add Room'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Room Name"
            value={form.room_name}
            onChange={(event) =>
              setForm({ ...form, room_name: event.target.value })
            }
          />

          <Input
            label="Room Type"
            placeholder="Counseling, Assessment, Online"
            value={form.room_type}
            onChange={(event) =>
              setForm({ ...form, room_type: event.target.value })
            }
          />

          <Input
            type="number"
            label="Capacity"
            min="1"
            value={form.capacity}
            onChange={(event) =>
              setForm({ ...form, capacity: Number(event.target.value) || 1 })
            }
          />

          <label className="flex items-center gap-3 mt-6">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                setForm({ ...form, is_active: event.target.checked })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="md:col-span-4">
            <Input
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button onClick={saveRoom} disabled={saving}>
            {form.id ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : form.id ? 'Update Room' : 'Add Room'}
          </Button>

          {form.id && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Room</th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Type</th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">Capacity</th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">Status</th>
                <th className="text-right py-3 px-4 text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">{room.room_name}</p>
                    <p className="text-xs text-slate-500">{room.notes || '-'}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {room.room_type || '-'}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-slate-600">
                    {room.capacity}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      room.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {room.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => editRoom(room)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={room.is_active ? 'danger' : 'success'}
                        onClick={async () => {
                          await roomService.setRoomActive(room.id, !room.is_active);
                          await loadRooms();
                        }}
                      >
                        {room.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
