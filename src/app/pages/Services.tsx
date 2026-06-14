import React, { useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { useAppContext, Service } from '../context/AppContext';
import { Plus, Edit, Archive } from 'lucide-react';

export const Services: React.FC = () => {
  const { services, addService, updateService } = useAppContext();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [serviceToArchive, setServiceToArchive] = useState<Service | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'Consultation',
    description: '',
    default_price: 0,
    duration_minutes: 60,
    is_active: true
  });

  const categories = [
    { value: 'Consultation', label: 'Consultation' },
    { value: 'Therapy', label: 'Therapy' },
    { value: 'Assessment', label: 'Assessment' },
    { value: 'Documentation', label: 'Documentation' },
    { value: 'Group', label: 'Group' },
    { value: 'Other', label: 'Other' }
  ];

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      category: 'Consultation',
      description: '',
      default_price: 0,
      duration_minutes: 60,
      is_active: true
    });
    setIsEditMode(false);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (service: Service) => {
    setFormData({
      name: service.name,
      category: service.category,
      description: service.description,
      default_price: service.default_price,
      duration_minutes: service.duration_minutes,
      is_active: service.is_active
    });
    setSelectedService(service);
    setIsEditMode(true);
    setShowAddModal(true);
  };

  const handleSaveService = () => {
    if (isEditMode && selectedService) {
      updateService(selectedService.id, formData);
    } else {
      addService(formData);
    }
    setShowAddModal(false);
    setSelectedService(null);
  };

  const handleArchiveService = (service: Service) => {
    updateService(service.id, { is_active: !service.is_active });
  };

  const handleConfirmArchiveService = () => {
    if (!serviceToArchive) return;

    handleArchiveService(serviceToArchive);
    setServiceToArchive(null);
  };

  const activeServices = services.filter(s => s.is_active);
  const archivedServices = services.filter(s => !s.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-slate-900">Services Management</h2>
        <Button onClick={handleOpenAddModal}>
          <Plus className="w-4 h-4 mr-2" />
          Add Service
        </Button>
      </div>

      {/* Active Services */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Active Services</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeServices.map(service => (
            <Card key={service.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="info">{service.category}</Badge>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenEditModal(service)}
                    className="p-1 text-teal-600 hover:bg-teal-50 rounded"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setServiceToArchive(service)}
                    className="p-1 text-slate-600 hover:bg-slate-50 rounded"
                    aria-label={`Archive ${service.name}`}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h4 className="font-semibold text-slate-900 mb-2">{service.name}</h4>
              <p className="text-sm text-slate-600 mb-3">{service.description}</p>
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-teal-600">
                  ₱{service.default_price.toLocaleString()}
                </span>
                <span className="text-slate-500">{service.duration_minutes} mins</span>
              </div>
            </Card>
          ))}
        </div>
        {activeServices.length === 0 && (
          <Card className="p-8">
            <p className="text-center text-slate-500">No active services found.</p>
          </Card>
        )}
      </div>

      {/* Archived Services */}
      {archivedServices.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Archived Services</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedServices.map(service => (
              <Card key={service.id} className="p-4 opacity-60">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="default">{service.category}</Badge>
                  <button
                    onClick={() => handleArchiveService(service)}
                    className="p-1 text-teal-600 hover:bg-teal-50 rounded text-xs"
                  >
                    Restore
                  </button>
                </div>
                <h4 className="font-semibold text-slate-900 mb-2">{service.name}</h4>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-600">
                    ₱{service.default_price.toLocaleString()}
                  </span>
                  <span className="text-slate-500">{service.duration_minutes} mins</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={isEditMode ? 'Edit Service' : 'Add New Service'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Service Name *"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <Select
            label="Category"
            options={categories}
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value })}
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
          <Input
            type="number"
            label="Default Price (₱)"
            value={formData.default_price || ''}
            onChange={e =>
              setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 })
            }
          />
          <Input
            type="number"
            label="Duration (minutes)"
            value={formData.duration_minutes || ''}
            onChange={e =>
              setFormData({
                ...formData,
                duration_minutes: parseInt(e.target.value) || 60
              })
            }
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>
          <Button onClick={handleSaveService} className="w-full">
            {isEditMode ? 'Update Service' : 'Add Service'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(serviceToArchive)}
        onClose={() => setServiceToArchive(null)}
        title="Archive Service?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to archive{' '}
            <span className="font-semibold text-slate-900">
              {serviceToArchive?.name}
            </span>
            ? It will be hidden from active service lists, but you can restore it later.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setServiceToArchive(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmArchiveService}
            >
              Archive Service
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
