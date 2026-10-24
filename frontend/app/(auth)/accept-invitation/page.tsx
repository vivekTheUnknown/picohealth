"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, MailWarning } from "lucide-react";

import { acceptInvitation } from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/api-client";
import {
  validateNewPassword,
  validatePasswordConfirmation,
  MIN_PASSWORD_LENGTH,
} from "@/lib/validation";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Input } from "@/components/forms/inputs";
import { PasswordInput } from "@/components/forms/password-input";
import { Skeleton } from "@/components/layout/skeleton";

export default function AcceptInvitationPage() {
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
    setChecked(true);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setError(null);

    const nextNameError = displayName.trim() ? null : "Enter your full name.";
    const nextPasswordError = validateNewPassword(password);
    const nextConfirmationError = validatePasswordConfirmation(password, confirmation);
    setNameError(nextNameError);
    setPasswordError(nextPasswordError);
    setConfirmationError(nextConfirmationError);
    if (nextNameError || nextPasswordError || nextConfirmationError) return;

    setPending(true);
    try {
      const result = await acceptInvitation(token, displayName.trim(), password);
      setMessage(result);
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setPending(false);
    }
  };

  if (!checked) {
    return (
      <AuthCard title="Accept invitation">
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Preparing invitation form</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard title="Invitation link invalid">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            This link is missing its invitation token. Open the most recent invitation email, or
            ask an administrator to send a new one.
          </p>
        </div>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-accent-800 underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Accept your invitation"
      description="Choose the name shown in the portal and set a password for your account."
      footer={
        <Link href="/login" className="font-medium text-accent-800 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {message ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{message}</p>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent-700 px-4 py-2 text-sm font-medium text-white hover:bg-accent-800"
          >
            Continue to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error ? (
            <FormBanner tone="error" title="Could not activate the account">
              {apiErrorMessage(error)}
            </FormBanner>
          ) : null}

          <Field id="invite-name" label="Full name" required error={nameError}>
            <Input
              id="invite-name"
              autoComplete="name"
              autoFocus
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "invite-name-error" : undefined}
            />
          </Field>

          <Field
            id="invite-password"
            label="Password"
            required
            error={passwordError}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <PasswordInput
              id="invite-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "invite-password-error" : "invite-password-hint"}
            />
          </Field>

          <Field
            id="invite-confirmation"
            label="Confirm password"
            required
            error={confirmationError}
          >
            <PasswordInput
              id="invite-confirmation"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={confirmationError ? true : undefined}
              aria-describedby={confirmationError ? "invite-confirmation-error" : undefined}
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={pending}
            loadingLabel="Activating account"
          >
            Activate account
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
