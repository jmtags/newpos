import React, { useState, useMemo } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { useAppContext, Client } from '../context/AppContext';
import { Plus, Search, Edit, Eye } from 'lucide-react';

export const Clients: React.FC = () => {
  const { clients, addClient, updateClient } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [formData, setFormData] = useState({
    client_code: '',
    full_name: '',
    birthdate: '',
    age: 0,
    sex: 'Male' as 'Male' | 'Female' | 'Other',
    contact_number: '',
    email: '',
    address: '',
    emergency_contact: '',
    notes: '',
    consent_status: true,
    privacy_acknowledged: true
  });

  const filteredClients = useMemo(() => {
    return clients.filter(
      client =>
        client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contact_number.includes(searchTerm) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.client_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);

  const handleOpenAddModal = () => {
    setFormData({
      client_code: '',
      full_name: '',
      birthdate: '',
      age: 0,
      sex: 'Male',
      contact_number: '',
      email: '',
      address: '',
      emergency_contact: '',
      notes: '',
      consent_status: true,
      privacy_acknowledged: true
    });
    setIsEditMode(false);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (client: Client) => {
    setFormData({
      client_code: client.client_code,
      full_name: client.full_name,
      birthdate: client.birthdate,
      age: client.age,
      sex: client.sex,
      contact_number: client.contact_number,
      email: client.email,
      address: client.address,
      emergency_contact: client.emergency_contact,
      notes: client.notes,
      consent_status: client.consent_status,
      privacy_acknowledged: client.privacy_acknowledged
    });
    setSelectedClient(client);
    setIsEditMode(true);
    setShowAddModal(true);
  };

  const handleSaveClient = () => {
    const age = formData.birthdate
      ? new Date().getFullYear() - new Date(formData.birthdate).getFullYear()
      : 0;

    if (isEditMode && selectedClient) {
      updateClient(selectedClient.id, { ...formData, age });
    } else {
      addClient({
        ...formData,
        client_code: `CLT-${String(clients.length + 1).padStart(3, '0')}`,
        age
      });
    }

    setShowAddModal(false);
    setSelectedClient(null);
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setShowViewModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by name, contact, email, or client ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <Button onClick={handleOpenAddModal}>
          <Plus className="w-4 h-4 mr-2" />
          Add New Client
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Client ID
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Full Name
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Age / Sex
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Contact
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">
                  Email
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => (
                <tr key={client.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm text-slate-900">
                    {client.client_code}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">
                    {client.full_name}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {client.age} / {client.sex}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {client.contact_number}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{client.email}</td>
                  <td className="py-3 px-4 text-center">
                    {client.consent_status && client.privacy_acknowledged ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewClient(client)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(client)}
                        className="p-1 text-teal-600 hover:bg-teal-50 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredClients.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No clients found matching your search.
          </div>
        )}
      </Card>

      {/* Add/Edit Client Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={isEditMode ? 'Edit Client' : 'Add New Client'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name *"
              value={formData.full_name}
              onChange={e => setFormData({ ...formData, full_name: e.target.value })}
            />
            <Input
              type="date"
              label="Date of Birth"
              value={formData.birthdate}
              onChange={e => setFormData({ ...formData, birthdate: e.target.value })}
            />
            <Select
              label="Sex"
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' }
              ]}
              value={formData.sex}
              onChange={e =>
                setFormData({ ...formData, sex: e.target.value as 'Male' | 'Female' | 'Other' })
              }
            />
            <Input
              label="Contact Number *"
              value={formData.contact_number}
              onChange={e => setFormData({ ...formData, contact_number: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Emergency Contact"
              placeholder="Name - Contact Number"
              value={formData.emergency_contact}
              onChange={e => setFormData({ ...formData, emergency_contact: e.target.value })}
            />
          </div>
          <Input
            label="Address"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
          <Input
            label="Notes"
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.consent_status}
                onChange={e => setFormData({ ...formData, consent_status: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Consent Signed</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.privacy_acknowledged}
                onChange={e =>
                  setFormData({ ...formData, privacy_acknowledged: e.target.checked })
                }
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Privacy Notice Acknowledged</span>
            </label>
          </div>
          <Button onClick={handleSaveClient} className="w-full">
            {isEditMode ? 'Update Client' : 'Add Client'}
          </Button>
        </div>
      </Modal>

      {/* View Client Modal */}
      {selectedClient && (
        <Modal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          title="Client Details"
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600">Client ID</p>
                <p className="font-medium">{selectedClient.client_code}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Full Name</p>
                <p className="font-medium">{selectedClient.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Date of Birth</p>
                <p className="font-medium">
                  {new Date(selectedClient.birthdate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Age / Sex</p>
                <p className="font-medium">
                  {selectedClient.age} / {selectedClient.sex}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Contact Number</p>
                <p className="font-medium">{selectedClient.contact_number}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Email</p>
                <p className="font-medium">{selectedClient.email}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-600">Address</p>
              <p className="font-medium">{selectedClient.address}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Emergency Contact</p>
              <p className="font-medium">{selectedClient.emergency_contact}</p>
            </div>
            {selectedClient.notes && (
              <div>
                <p className="text-sm text-slate-600">Notes</p>
                <p className="font-medium">{selectedClient.notes}</p>
              </div>
            )}
            <div className="flex gap-4">
              <Badge variant={selectedClient.consent_status ? 'success' : 'danger'}>
                Consent: {selectedClient.consent_status ? 'Signed' : 'Not Signed'}
              </Badge>
              <Badge variant={selectedClient.privacy_acknowledged ? 'success' : 'danger'}>
                Privacy: {selectedClient.privacy_acknowledged ? 'Acknowledged' : 'Pending'}
              </Badge>
            </div>
            <Button variant="outline" onClick={() => handleOpenEditModal(selectedClient)} className="w-full">
              <Edit className="w-4 h-4 mr-2" />
              Edit Client
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
