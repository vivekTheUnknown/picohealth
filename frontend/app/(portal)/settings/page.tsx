"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { changePassword } from "@/lib/api";
import { formatDateTime, humanizePermission, pluralize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useAsyncAction } from "@/lib/use-api";
import { MIN_PASSWORD_LENGTH, validateNewPassword, validatePasswordConfirmation } from "@/lib/validation";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { PasswordInput } from "@/components/forms/password-input";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { RoleBadge } from "@/components/status/role-badge";
import { UserStatusBadge, VerificationBadge } from "@/components/status/user-status-badge";

interface FieldErrors {
  current?: string;
  next?: string;
  confirmation?: string;
}

export default function SettingsPage() {
  const { me, signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const change = useAsyncAction(changePassword);

  if (!me) return <PageSkeleton />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(null);

    const nextErrors: FieldErrors = {};
    if (!currentPassword) nextErrors.current = "Enter your current password.";
    const nextError = validateNewPassword(newPassword);
    if (nextError) nextErrors.next = nextError;
    else if (newPassword === currentPassword) {
      nextErrors.next = "Choose a password different from your current password.";
    }
    const confirmationError = validatePasswordConfirmation(newPassword, confirmation);
    if (confirmationError) nextErrors.confirmation = confirmationError;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const ok = await change.run(currentPassword, newPassword);
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSuccess("Password changed. Other sessions have been signed out by the API.");
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile and settings"
        description="Your account, access, and password. Profile changes and notification preferences are not editable in this release."
        meta={
          <>
            <span>Signed in as {me.email}</span>
            <span>Time zone: {me.timezone}</span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Account"
          description="Identity and verification as reported by the API."
          className="lg:col-span-2"
        >
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Display name
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-ink">
                <UserRound className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                {me.display_name || "Not reported"}
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Email
              </dt>
              <dd className="mt-1 break-all text-sm text-ink">{me.email || "Not reported"}</dd>
            </div>
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Account status
              </dt>
              <dd className="mt-1">
                <UserStatusBadge status={me.status} />
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Roles
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {me.roles.length === 0 ? (
                  <span className="text-xs text-ink-subtle">No role reported</span>
                ) : (
                  me.roles.map((role) => <RoleBadge key={role} role={role} />)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Doctor verification
              </dt>
              <dd className="mt-1">
                <VerificationBadge status={me.doctor_verification_status} />
              </dd>
            </div>
            <div>
              <dt className="text-2xs font-medium text-ink-subtle">
                Last sign-in
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {me.last_login_at ? formatDateTime(me.last_login_at, me.timezone) : "Not reported"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-2xs font-medium text-ink-subtle">
                Account ID
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-muted">
                {me.id || "Not reported"}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Session" description="Sign out of this browser session.">
          <div className="space-y-4">
            <p className="text-xs leading-5 text-ink-muted">
              Signing out clears the session locally and asks the API to end it. If the API call
              fails, this browser still signs out.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSignOut}
              loading={signingOut}
              loadingLabel="Signing out"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
            <p className="text-2xs leading-5 text-ink-subtle">
              Display time zone: <span className="font-medium text-ink-muted">{me.timezone}</span>.
              Changing profile time zone is not supported by the current API contract; contact an
              administrator if it is wrong.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Change password"
          description={`Use at least ${MIN_PASSWORD_LENGTH} characters. The API enforces its own password policy.`}
        >
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {change.error ? (
              <FormBanner tone="error" title="The password could not be changed">
                {apiErrorMessage(change.error)}
              </FormBanner>
            ) : null}
            {success ? (
              <FormBanner tone="success" onDismiss={() => setSuccess(null)}>
                {success}
              </FormBanner>
            ) : null}

            <Field id="current-password" label="Current password" required error={errors.current}>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  if (errors.current) setErrors((current) => ({ ...current, current: undefined }));
                }}
                aria-invalid={errors.current ? true : undefined}
              />
            </Field>
            <Field
              id="new-password"
              label="New password"
              required
              error={errors.next}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            >
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  if (errors.next) setErrors((current) => ({ ...current, next: undefined }));
                }}
                aria-invalid={errors.next ? true : undefined}
              />
            </Field>
            <Field id="confirm-password" label="Confirm new password" required error={errors.confirmation}>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  if (errors.confirmation) {
                    setErrors((current) => ({ ...current, confirmation: undefined }));
                  }
                }}
                aria-invalid={errors.confirmation ? true : undefined}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xs leading-5 text-ink-subtle">
                Changing your password may end other sessions. You will remain signed in here unless
                the API says otherwise.
              </p>
              <Button type="submit" variant="primary" size="sm" loading={change.pending} loadingLabel="Changing password">
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                Change password
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Effective access"
          description="Permissions the API reported for this session. Navigation hiding is not authorization."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
              {pluralize(me.permissions.length, "permission")} reported
            </div>
            {me.permissions.length === 0 ? (
              <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
                The API reported no permissions. Pages may still be visible in navigation, but the
                API will refuse protected requests.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {me.permissions.map((permission) => (
                  <li
                    key={permission}
                    title={permission}
                    className="rounded-md border border-line bg-surface-raised px-2 py-1 text-2xs text-ink-muted"
                  >
                    {humanizePermission(permission)}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-2xs leading-5 text-ink-subtle">
              To request a role or assignment change, contact an administrator. The portal does not
              let users grant themselves permissions.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
