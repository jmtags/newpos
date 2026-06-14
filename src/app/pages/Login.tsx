import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Brain } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { supabase } from '../lib/supabaseClient';

interface LoginProps {
  onLogin: () => void | Promise<void>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSigningIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      await onLogin();
    } catch (error: any) {
      setError(error.message || 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }

    try {
      setSendingReset(true);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?type=recovery`
      });

      if (error) throw error;

      setMessage('Password reset email sent. Check your inbox.');
    } catch (error: any) {
      setError(error.message || 'Unable to send password reset email.');
    } finally {
      setSendingReset(false);
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
              <Brain className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Psyzygy Clinic POS</h1>
          <p className="text-sm text-slate-600 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            label="Email Address"
            placeholder="admin@psyzygyclinic.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input
            type="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-slate-300" />
              <span className="text-sm text-slate-600">Remember me</span>
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={sendingReset}
              className="text-sm text-teal-600 hover:text-teal-700"
            >
              {sendingReset ? 'Sending...' : 'Forgot password?'}
            </button>
          </div>

          {message && (
            <p className="text-sm text-green-700">
              {message}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          <p>Psyzygy Clinic © 2026</p>
          <p className="mt-1">Professional Mental Health Services</p>
        </div>
      </Card>
    </div>
  );
};
