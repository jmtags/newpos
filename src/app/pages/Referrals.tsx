import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { referralService } from '../services/referralService';
import { Plus, Pencil, Trash2, Share2 } from 'lucide-react';

export const Referrals: React.FC = () => {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    id: '',
    referral_name: '',
    referral_type: '',
    contact_person: '',
    contact_number: '',
    email: '',
    address: '',
    is_active: true,
    notes: ''
  });

  const loadReferrals = async () => {
    const data = await referralService.getReferrals();
    setReferrals(data);
  };

  useEffect(() => {
    loadReferrals();
  }, []);

  const resetForm = () => {
    setForm({
      id: '',
      referral_name: '',
      referral_type: '',
      contact_person: '',
      contact_number: '',
      email: '',
      address: '',
      is_active: true,
      notes: ''
    });
    setEditing(false);
  };

  const saveReferral = async () => {
    if (!form.referral_name.trim()) {
      alert('Please enter referral name.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        referral_name: form.referral_name,
        referral_type: form.referral_type,
        contact_person: form.contact_person,
        contact_number: form.contact_number,
        email: form.email,
        address: form.address,
        is_active: form.is_active,
        notes: form.notes
      };

      if (editing) {
        await referralService.updateReferral(form.id, payload);
      } else {
        await referralService.addReferral(payload);
      }

      resetForm();
      await loadReferrals();
    } catch (error: any) {
      alert(`Error saving referral: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editReferral = (referral: any) => {
    setForm({
      id: referral.id,
      referral_name: referral.referral_name || '',
      referral_type: referral.referral_type || '',
      contact_person: referral.contact_person || '',
      contact_number: referral.contact_number || '',
      email: referral.email || '',
      address: referral.address || '',
      is_active: referral.is_active,
      notes: referral.notes || ''
    });
    setEditing(true);
  };

  const deleteReferral = async (id: string) => {
    if (!window.confirm('Delete this referral source?')) return;

    try {
      await referralService.deleteReferral(id);
      await loadReferrals();
    } catch (error: any) {
      alert(`Error deleting referral: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Referrals
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage referral sources such as doctors, schools, companies, agencies,
          and walk-in sources.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Share2 className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            {editing ? 'Edit Referral' : 'Add Referral'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Referral Name"
            placeholder="Example: Dr. Cruz / ABC School / Walk-in"
            value={form.referral_name}
            onChange={(e) =>
              setForm({ ...form, referral_name: e.target.value })
            }
          />

          <Input
            label="Referral Type"
            placeholder="Doctor, School, Company, Agency, Walk-in"
            value={form.referral_type}
            onChange={(e) =>
              setForm({ ...form, referral_type: e.target.value })
            }
          />

          <Input
            label="Contact Person"
            value={form.contact_person}
            onChange={(e) =>
              setForm({ ...form, contact_person: e.target.value })
            }
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
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
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
          <Button onClick={saveReferral} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : editing ? 'Update Referral' : 'Add Referral'}
          </Button>

          {editing && (
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
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Referral
                </th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">
                  Type
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
              {referrals.map((referral) => (
                <tr key={referral.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {referral.referral_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {referral.contact_person || '-'}
                    </p>
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600">
                    {referral.referral_type || '-'}
                  </td>

                  <td className="py-3 px-4 text-sm text-slate-600">
                    {referral.contact_number || referral.email || '-'}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        referral.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {referral.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editReferral(referral)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteReferral(referral.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {referrals.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No referrals added yet.
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