import React, { useState } from 'react';
import { Eye, EyeOff, CheckSquare, ShieldCheck, Layers, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { validateLoginInput, validateRegistrationInput } from '../lib/validation';

export function AuthScreen() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setFieldErrors({});
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError('');

    if (mode === 'register') {
      const check = validateRegistrationInput({ name, email, password });
      if (!check.valid) {
        setFieldErrors(check.errors);
        return;
      }
    } else {
      const check = validateLoginInput({ email, password });
      if (!check.valid) {
        setFieldErrors(check.errors);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(name.trim(), email.trim(), password);
      } else {
        await loginWithEmail(email.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setFormError('Unable to reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google sign-in was cancelled or unavailable.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left column: Structured editorial workspace overview */}
      <div className="lg:w-1/2 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 px-8 py-12 lg:px-16 lg:py-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <CheckSquare className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">TaskFlow</span>
          </div>

          <div className="mt-12 max-w-lg">
            <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
              Task management engineered for structured software QA.
            </h1>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              Manage daily tasks, validate REST endpoints, inspect relational records, and track
              structured test cases and bug reports inside a single workbench.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>Role & Session Guards</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Protected routes, duplicate email rejection, input validation, and strict user data
                isolation.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <Layers className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>Full CRUD & Filtering</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Create, edit, prioritize, search, sort by deadline, and verify every transition in
                PostgreSQL.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <BarChart3 className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>Real-Time Analytics</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Live total, pending, completed, overdue counts, and completion rate synchronized
                with backend aggregates.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
                <CheckSquare className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>Integrated QA Lab</span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                30 pre-built test cases (TC-001 to TC-030), GitLab-style defect tracking, and a
                live API tester.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-12 text-xs text-slate-500">
          TaskFlow Web Application QA & Testing Lab · React · Express · PostgreSQL
        </p>
      </div>

      {/* Right column: Sign In / Registration Form */}
      <div className="lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 className="font-display text-2xl font-bold text-slate-900">
            {mode === 'login' ? 'Sign in to TaskFlow' : 'Create your QA account'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            {mode === 'login'
              ? 'Enter your credentials to access your protected dashboard.'
              : 'Register with a unique email and a password of at least 8 characters.'}
          </p>

          {formError && (
            <div
              role="alert"
              className="mt-5 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition-colors ${
                    fieldErrors.name ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-700">{fieldErrors.name}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tester@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition-colors ${
                  fieldErrors.email ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-700">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min. 8 chars with letter & number' : 'Enter your password'}
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`w-full pl-3.5 pr-11 py-2.5 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition-colors ${
                    fieldErrors.password ? 'border-red-500' : 'border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-700">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-700 whitespace-nowrap"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-500">or continue with</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 whitespace-nowrap"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
