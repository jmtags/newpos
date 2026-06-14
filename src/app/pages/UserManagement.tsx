import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Pencil, Search, Trash2, UserCog } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabaseClient';
import { roleLabels } from '../lib/accessControl';
import { userService, AppUser, UserRole } from '../services/userService';

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'case_staff', label: 'Case Staff' },
  { value: 'associate_user', label: 'Associate User' },
  { value: 'case_viewer', label: 'Case Viewer' },
  { value: 'regular_user', label: 'Regular User' }
];

const roleBadgeVariants: Record<UserRole, 'danger' | 'info' | 'default'> = {
  admin: 'danger',
  manager: 'info',
  case_staff: 'info',
  associate_user: 'default',
  case_viewer: 'default',
  regular_user: 'default'
};

const emptyForm = {
  id: '',
  full_name: '',
  email: '',
  role: 'regular_user' as UserRole,
  is_active: true
};

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [form, setForm] = useState(emptyForm);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await userService.getUsers();
      setUsers(data as AppUser[]);
    } catch (error: any) {
      alert(`Error loading users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        user.full_name?.toLowerCase().includes(normalizedSearch) ||
        user.email?.toLowerCase().includes(normalizedSearch);

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [roleFilter, searchTerm, users]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(false);
  };

  const saveUser = async () => {
    if (!form.full_name.trim()) {
      alert('Please enter the user name.');
      return;
    }

    if (!form.email.trim()) {
      alert('Please enter the user email.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        is_active: form.is_active
      };

      if (editing) {
        await userService.updateUser(form.id, payload);
      } else {
        await userService.addUser(payload);
        await sendPasswordReset(payload.email);
      }

      resetForm();
      await loadUsers();
    } catch (error: any) {
      alert(`Error saving user: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editUser = (user: AppUser) => {
    setForm({
      id: user.id,
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role || 'regular_user',
      is_active: user.is_active
    });
    setEditing(true);
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm('Delete this user?')) return;

    try {
      await userService.deleteUser(id);
      await loadUsers();
      if (form.id === id) resetForm();
    } catch (error: any) {
      alert(`Error deleting user: ${error.message}`);
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?type=recovery`
      });

      if (error) throw error;

      alert(`Password reset email sent to ${email}.`);
    } catch (error: any) {
      alert(`Error sending password reset: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          User Management
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage app access for clinic, case, and associate users.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <UserCog className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            {editing ? 'Edit User' : 'Add User'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />

          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <Select
            label="Role"
            options={roleOptions}
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as UserRole })
            }
          />

          <label className="flex items-center gap-3 md:mt-7">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <Button onClick={saveUser} disabled={saving}>
            <Plus className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : editing ? 'Update User' : 'Add User'}
          </Button>

          {editing && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full sm:w-52 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All roles</option>
          {roleOptions.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  User
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Role
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>

                  <td className="py-3 px-4 text-center">
                    <Badge variant={roleBadgeVariants[user.role] || 'default'}>
                      {roleLabels[user.role] || 'Regular User'}
                    </Badge>
                  </td>

                  <td className="py-3 px-4 text-center">
                    <Badge variant={user.is_active ? 'success' : 'default'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editUser(user)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendPasswordReset(user.email)}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteUser(user.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    Loading users...
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
