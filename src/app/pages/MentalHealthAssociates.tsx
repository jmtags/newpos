import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { associateService } from '../services/associateService';
import { serviceService } from '../services/serviceService';
import {
  associateServicesService,
  skillLevelOptions
} from '../services/associateServices.service';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import type { AssociateSkillLevel } from '../services/scheduling.types';

export const MentalHealthAssociates: React.FC = () => {
  const [associates, setAssociates] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [serviceTags, setServiceTags] = useState<any[]>([]);
  const [selectedAssociateId, setSelectedAssociateId] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    id: '',
    full_name: '',
    title: '',
    profession: '',
    contact_number: '',
    email: '',
    license_number: '',
    is_active: true,
    notes: ''
  });

  const [serviceForm, setServiceForm] = useState({
    service_id: '',
    skill_level: 'qualified' as AssociateSkillLevel,
    is_preferred: false,
    is_active: true,
    notes: ''
  });

  const loadAssociates = async () => {
    const [associateData, serviceData] = await Promise.all([
      associateService.getAssociates(),
      serviceService.getServices()
    ]);

    setAssociates(associateData);
    setServices(serviceData.filter((service: any) => service.is_active));

    if (!selectedAssociateId && associateData.length > 0) {
      setSelectedAssociateId(associateData[0].id);
      const tags = await associateServicesService.getAssociateServices(
        associateData[0].id
      );
      setServiceTags(tags);
    }
  };

  useEffect(() => {
    loadAssociates();
  }, []);

  const loadServiceTags = async (associateId = selectedAssociateId) => {
    if (!associateId) {
      setServiceTags([]);
      return;
    }

    const tags = await associateServicesService.getAssociateServices(associateId);
    setServiceTags(tags);
  };

  const resetForm = () => {
    setForm({
      id: '',
      full_name: '',
      title: '',
      profession: '',
      contact_number: '',
      email: '',
      license_number: '',
      is_active: true,
      notes: ''
    });
    setEditing(false);
  };

  const saveAssociate = async () => {
    if (!form.full_name.trim()) {
      alert('Please enter associate name.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        full_name: form.full_name,
        title: form.title,
        profession: form.profession,
        contact_number: form.contact_number,
        email: form.email,
        license_number: form.license_number,
        is_active: form.is_active,
        notes: form.notes
      };

      if (editing) {
        await associateService.updateAssociate(form.id, payload);
      } else {
        const newAssociate = await associateService.addAssociate(payload);
        setSelectedAssociateId(newAssociate.id);
      }

      resetForm();
      await loadAssociates();
      await loadServiceTags();
    } catch (error: any) {
      alert(`Error saving associate: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editAssociate = (associate: any) => {
    setForm({
      id: associate.id,
      full_name: associate.full_name || '',
      title: associate.title || '',
      profession: associate.profession || '',
      contact_number: associate.contact_number || '',
      email: associate.email || '',
      license_number: associate.license_number || '',
      is_active: associate.is_active,
      notes: associate.notes || ''
    });
    setEditing(true);
  };

  const deleteAssociate = async (id: string) => {
    if (!window.confirm('Delete this associate?')) return;

    try {
      await associateService.deleteAssociate(id);
      await loadAssociates();
    } catch (error: any) {
      alert(`Error deleting associate: ${error.message}`);
    }
  };

  const saveAssociateService = async () => {
    if (!selectedAssociateId || !serviceForm.service_id) {
      alert('Please select associate and service.');
      return;
    }

    try {
      await associateServicesService.upsertAssociateService({
        associate_id: selectedAssociateId,
        service_id: serviceForm.service_id,
        skill_level: serviceForm.skill_level,
        is_preferred: serviceForm.is_preferred,
        is_active: serviceForm.is_active,
        notes: serviceForm.notes
      });

      setServiceForm({
        service_id: '',
        skill_level: 'qualified',
        is_preferred: false,
        is_active: true,
        notes: ''
      });
      await loadServiceTags(selectedAssociateId);
    } catch (error: any) {
      alert(`Error saving associate service: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Associate/s
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage Associate/s assigned to services.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            {editing ? 'Edit Associate' : 'Add Associate'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />

          <Input
            label="Title"
            placeholder="RPsy, RGC, LPT, etc."
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <Input
            label="Profession"
            placeholder="Psychologist, Counselor, Psychometrician"
            value={form.profession}
            onChange={(e) => setForm({ ...form, profession: e.target.value })}
          />

          <Input
            label="Contact Number"
            value={form.contact_number}
            onChange={(e) =>
              setForm({ ...form, contact_number: e.target.value })
            }
          />

          <Input
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <Input
            label="License Number"
            value={form.license_number}
            onChange={(e) =>
              setForm({ ...form, license_number: e.target.value })
            }
          />

          <div className="md:col-span-3">
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <Button onClick={saveAssociate} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : editing ? 'Update Associate' : 'Add Associate'}
          </Button>

          {editing && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Services They Can Handle
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <Select
              label="Associate"
              value={selectedAssociateId}
              onChange={async (event) => {
                setSelectedAssociateId(event.target.value);
                await loadServiceTags(event.target.value);
              }}
              options={[
                { value: '', label: 'Select associate...' },
                ...associates.map((associate) => ({
                  value: associate.id,
                  label: associate.full_name
                }))
              ]}
            />
          </div>

          <div className="md:col-span-2">
            <Select
              label="Service"
              value={serviceForm.service_id}
              onChange={(event) =>
                setServiceForm({
                  ...serviceForm,
                  service_id: event.target.value
                })
              }
              options={[
                { value: '', label: 'Select service...' },
                ...services.map((service) => ({
                  value: service.id,
                  label: service.name
                }))
              ]}
            />
          </div>

          <Select
            label="Skill Level"
            value={serviceForm.skill_level}
            onChange={(event) =>
              setServiceForm({
                ...serviceForm,
                skill_level: event.target.value as AssociateSkillLevel
              })
            }
            options={skillLevelOptions}
          />

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={serviceForm.is_preferred}
              onChange={(event) =>
                setServiceForm({
                  ...serviceForm,
                  is_preferred: event.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Preferred</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={serviceForm.is_active}
              onChange={(event) =>
                setServiceForm({
                  ...serviceForm,
                  is_active: event.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="md:col-span-2">
            <Input
              label="Notes"
              value={serviceForm.notes}
              onChange={(event) =>
                setServiceForm({ ...serviceForm, notes: event.target.value })
              }
            />
          </div>

          <div className="flex items-end">
            <Button onClick={saveAssociateService}>
              <Plus className="w-4 h-4 mr-2" />
              Save Service Tag
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Service
                </th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">
                  Skill
                </th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">
                  Preferred
                </th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-sm text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {serviceTags.map((tag) => (
                <tr key={tag.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {tag.service_name || '-'}
                    </p>
                    <p className="text-xs text-slate-500">{tag.notes || '-'}</p>
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-slate-600 capitalize">
                    {tag.skill_level}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-slate-600">
                    {tag.is_preferred ? 'Yes' : 'No'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        tag.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tag.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setServiceForm({
                            service_id: tag.service_id,
                            skill_level: tag.skill_level,
                            is_preferred: tag.is_preferred,
                            is_active: tag.is_active,
                            notes: tag.notes || ''
                          })
                        }
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (!window.confirm('Remove this service tag?')) return;
                          await associateServicesService.removeAssociateService(tag.id);
                          await loadServiceTags(selectedAssociateId);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {serviceTags.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No service tags for this associate yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Profession
                </th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Contact
                </th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-sm text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {associates.map((associate) => (
                <tr key={associate.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {associate.full_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {associate.title || '-'}
                    </p>
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600">
                    {associate.profession || '-'}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600">
                    {associate.contact_number || associate.email || '-'}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        associate.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {associate.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editAssociate(associate)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteAssociate(associate.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {associates.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No associates added yet.
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
