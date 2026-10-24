"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { login } from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/api-client";
import { landingPath } from "@/lib/permissions";
import { AUTH_NOTICE_KEY } from "@/lib/session";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Input } from "@/components/forms/inputs";
import { PasswordInput } from "@/components/forms/password-input";

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(AUTH_NOTICE_KEY);
      if (stored) {
        setNotice(stored);
        window.sessionStorage.removeItem(AUTH_NOTICE_KEY);
      }
    } catch {
      // Storage can be unavailable; the notice is optional.
    }
  }, []);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = "Enter a valid email address.";
    }
    if (!password) next.password = "Enter your password.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setPending(true);
    try {
      const me = await login(email.trim(), password);
      router.replace(landingPath(me));
    } catch (caught) {
      setError(toApiError(caught));
      setPassword("");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      title="Sign in"
      description="Use the account provisioned for you by your organization."
      footer={
        <span>
          Access is limited by role and patient assignment. If you need an account, contact an
          administrator.
        </span>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {notice ? <FormBanner tone="info">{notice}</FormBanner> : null}

        {error ? (
          <FormBanner tone="error" title="Could not sign in">
            <span>{apiErrorMessage(error)}</span>
            {error.requestId ? (
              <span className="mt-1 block font-mono text-2xs opacity-80">
                Request {error.requestId}
              </span>
            ) : null}
          </FormBanner>
        ) : null}

        <Field id="login-email" label="Email address" required error={fieldErrors.email}>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            placeholder="name@organization.example"
          />
        </Field>

        <Field
          id="login-password"
          label="Password"
          required
          error={fieldErrors.password}
          aside={
            <Link
              href="/recover"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={pending}
          loadingLabel="Signing in"
        >
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
