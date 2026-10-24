"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";

import { requestPasswordRecovery, resetPassword } from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/api-client";
import {
  validateEmail,
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

export default function RecoverPage() {
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<ApiError | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
    setChecked(true);
  }, []);

  const handleRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError(null);
    const error = validateEmail(email);
    setEmailError(error);
    if (error) return;

    setRequesting(true);
    try {
      const message = await requestPasswordRecovery(email.trim());
      setRequested(message);
    } catch (caught) {
      setRequestError(toApiError(caught));
    } finally {
      setRequesting(false);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setResetError(null);

    const nextPasswordError = validateNewPassword(password);
    const nextConfirmationError = validatePasswordConfirmation(password, confirmation);
    setPasswordError(nextPasswordError);
    setConfirmationError(nextConfirmationError);
    if (nextPasswordError || nextConfirmationError) return;

    setResetting(true);
    try {
      const message = await resetPassword(token, password);
      setResetMessage(message);
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      setResetError(toApiError(caught));
    } finally {
      setResetting(false);
    }
  };

  if (!checked) {
    return (
      <AuthCard title="Account recovery">
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Preparing recovery form</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      </AuthCard>
    );
  }

  if (token) {
    return (
      <AuthCard
        title="Choose a new password"
        description="This link can be used once and expires for your security."
        footer={
          <Link href="/login" className="font-medium text-accent-800 underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        }
      >
        {resetMessage ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{resetMessage}</p>
            </div>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-accent-700 px-4 py-2 text-sm font-medium text-white hover:bg-accent-800"
            >
              Continue to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} noValidate className="space-y-4">
            {resetError ? (
              <FormBanner tone="error" title="Could not update the password">
                {apiErrorMessage(resetError)}
              </FormBanner>
            ) : null}

            <Field
              id="reset-password"
              label="New password"
              required
              error={passwordError}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. Use a unique passphrase.`}
            >
              <PasswordInput
                id="reset-password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "reset-password-error" : "reset-password-hint"}
              />
            </Field>

            <Field
              id="reset-confirmation"
              label="Confirm new password"
              required
              error={confirmationError}
            >
              <PasswordInput
                id="reset-confirmation"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={confirmationError ? true : undefined}
                aria-describedby={confirmationError ? "reset-confirmation-error" : undefined}
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={resetting}
              loadingLabel="Updating password"
            >
              Update password
            </Button>
          </form>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recover your account"
      description="Enter your account email. If it exists, you will receive a reset link."
      footer={
        <Link href="/login" className="font-medium text-accent-800 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {requested ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-ocean-200 bg-ocean-50 p-3 text-sm text-ocean-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{requested}</p>
          </div>
          <p className="text-xs leading-5 text-ink-subtle">
            The link is time-limited. Check your spam folder before requesting another.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setRequested(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleRequest} noValidate className="space-y-4">
          {requestError ? (
            <FormBanner tone="error" title="Request failed">
              {apiErrorMessage(requestError)}
            </FormBanner>
          ) : null}

          <Field id="recover-email" label="Email address" required error={emailError}>
            <Input
              id="recover-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "recover-email-error" : undefined}
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={requesting}
            loadingLabel="Sending reset link"
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
