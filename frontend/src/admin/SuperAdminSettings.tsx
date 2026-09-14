import { type FormEvent, useState } from 'react';
import { Avatar, Badge, Button, SectionTitle, Toast } from '@/components/ui-kit';
import {
  getCurrentSuperAdmin,
  getLmsPreferences,
  saveLmsPreferences,
  updateCurrentSuperAdminAccount,
} from '@/lib/mock-api';

function initialsFromName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'SA';
}

const BAND_OPTIONS = ['6.5', '7.0', '7.5'];

export default function SuperAdminSettings() {
  const account = getCurrentSuperAdmin();
  const prefs = getLmsPreferences();
  const [academyName, setAcademyName] = useState(prefs.academyName);
  const [targetBand, setTargetBand] = useState(prefs.targetBand);
  const [fullName, setFullName] = useState(account.fullName || account.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [prefsError, setPrefsError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [toast, setToast] = useState('');

  const savePrefs = (e: FormEvent) => {
    e.preventDefault();
    const nextName = academyName.trim();
    if (nextName.length < 2) { setPrefsError('Enter an academy name.'); return; }
    if (!BAND_OPTIONS.includes(targetBand)) { setPrefsError('Pick a default target band.'); return; }
    const saved = saveLmsPreferences({ academyName: nextName, targetBand });
    if (!saved) { setPrefsError('Could not save LMS preferences.'); return; }
    setAcademyName(saved.academyName);
    setPrefsError('');
    setToast('LMS preferences saved.');
  };

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    const nextName = fullName.trim();
    if (nextName.length < 2) { setProfileError('Enter your display name.'); return; }

    const latest = getCurrentSuperAdmin();
    const patch: { fullName: string; password?: string } = { fullName: nextName };
    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword) { setProfileError('Enter your current password to change it.'); return; }
      if (currentPassword !== (latest.password || '')) { setProfileError('Current password is incorrect.'); return; }
      if (newPassword.length < 6) { setProfileError('New password must be at least 6 characters.'); return; }
      if (newPassword !== confirmPassword) { setProfileError('Passwords do not match.'); return; }
      if (newPassword === currentPassword) { setProfileError('Choose a new password that is different from your current one.'); return; }
      patch.password = newPassword;
    }

    const saved = updateCurrentSuperAdminAccount(patch);
    if (!saved) { setProfileError('Could not save your account.'); return; }
    setFullName(saved.fullName);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setProfileError('');
    setToast(patch.password
      ? 'Name and password saved. Use the new password next time you sign in.'
      : 'Your display name has been saved.');
  };

  return (
    <>
      <SectionTitle
        eyebrow="Super Admin"
        title="Settings"
        description="Network-wide LMS preferences."
      />
      <div className="grid max-w-xl gap-6">
        <form className="card space-y-4 p-6" onSubmit={savePrefs}>
          <label className="block text-sm font-semibold">Academy name
            <input
              data-testid="input-academy-name"
              value={academyName}
              onChange={(e) => setAcademyName(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold">Default target band
            <select
              data-testid="select-target-band"
              value={targetBand}
              onChange={(e) => setTargetBand(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm"
            >
              {BAND_OPTIONS.map((band) => <option key={band} value={band}>{band}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">AI scores stay labelled as estimated practice bands, never official IELTS.</p>
          {prefsError && <p className="text-sm text-red-700" data-testid="lms-prefs-error">{prefsError}</p>}
          <Button type="submit">Save settings</Button>
        </form>

        <form className="card space-y-4 p-6" onSubmit={saveProfile}>
          <div className="flex items-start gap-4">
            <Avatar initials={initialsFromName(fullName || 'Super Admin')} size="sm" tone="amber" />
            <div className="min-w-0">
              <div className="eyebrow">Your account</div>
              <h2 className="mt-1 font-display text-lg font-bold">Name and password</h2>
              <p className="mt-1 text-sm text-muted-foreground">Change the name shown in the sidebar, or the password you use to sign in.</p>
              <div className="mt-2"><Badge>Super Admin</Badge></div>
            </div>
          </div>
          <label className="block text-sm font-semibold">Display name
            <input
              data-testid="input-super-admin-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold">Username
            <input
              value={account.username}
              readOnly
              className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">You sign in with this username. It cannot be changed here.</span>
          </label>
          <label className="block text-sm font-semibold">Current password
            <input
              data-testid="input-super-admin-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold">New password
            <input
              data-testid="input-super-admin-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">At least 6 characters. Leave blank to keep your current password.</span>
          </label>
          <label className="block text-sm font-semibold">Confirm new password
            <input
              data-testid="input-super-admin-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
          </label>
          {profileError && <p className="text-sm text-red-700" data-testid="super-admin-settings-error">{profileError}</p>}
          <Button type="submit">Save profile</Button>
        </form>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
