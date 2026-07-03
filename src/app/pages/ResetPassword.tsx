import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { settingsService } from '../services/settingsService';
import { supabase } from '../lib/supabaseClient';
import { userService } from '../services/userService';

interface ResetPasswordProps {
  mode: 'recovery' | 'required' | 'change';
  onComplete: () => void | Promise<void>;
  onCancel?: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({
  mode,
  onComplete,
  onCancel
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const needsCurrentPassword = mode !== 'recovery';
  const title =
    mode === 'required'
      ? 'Change Temporary Password'
      : mode === 'change'
        ? 'Change Password'
        : 'Set New Password';
  const description =
    mode === 'required'
      ? 'For security, choose a new password before continuing.'
      : mode === 'change'
        ? 'Enter your current password and choose a new one.'
        : 'Enter a new password for your account.';

  useEffect(() => {
    const loadClinicLogo = async () => {
      try {
        const settings = await settingsService.getClinicSettings();
        setLogoUrl(settings?.logo_url || '');
      } catch (error) {
        console.error('Error loading clinic logo:', error);
      }
    };

    loadClinicLogo();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (needsCurrentPassword && !currentPassword) {
      setError('Enter your current password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (needsCurrentPassword && password === currentPassword) {
      setError('Your new password must be different from your current password.');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({
        password,
        ...(needsCurrentPassword ? { currentPassword } : {})
      });

      if (error) throw error;

      await userService.completePasswordChange();

      if (mode === 'recovery') {
        await supabase.auth.signOut({ scope: 'local' });
      }

      await onComplete();
    } catch (error: any) {
      setError(error.message || 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-green-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600 rounded-full mb-4 overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Clinic Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <KeyRound className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsCurrentPassword && (
            <Input
              type="password"
              label={mode === 'required' ? 'Temporary Password' : 'Current Password'}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          )}

          <Input
            type="password"
            label="New Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />

          <Input
            type="password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Saving...' : 'Update Password'}
            </Button>

            {mode === 'change' && onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
};
