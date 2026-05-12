import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { associateService } from '../services/associateService';
import {
  associateAvailabilityService,
  dayNames
} from '../services/associateAvailability.service';
import type { AssociateAvailability as Availability } from '../services/scheduling.types';

export const AssociateAvailability: React.FC = () => {
  const [associates, setAssociates] = useState<any[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [associateId, setAssociateId] = useState('');
  const [form, setForm] = useState({
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  const selectedAssociate = associates.find((item) => item.id === associateId);

  const loadData = async (nextAssociateId = associateId) => {
    const [associateData, availabilityData] = await Promise.all([
      associateService.getAssociates(),
      associateAvailabilityService.getAvailability(nextAssociateId || undefined)
    ]);

    setAssociates(associateData);
    setAvailability(availabilityData);

    if (!nextAssociateId && associateData.length > 0) {
      setAssociateId(associateData[0].id);
      const firstAvailability =
        await associateAvailabilityService.getAvailability(associateData[0].id);
      setAvailability(firstAvailability);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const associateOptions = useMemo(
    () =>
      associates.map((associate) => ({
        value: associate.id,
        label: associate.full_name
      })),
    [associates]
  );

  const saveAvailability = async () => {
    if (!associateId) {
      alert('Please select an associate.');
      return;
    }

    if (form.start_time >= form.end_time) {
      alert('Start time must be earlier than end time.');
      return;
    }

    try {
      setSaving(true);
      await associateAvailabilityService.addAvailability({
        associate_id: associateId,
        day_of_week: Number(form.day_of_week),
        start_time: form.start_time,
        end_time: form.end_time,
        is_active: form.is_active
      });
      await loadData(associateId);
    } catch (error: any) {
      alert(`Error saving availability: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Associate Availability
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Set weekly working hours used by appointment conflict checks.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <CalendarClock className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Weekly Availability
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <Select
              label="Associate"
              options={associateOptions}
              value={associateId}
              onChange={async (event) => {
                setAssociateId(event.target.value);
                await loadData(event.target.value);
              }}
            />
          </div>

          <Select
            label="Day"
            options={dayNames.map((day, index) => ({
              value: String(index),
              label: day
            }))}
            value={String(form.day_of_week)}
            onChange={(event) =>
              setForm({ ...form, day_of_week: Number(event.target.value) })
            }
          />

          <Input
            type="time"
            label="Start"
            value={form.start_time}
            onChange={(event) =>
              setForm({ ...form, start_time: event.target.value })
            }
          />

          <Input
            type="time"
            label="End"
            value={form.end_time}
            onChange={(event) =>
              setForm({ ...form, end_time: event.target.value })
            }
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <label className="flex items-center gap-2">
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

          <Button onClick={saveAvailability} disabled={saving || !associateId}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Add Availability'}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">
            {selectedAssociate?.full_name || 'Selected Associate'} Schedule
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Day</th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Time</th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">Status</th>
                <th className="text-right py-3 px-4 text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {availability.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-sm text-slate-900">
                    {dayNames[row.day_of_week]}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {row.start_time.slice(0, 5)} - {row.end_time.slice(0, 5)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      row.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await associateAvailabilityService.updateAvailability(row.id, {
                            is_active: !row.is_active
                          });
                          await loadData(associateId);
                        }}
                      >
                        {row.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (!window.confirm('Remove this availability?')) return;
                          await associateAvailabilityService.deleteAvailability(row.id);
                          await loadData(associateId);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {availability.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No availability set for this associate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
