import { type FormEvent, useState } from 'react';
import { Avatar, Badge, Button, SectionTitle, Toast } from '@/components/ui-kit';
import { getCurrentTeacher, updateCurrentTeacherAccount } from '@/lib/mock-api';

function initialsFromName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'T';
}

export default function TeacherSettings() {
  const account = getCurrentTeacher();
  const email = account.email || '';
  const username = account.username || (email.includes('@') ? email.split('@')[0] : '');
  const [fullName, setFullName] = useState(account.fullName || account.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const save = (e: FormEvent) => {
    e.preventDefault();
    const nextName = fullName.trim();
    if (nextName.length < 2) { setError('Enter your display name.'); return; }

    const latest = getCurrentTeacher();
    const patch: { fullName: string; password?: string } = { fullName: nextName };
    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword) { setError('Enter your current password to change it.'); return; }
      if (currentPassword !== (latest.password || '')) { setError('Current password is incorrect.'); return; }
      if (newPassword.length < 6) { setError('New password must be at least 6 characters.'); return; }
      if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
      if (newPassword === currentPassword) { setError('Choose a new password that is different from your current one.'); return; }
      patch.password = newPassword;
    }

    const saved = updateCurrentTeacherAccount(patch);
    if (!saved) { setError('Could not save your account.'); return; }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setToast(patch.password
      ? 'Name and password saved. Use the new password next time you sign in.'
      : 'Your display name has been saved.');
  };

  return (
    <>
      <SectionTitle
        eyebrow="Your account"
        title="Settings"
        description="Update the name shown in your workspace, or change the password you use to sign in."
      />
      <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
        <div className="card flex flex-col items-center p-8 text-center">
          <Avatar initials={initialsFromName(fullName || 'Teacher')} size="lg" tone="amber" />
          <h2 className="mt-4 font-display text-xl font-bold">{fullName || 'Teacher'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{email || username}</p>
          <Badge tone="amber">Teacher workspace</Badge>
          <div className="mt-7 w-full border-t border-border pt-5 text-left text-sm">
            <div className="flex justify-between gap-4 py-2"><span className="text-muted-foreground">Campus</span><strong className="text-right">{account.branchName || '—'}</strong></div>
            <div className="flex justify-between gap-4 py-2"><span className="text-muted-foreground">Username</span><strong className="text-right">@{username || '—'}</strong></div>
            <div className="flex justify-between gap-4 py-2"><span className="text-muted-foreground">Batches</span><strong className="text-right">{account.batches || '—'}</strong></div>
          </div>
        </div>
        <form className="card p-6 sm:p-8" onSubmit={save}>
          <div className="eyebrow">Personal details</div>
          <h2 className="mt-1 font-display text-xl font-bold">Name and password</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your login email is set by the campus. You can change your display name and password here.</p>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-semibold">Display name
              <input
                data-testid="input-teacher-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
                className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold">Login email
              <input value={email} readOnly className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground" />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">You can also sign in with your username. Email cannot be changed here.</span>
            </label>
            <label className="block text-sm font-semibold">Current password
              <input
                data-testid="input-teacher-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold">New password
              <input
                data-testid="input-teacher-new-password"
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
                data-testid="input-teacher-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
              />
            </label>
          </div>
          {error && <p className="mt-4 text-sm text-red-700" data-testid="teacher-settings-error">{error}</p>}
          <Button type="submit" className="mt-7">Save changes</Button>
        </form>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
