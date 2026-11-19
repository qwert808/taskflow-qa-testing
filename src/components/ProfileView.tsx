import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, authApi } from '../lib/api';
import { validatePasswordChangeInput, validateProfileInput } from '../lib/validation';
import type { UserProfile } from '../lib/types';

interface ProfileViewProps {
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
}

export function ProfileView({ user, onUserUpdated }: ProfileViewProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors({});
    setProfileMessage('');
    setProfileError('');

    const validation = validateProfileInput({ name, email });
    if (!validation.valid || !validation.data) {
      setProfileErrors(validation.errors);
      return;
    }

    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile(validation.data);
      onUserUpdated(res.user);
      setProfileMessage('Profile details updated.');
    } catch (err) {
      if (err instanceof ApiError) {
        setProfileError(err.message);
        if (err.details) setProfileErrors(err.details);
      } else {
        setProfileError('Failed to save profile changes.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});
    setPasswordMessage('');
    setPasswordError('');

    const validation = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!validation.valid) {
      setPasswordErrors(validation.errors);
      return;
    }

    setSavingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed successfully.');
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
        if (err.details) setPasswordErrors(err.details);
      } else {
        setPasswordError('Failed to change password.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Account Metadata Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">Account Overview</h2>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500">User ID</dt>
            <dd className="mt-1 font-mono font-medium text-slate-900 tabular-nums">#{user.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Authentication Method</dt>
            <dd className="mt-1 font-medium text-slate-900 capitalize">
              {user.authProvider === 'google' ? 'Google Account' : 'Email & Password'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Member Since</dt>
            <dd className="mt-1 font-mono text-slate-900 tabular-nums">
              {user.createdAt.slice(0, 10)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Update Profile Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Personal Information
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Update your display name or registered email address.
        </p>

        {profileMessage && (
          <div
            role="status"
            className="mt-4 px-3.5 py-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            {profileMessage}
          </div>
        )}
        {profileError && (
          <div
            role="alert"
            className="mt-4 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
          >
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSave} noValidate className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(profileErrors.name)}
                className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  profileErrors.name ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {profileErrors.name && (
                <p className="mt-1 text-xs text-red-700">{profileErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(profileErrors.email)}
                className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  profileErrors.email ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {profileErrors.email && (
                <p className="mt-1 text-xs text-red-700">{profileErrors.email}</p>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

      {/* Change Password Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Change Password
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {user.authProvider === 'google'
                ? 'Your account signs in with Google. Password management is handled by Google.'
                : 'Require at least 8 characters with both letters and numbers.'}
            </p>
          </div>
          {user.authProvider === 'local' && (
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              {showPasswords ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hide passwords</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Show passwords</span>
                </>
              )}
            </button>
          )}
        </div>

        {user.authProvider === 'local' && (
          <>
            {passwordMessage && (
              <div
                role="status"
                className="mt-4 px-3.5 py-2.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
              >
                {passwordMessage}
              </div>
            )}
            {passwordError && (
              <div
                role="alert"
                className="mt-4 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
              >
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordSave} noValidate className="mt-5 space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Current Password
                </label>
                <input
                  id="current-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  aria-invalid={Boolean(passwordErrors.currentPassword)}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                    passwordErrors.currentPassword ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {passwordErrors.currentPassword && (
                  <p className="mt-1 text-xs text-red-700">{passwordErrors.currentPassword}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    aria-invalid={Boolean(passwordErrors.newPassword)}
                    className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                      passwordErrors.newPassword ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {passwordErrors.newPassword && (
                    <p className="mt-1 text-xs text-red-700">{passwordErrors.newPassword}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={Boolean(passwordErrors.confirmPassword)}
                    className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                      passwordErrors.confirmPassword ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-700">{passwordErrors.confirmPassword}</p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                >
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
