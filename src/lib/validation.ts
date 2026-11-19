import type { TaskPriority, TaskStatus } from './types.ts';

export interface ValidationResult<T> {
  valid: boolean;
  errors: Record<string, string>;
  data?: T;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PRIORITIES: readonly TaskPriority[] = ['high', 'medium', 'low'];
const VALID_STATUSES: readonly TaskStatus[] = ['pending', 'completed'];

export function getTodayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidIsoDate(dateStr: string): boolean {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

export function validateRegistrationInput(input: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}): ValidationResult<{ name: string; email: string; password: string }> {
  const errors: Record<string, string> = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (name.length > 120) {
    errors.name = 'Name must be 120 characters or fewer.';
  }

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address (e.g. name@example.com).';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Password must include at least one letter and one number.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: {}, data: { name, email, password } };
}

export function validateLoginInput(input: {
  email?: unknown;
  password?: unknown;
}): ValidationResult<{ email: string; password: string }> {
  const errors: Record<string, string> = {};
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: {}, data: { email, password } };
}

export function validateProfileInput(input: {
  name?: unknown;
  email?: unknown;
}): ValidationResult<{ name: string; email: string }> {
  const errors: Record<string, string> = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';

  if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  } else if (name.length > 120) {
    errors.name = 'Name must be 120 characters or fewer.';
  }

  if (!email) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: {}, data: { name, email } };
}

export function validatePasswordChangeInput(input: {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}): ValidationResult<{ currentPassword: string; newPassword: string }> {
  const errors: Record<string, string> = {};
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword =
    typeof input.confirmPassword === 'string' ? input.confirmPassword : undefined;

  if (!currentPassword) {
    errors.currentPassword = 'Current password is required.';
  }

  if (!newPassword) {
    errors.newPassword = 'New password is required.';
  } else if (newPassword.length < 8) {
    errors.newPassword = 'New password must be at least 8 characters.';
  } else if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    errors.newPassword = 'New password must include at least one letter and one number.';
  } else if (newPassword === currentPassword) {
    errors.newPassword = 'New password must differ from your current password.';
  }

  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: {}, data: { currentPassword, newPassword } };
}

export interface ValidatedTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
}

export function validateTaskInput(
  input: {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    status?: unknown;
    dueDate?: unknown;
    allowPastDueDate?: unknown;
  },
  options: { isUpdate?: boolean; todayIso?: string } = {}
): ValidationResult<ValidatedTaskInput> {
  const errors: Record<string, string> = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const rawPriority =
    typeof input.priority === 'string' ? input.priority.trim().toLowerCase() : 'medium';
  const rawStatus =
    typeof input.status === 'string' ? input.status.trim().toLowerCase() : 'pending';
  const rawDueDate =
    input.dueDate === null || input.dueDate === undefined || input.dueDate === ''
      ? null
      : typeof input.dueDate === 'string'
        ? input.dueDate.trim()
        : '__invalid__';

  if (!title) {
    errors.title = 'Task title is required.';
  } else if (title.length > 200) {
    errors.title = 'Task title must be 200 characters or fewer.';
  }

  if (description.length > 2000) {
    errors.description = 'Description must be 2000 characters or fewer.';
  }

  if (!VALID_PRIORITIES.includes(rawPriority as TaskPriority)) {
    errors.priority = 'Priority must be high, medium, or low.';
  }

  if (!VALID_STATUSES.includes(rawStatus as TaskStatus)) {
    errors.status = 'Status must be pending or completed.';
  }

  const todayIso = options.todayIso ?? getTodayIsoDate();
  const allowPast = input.allowPastDueDate === true || options.isUpdate === true;

  if (rawDueDate !== null) {
    if (rawDueDate === '__invalid__' || !isValidIsoDate(rawDueDate)) {
      errors.dueDate = 'Deadline must be a valid date in YYYY-MM-DD format.';
    } else if (!allowPast && rawDueDate < todayIso) {
      errors.dueDate =
        'Past deadlines are blocked by the default date policy. Choose today or a future date, or enable backdated testing.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    data: {
      title,
      description,
      priority: rawPriority as TaskPriority,
      status: rawStatus as TaskStatus,
      dueDate: rawDueDate,
    },
  };
}

export function validateTaskStatus(status: unknown): ValidationResult<{ status: TaskStatus }> {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!VALID_STATUSES.includes(normalized as TaskStatus)) {
    return {
      valid: false,
      errors: { status: 'Status must be pending or completed.' },
    };
  }
  return { valid: true, errors: {}, data: { status: normalized as TaskStatus } };
}
