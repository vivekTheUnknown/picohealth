"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FileText, Lock, RefreshCw, Send } from "lucide-react";

import { createNote, listNotes } from "@/lib/api";
import { formatDateTime, pluralize, truncate } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { PatientOverview } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Select, Textarea } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Skeleton } from "@/components/layout/skeleton";
import { PermissionDenied } from "@/components/status/permission-denied";

const MAX_NOTE_LENGTH = 4000;

export function NotesPanel({
  patientId,
  overview,
  timeZone,
}: {
  patientId: string;
  overview: PatientOverview;
  timeZone: string;
}) {
  const { me } = useSession();
  const notes = useApi((signal) => listNotes(patientId, signal), [patientId]);
  const [content, setContent] = useState("");
  const [relatedEventId, setRelatedEventId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const create = useAsyncAction(createNote);
  const canWrite = hasPermission(me, PERMISSIONS.CLINICAL_NOTES_WRITE);

  const rows = [...(notes.data ?? [])].sort((a, b) => {
    const aMs = a.created_at ? Date.parse(a.created_at) : 0;
    const bMs = b.created_at ? Date.parse(b.created_at) : 0;
    return bMs - aMs;
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavedMessage(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setValidationError("Enter a note before saving.");
      return;
    }
    if (trimmed.length > MAX_NOTE_LENGTH) {
      setValidationError(`Notes are limited to ${MAX_NOTE_LENGTH.toLocaleString()} characters.`);
      return;
    }

    setValidationError(null);
    const saved = await create.run(patientId, trimmed, relatedEventId || undefined);
    if (saved) {
      setContent("");
      setRelatedEventId("");
      setSavedMessage("Note saved. It is attributed to your account and cannot be deleted here.");
      notes.reload();
    }
  };

  if (notes.error?.isForbidden) {
    return (
      <PermissionDenied
        title="Notes access restricted"
        description="The API did not permit access to this patient's clinical notes."
        detail={notes.error.message}
      />
    );
  }

  return (
    <div className="space-y-5">
      {canWrite ? (
        <SectionCard
          title="Add a clinical note"
          description="Notes are dated and attributed. AI-generated text is not accepted here; write your own clinical observations."
        >
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {create.error ? (
              <FormBanner tone="error" title="The note could not be saved">
                {apiErrorMessage(create.error)}
              </FormBanner>
            ) : null}
            {savedMessage ? (
              <FormBanner tone="success" onDismiss={() => setSavedMessage(null)}>
                {savedMessage}
              </FormBanner>
            ) : null}

            <Field
              id="note-content"
              label="Note"
              required
              hint={`${content.trim().length.toLocaleString()} of ${MAX_NOTE_LENGTH.toLocaleString()} characters. Do not include unnecessary sensitive information.`}
              error={validationError}
            >
              <Textarea
                id="note-content"
                name="content"
                rows={5}
                maxLength={MAX_NOTE_LENGTH}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  if (validationError) setValidationError(null);
                }}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={validationError ? "note-content-error" : "note-content-hint"}
                placeholder="Clinical observation, review reasoning, or follow-up plan…"
              />
            </Field>

            <Field
              id="note-related-event"
              label="Related event"
              aside="Optional"
              hint="Link the note to an active event for review history. Notes are not diagnoses."
            >
              <Select
                id="note-related-event"
                value={relatedEventId}
                onChange={(event) => setRelatedEventId(event.target.value)}
              >
                <option value="">No related event</option>
                {overview.active_events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {truncate(
                      `${event.event_type.replace(/[_-]+/g, " ")} · ${event.severity} · ${
                        event.start_at ? formatDateTime(event.start_at, timeZone) : "time not reported"
                      }`,
                      80,
                    )}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xs leading-5 text-ink-subtle">
                The API records the author and timestamp. Notes are retained according to the
                project's retention policy.
              </p>
              <Button type="submit" variant="primary" size="sm" loading={create.pending} loadingLabel="Saving note">
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Save note
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-raised p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink">Read-only notes</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">
              Your account can read clinical notes but does not have the{" "}
              <span className="font-mono">clinical_notes:write</span> permission. The API will refuse
              a write attempt even if one were submitted.
            </p>
          </div>
        </div>
      )}

      <SectionCard
        title="Notes and review history"
        description="Clinician-authored notes, newest first."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={notes.reload}
            loading={notes.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        <div className="space-y-3">
          {notes.error && !notes.data ? (
            <ErrorState
              title="The notes could not be loaded"
              error={notes.error}
              onRetry={notes.reload}
              retrying={notes.loading}
            />
          ) : notes.loading && !notes.data ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <span className="sr-only">Loading clinical notes</span>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No notes recorded"
              description="No clinician notes have been added for this patient. Notes appear here with their author and timestamp."
            />
          ) : (
            <>
              <p className="text-2xs text-ink-subtle">{pluralize(rows.length, "note")}</p>
              <ol className="space-y-2.5">
                {rows.map((note) => (
                  <li key={note.id} className="rounded-lg border border-line bg-surface p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-xs font-semibold text-ink">
                        {note.author_name ?? "Author not reported"}
                      </p>
                      <p className="text-2xs text-ink-subtle">
                        {formatDateTime(note.created_at, timeZone)}
                        {note.updated_at && note.updated_at !== note.created_at
                          ? ` · edited ${formatDateTime(note.updated_at, timeZone)}`
                          : ""}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-muted">
                      {note.content}
                    </p>
                    {note.related_event_id ? (
                      <Link
                        href={`/alerts?event=${encodeURIComponent(note.related_event_id)}`}
                        className="mt-2 inline-flex rounded text-2xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none"
                      >
                        Related event
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
