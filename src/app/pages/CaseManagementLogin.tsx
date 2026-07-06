import React, { useEffect, useState } from 'react';
import { ArrowLeft, FolderKanban, ShieldCheck } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { supabase } from '../lib/supabaseClient';
import { settingsService } from '../services/settingsService';

interface CaseManagementLoginProps {
  onLogin: () => void | Promise<void>;
}

export const CaseManagementLogin: React.FC<CaseManagementLoginProps> = ({
  onLogin
}) => {
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
      } catch (loadError) {
        console.error('Error loading clinic logo:', loadError);
      }
    };

    loadClinicLogo();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSigningIn(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;
      await onLogin();
    } catch (signInError: any) {
      setError(signInError.message || 'Unable to sign in.');
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
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/casemanagement/login?type=recovery`
        });

      if (resetError) throw resetError;
      setMessage('Password reset email sent. Check your inbox.');
    } catch (resetError: any) {
      setError(resetError.message || 'Unable to send password reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef5f3] p-4">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="absolute -bottom-36 -right-24 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl" />

      <Card className="relative w-full max-w-md overflow-hidden border border-white/80 bg-white/90 p-0 shadow-[0_24px_80px_rgba(15,45,55,0.15)] backdrop-blur">
        <div className="border-b border-slate-100 bg-[#0b2138] px-8 py-7 text-white">
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            POS Operations
          </button>

          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-teal-500/20 ring-1 ring-teal-300/30">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Clinic Logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <FolderKanban className="h-7 w-7 text-teal-300" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                Psyzygy Clinic
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Case Management</h1>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
            <p>
              Secure workspace for case managers, assigned personnel, and
              authorized viewers.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              label="Email Address"
              placeholder="name@psyzygyclinic.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset}
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                {sendingReset ? 'Sending...' : 'Forgot password?'}
              </button>
            </div>

            {message && <p className="text-sm text-emerald-700">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={signingIn}>
              {signingIn ? 'Signing in...' : 'Enter Case Workspace'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};
