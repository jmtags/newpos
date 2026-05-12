import React, { useEffect, useState } from 'react';
import {
  Building2,
  FileText,
  CreditCard,
  Shield,
  Percent,
  Plus,
  Pencil,
  Trash2,
  Save,
  Image as ImageIcon
} from 'lucide-react';

import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { settingsService } from '../services/settingsService';

const taxTypeOptions = [
  { value: 'NON_VAT', label: 'NON-VAT' },
  { value: 'VAT', label: 'VAT' },
  { value: 'NONE', label: 'No Tax' }
];

export const Settings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clinicSettings, setClinicSettings] = useState<any>({
    id: '',
    clinic_name: '',
    address: '',
    contact_number: '',
    email: '',
    website: '',
    logo_url: '',
    receipt_footer: '',
    show_logo: true,
    include_terms: true,
    privacy_notice: '',
    tax_enabled: true,
    tax_type: 'NON_VAT',
    tax_rate: 12,
    tax_inclusive: true,
    bir_registered: false,
    tin_number: ''
  });

  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [discountTypes, setDiscountTypes] = useState<any[]>([]);

  const [paymentForm, setPaymentForm] = useState({
    id: '',
    name: '',
    is_active: true
  });

  const [discountForm, setDiscountForm] = useState({
    id: '',
    name: '',
    percentage: '',
    fixed_amount: '',
    is_active: true
  });

  const [editingPayment, setEditingPayment] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);

      const [clinicData, methodsData, discountsData] = await Promise.all([
        settingsService.getClinicSettings(),
        settingsService.getPaymentMethods(),
        settingsService.getDiscountTypes()
      ]);

      setClinicSettings(clinicData);
      setPaymentMethods(methodsData);
      setDiscountTypes(discountsData);
    } catch (error: any) {
      console.error('Error loading settings:', error);
      alert(`Error loading settings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setClinicSettings({
        ...clinicSettings,
        logo_url: reader.result as string
      });
    };

    reader.readAsDataURL(file);
  };

  const saveClinicSettings = async () => {
    try {
      setSaving(true);

      await settingsService.updateClinicSettings(clinicSettings.id, {
        clinic_name: clinicSettings.clinic_name,
        address: clinicSettings.address,
        contact_number: clinicSettings.contact_number,
        email: clinicSettings.email,
        website: clinicSettings.website,
        logo_url: clinicSettings.logo_url,
        receipt_footer: clinicSettings.receipt_footer,
        show_logo: clinicSettings.show_logo,
        include_terms: clinicSettings.include_terms,
        privacy_notice: clinicSettings.privacy_notice,
        tax_enabled: Boolean(clinicSettings.tax_enabled),
        tax_type: clinicSettings.tax_type || 'NON_VAT',
        tax_rate: Number(clinicSettings.tax_rate || 0),
        tax_inclusive: Boolean(clinicSettings.tax_inclusive),
        bir_registered: Boolean(clinicSettings.bir_registered),
        tin_number: clinicSettings.tin_number || null
      });

      alert('Clinic settings saved successfully.');
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving clinic settings:', error);
      alert(`Error saving clinic settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      id: '',
      name: '',
      is_active: true
    });
    setEditingPayment(false);
  };

  const savePaymentMethod = async () => {
    if (!paymentForm.name.trim()) {
      alert('Please enter payment method name.');
      return;
    }

    try {
      setSaving(true);

      if (editingPayment) {
        await settingsService.updatePaymentMethod(paymentForm.id, {
          name: paymentForm.name,
          is_active: paymentForm.is_active
        });
      } else {
        await settingsService.addPaymentMethod({
          name: paymentForm.name,
          is_active: paymentForm.is_active
        });
      }

      resetPaymentForm();
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving payment method:', error);
      alert(`Error saving payment method: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editPaymentMethod = (method: any) => {
    setPaymentForm({
      id: method.id,
      name: method.name,
      is_active: method.is_active
    });
    setEditingPayment(true);
  };

  const deletePaymentMethod = async (id: string) => {
    const confirmDelete = window.confirm(
      'Delete this payment method? You may also deactivate it instead.'
    );

    if (!confirmDelete) return;

    try {
      await settingsService.deletePaymentMethod(id);
      await loadSettings();
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      alert(`Error deleting payment method: ${error.message}`);
    }
  };

  const resetDiscountForm = () => {
    setDiscountForm({
      id: '',
      name: '',
      percentage: '',
      fixed_amount: '',
      is_active: true
    });
    setEditingDiscount(false);
  };

  const saveDiscountType = async () => {
    if (!discountForm.name.trim()) {
      alert('Please enter discount type name.');
      return;
    }

    try {
      setSaving(true);

      const discountData = {
        name: discountForm.name,
        percentage: discountForm.percentage
          ? Number(discountForm.percentage)
          : null,
        fixed_amount: discountForm.fixed_amount
          ? Number(discountForm.fixed_amount)
          : null,
        is_active: discountForm.is_active
      };

      if (editingDiscount) {
        await settingsService.updateDiscountType(discountForm.id, discountData);
      } else {
        await settingsService.addDiscountType(discountData);
      }

      resetDiscountForm();
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving discount type:', error);
      alert(`Error saving discount type: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editDiscountType = (discount: any) => {
    setDiscountForm({
      id: discount.id,
      name: discount.name,
      percentage: discount.percentage ? String(discount.percentage) : '',
      fixed_amount: discount.fixed_amount ? String(discount.fixed_amount) : '',
      is_active: discount.is_active
    });
    setEditingDiscount(true);
  };

  const deleteDiscountType = async (id: string) => {
    const confirmDelete = window.confirm(
      'Delete this discount type? You may also deactivate it instead.'
    );

    if (!confirmDelete) return;

    try {
      await settingsService.deleteDiscountType(id);
      await loadSettings();
    } catch (error: any) {
      console.error('Error deleting discount type:', error);
      alert(`Error deleting discount type: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>
        <Card className="p-6">
          <p className="text-slate-600">Loading settings...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage clinic profile, receipt details, payment methods, discounts,
          and privacy notice.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Building2 className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Clinic Profile
          </h3>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-48">
            <div className="w-40 h-40 border border-slate-200 rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden">
              {clinicSettings.logo_url ? (
                <img
                  src={clinicSettings.logo_url}
                  alt="Clinic Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-12 h-12 text-slate-400" />
              )}
            </div>

            <label className="inline-flex items-center justify-center mt-3 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer">
              Upload Logo
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Clinic Name"
              value={clinicSettings.clinic_name || ''}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  clinic_name: e.target.value
                })
              }
            />

            <Input
              label="Contact Number"
              value={clinicSettings.contact_number || ''}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  contact_number: e.target.value
                })
              }
            />

            <Input
              label="Email"
              value={clinicSettings.email || ''}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  email: e.target.value
                })
              }
            />

            <Input
              label="Website"
              value={clinicSettings.website || ''}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  website: e.target.value
                })
              }
            />

            <div className="md:col-span-2">
              <Input
                label="Address"
                value={clinicSettings.address || ''}
                onChange={(e) =>
                  setClinicSettings({
                    ...clinicSettings,
                    address: e.target.value
                  })
                }
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <FileText className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Receipt Settings
          </h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(clinicSettings.show_logo)}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  show_logo: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              Show clinic logo on receipt
            </span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(clinicSettings.include_terms)}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  include_terms: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              Include terms and conditions on receipt
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Receipt Footer Note
            </label>
            <textarea
              value={clinicSettings.receipt_footer || ''}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  receipt_footer: e.target.value
                })
              }
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Percent className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Philippine Tax Configuration
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={Boolean(clinicSettings.tax_enabled)}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  tax_enabled: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Enable tax handling</span>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={Boolean(clinicSettings.tax_inclusive)}
              disabled={clinicSettings.tax_type !== 'VAT'}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  tax_inclusive: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">VAT inclusive pricing</span>
          </label>

          <Select
            label="Tax Type"
            options={taxTypeOptions}
            value={clinicSettings.tax_type || 'NON_VAT'}
            onChange={(e) =>
              setClinicSettings({
                ...clinicSettings,
                tax_type: e.target.value,
                tax_inclusive:
                  e.target.value === 'VAT'
                    ? clinicSettings.tax_inclusive
                    : true
              })
            }
          />

          <Input
            type="number"
            label="Tax Rate (%)"
            min="0"
            step="0.01"
            value={clinicSettings.tax_rate ?? 12}
            disabled={clinicSettings.tax_type !== 'VAT'}
            onChange={(e) =>
              setClinicSettings({
                ...clinicSettings,
                tax_rate: Number(e.target.value) || 0
              })
            }
          />

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={Boolean(clinicSettings.bir_registered)}
              onChange={(e) =>
                setClinicSettings({
                  ...clinicSettings,
                  bir_registered: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">BIR registered</span>
          </label>

          <Input
            label="TIN Number"
            placeholder="000-000-000-000"
            value={clinicSettings.tin_number || ''}
            onChange={(e) =>
              setClinicSettings({
                ...clinicSettings,
                tin_number: e.target.value
              })
            }
          />

          <div className="md:col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
            VAT defaults to 12%. NON-VAT mode keeps tax at zero and prints
            NON-VAT REGISTERED / VAT-EXEMPT SALE on receipts.
          </div>
        </div>

        <Button className="mt-4" onClick={saveClinicSettings} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Tax Settings'}
        </Button>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Shield className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Data Privacy Notice
          </h3>
        </div>

        <textarea
          value={clinicSettings.privacy_notice || ''}
          onChange={(e) =>
            setClinicSettings({
              ...clinicSettings,
              privacy_notice: e.target.value
            })
          }
          rows={6}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <Button
          className="mt-4"
          onClick={saveClinicSettings}
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Clinic, Receipt, Tax & Privacy Settings'}
        </Button>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <CreditCard className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Payment Methods
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <Input
            label="Payment Method Name"
            value={paymentForm.name}
            onChange={(e) =>
              setPaymentForm({
                ...paymentForm,
                name: e.target.value
              })
            }
          />

          <label className="flex items-center gap-3 mt-6">
            <input
              type="checkbox"
              checked={paymentForm.is_active}
              onChange={(e) =>
                setPaymentForm({
                  ...paymentForm,
                  is_active: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="flex items-end gap-2">
            <Button onClick={savePaymentMethod} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              {editingPayment ? 'Update' : 'Add'}
            </Button>

            {editingPayment && (
              <Button variant="outline" onClick={resetPaymentForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Method
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((method) => (
                <tr key={method.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {method.name}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        method.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {method.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editPaymentMethod(method)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deletePaymentMethod(method.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {paymentMethods.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="py-5 text-center text-sm text-slate-500"
                  >
                    No payment methods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Percent className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Discount Types
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5">
          <Input
            label="Discount Name"
            value={discountForm.name}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                name: e.target.value
              })
            }
          />

          <Input
            label="Percentage"
            type="number"
            value={discountForm.percentage}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                percentage: e.target.value
              })
            }
          />

          <Input
            label="Fixed Amount"
            type="number"
            value={discountForm.fixed_amount}
            onChange={(e) =>
              setDiscountForm({
                ...discountForm,
                fixed_amount: e.target.value
              })
            }
          />

          <label className="flex items-center gap-3 mt-6">
            <input
              type="checkbox"
              checked={discountForm.is_active}
              onChange={(e) =>
                setDiscountForm({
                  ...discountForm,
                  is_active: e.target.checked
                })
              }
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Active</span>
          </label>

          <div className="flex items-end gap-2">
            <Button onClick={saveDiscountType} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              {editingDiscount ? 'Update' : 'Add'}
            </Button>

            {editingDiscount && (
              <Button variant="outline" onClick={resetDiscountForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-2 text-sm font-medium text-slate-600">
                  Discount
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Percentage
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Fixed Amount
                </th>
                <th className="text-center py-3 px-2 text-sm font-medium text-slate-600">
                  Status
                </th>
                <th className="text-right py-3 px-2 text-sm font-medium text-slate-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {discountTypes.map((discount) => (
                <tr key={discount.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 text-sm text-slate-900">
                    {discount.name}
                  </td>
                  <td className="py-3 px-2 text-sm text-center text-slate-600">
                    {discount.percentage ? `${discount.percentage}%` : '-'}
                  </td>
                  <td className="py-3 px-2 text-sm text-center text-slate-600">
                    {discount.fixed_amount
                      ? `₱${Number(discount.fixed_amount).toLocaleString()}`
                      : '-'}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        discount.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {discount.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editDiscountType(discount)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteDiscountType(discount.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {discountTypes.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-5 text-center text-sm text-slate-500"
                  >
                    No discount types yet.
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
