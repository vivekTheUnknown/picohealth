"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Mail, RefreshCw, Search, ShieldAlert, UserCog, UserPlus } from "lucide-react";

import { inviteUser, listUsers, updateUserRoles, updateUserStatus } from "@/lib/api";
import { formatDateTime, pluralize } from "@/lib/format";
import { hasPermission, isAdmin, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { PortalUser, Role, UserStatus } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { Checkbox } from "@/components/forms/checkbox";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Input, Select } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { Modal } from "@/components/layout/modal";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/status/permission-denied";
import { RoleBadge } from "@/components/status/role-badge";
import {
  UserStatusBadge,
  VerificationBadge,
} from "@/components/status/user-status-badge";

const ROLE_OPTIONS: Array<{ value: Role; label: string; description: string }> = [
  {
    value: "doctor",
    label: "Doctor",
    description: "Clinical access constrained by active patient assignments.",
  },
  {
    value: "admin",
    label: "Administrator",
    description: "Account, assignment, device, audit, and platform operations.",
  },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: "invited", label: "Invited" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deactivated", label: "Deactivated" },
];

function VerificationCell({ user }: { user: PortalUser }) {
  if (user.verification_status !== null) {
    return <VerificationBadge status={user.verification_status} />;
  }
  // The API's user list does not include doctor verification data today.
  // "Not applicable" is only correct for accounts that cannot be doctors.
  if (user.roles.includes("doctor")) {
    return (
      <span
        className="text-xs text-ink-subtle"
        title="The API did not report a verification state for this doctor."
      >
        Not reported
      </span>
    );
  }
  return <span className="text-xs text-ink-subtle">Not applicable</span>;
}

function rolesChanged(original: Role[], next: Role[]): boolean {
  if (original.length !== next.length) return true;
  return original.some((role) => !next.includes(role));
}

export default function AdminUsersPage() {
  const { me } = useSession();
  const users = useApi((signal) => listUsers({}, signal), []);
  const canManage = isAdmin(me) || hasPermission(me, PERMISSIONS.USERS_MANAGE);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("doctor");
  const [inviteValidation, setInviteValidation] = useState<string | null>(null);
  const invite = useAsyncAction(inviteUser);

  const [managed, setManaged] = useState<PortalUser | null>(null);
  const [nextStatus, setNextStatus] = useState<UserStatus>("active");
  const [nextRoles, setNextRoles] = useState<Role[]>([]);
  const [manageError, setManageError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saveUser = useAsyncAction<[PortalUser, UserStatus, Role[]]>(
    async (user, status, roles) => {
      if (status !== user.status) {
        await updateUserStatus(user.id, status);
      }
      if (rolesChanged(user.roles, roles)) {
        await updateUserRoles(user.id, roles);
      }
    },
  );

  const rows = users.data ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((user) => {
      if (query) {
        const haystack = `${user.display_name} ${user.email}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (roleFilter !== "all" && !user.roles.includes(roleFilter as Role)) return false;
      return true;
    });
  }, [rows, search, statusFilter, roleFilter]);

  const noChanges = managed
    ? nextStatus === managed.status && !rolesChanged(managed.roles, nextRoles)
    : false;

  const openManage = (user: PortalUser) => {
    setManaged(user);
    setNextStatus(user.status === "unknown" ? "active" : user.status);
    setNextRoles([...user.roles]);
    setManageError(null);
    saveUser.reset();
  };

  const closeManage = () => {
    setManaged(null);
    setConfirmOpen(false);
    setManageError(null);
    saveUser.reset();
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteValidation("Enter a valid email address.");
      return;
    }
    setInviteValidation(null);
    const ok = await invite.run({
      email,
      role: inviteRole,
    });
    if (ok) {
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("doctor");
      setMessage(`Invitation sent to ${email}. The account remains invited until accepted.`);
      users.reload();
    }
  };

  const highImpactChange = (user: PortalUser, status: UserStatus, roles: Role[]): boolean => {
    const statusChange = status !== user.status && (status === "suspended" || status === "deactivated");
    const removesAdmin = user.roles.includes("admin") && !roles.includes("admin");
    return statusChange || removesAdmin;
  };

  const submitManage = async () => {
    if (!managed) return;
    if (nextRoles.length === 0) {
      setManageError("Select at least one role. A user without a role cannot use the portal.");
      return;
    }
    if (nextStatus === managed.status && !rolesChanged(managed.roles, nextRoles)) {
      return;
    }
    setManageError(null);
    if (highImpactChange(managed, nextStatus, nextRoles)) {
      setConfirmOpen(true);
      return;
    }
    const ok = await saveUser.run(managed, nextStatus, nextRoles);
    if (ok) {
      closeManage();
      setMessage(`Account settings updated for ${managed.display_name}.`);
      users.reload();
    }
  };

  const confirmManage = async () => {
    if (!managed) return;
    const ok = await saveUser.run(managed, nextStatus, nextRoles);
    if (ok) {
      const name = managed.display_name;
      closeManage();
      setMessage(`Account settings updated for ${name}. Access changes are enforced by the API.`);
      users.reload();
    }
  };

  const columns: Column<PortalUser>[] = [
    {
      key: "user",
      header: "User",
      render: (user) => (
        <div className="min-w-[12rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink">{user.display_name}</span>
            {user.id === me?.id ? (
              <span className="rounded border border-accent-200 bg-accent-50 px-1 py-0.5 text-[10px] font-medium text-accent-800">
                You
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-ink-muted">{user.email || "Email not reported"}</p>
          <p className="mt-0.5 text-[10px] text-ink-subtle">
            Created {formatDateTime(user.created_at, me?.timezone)}
          </p>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (user) => (
        <div className="flex min-w-[8rem] flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-[11px] text-ink-subtle">No role reported</span>
          ) : (
            user.roles.map((role) => <RoleBadge key={role} role={role} />)
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (user) => <UserStatusBadge status={user.status} />,
    },
    {
      key: "verification",
      header: "Verification",
      render: (user) => <VerificationCell user={user} />,
    },
    {
      key: "lastLogin",
      header: "Last sign-in",
      render: (user) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {user.last_login_at ? formatDateTime(user.last_login_at, me?.timezone) : "Never reported"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (user) =>
        canManage ? (
          <Button variant="secondary" size="sm" onClick={() => openManage(user)}>
            Manage
          </Button>
        ) : (
          <span className="text-[11px] text-ink-subtle">Read-only</span>
        ),
    },
  ];

  if (users.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <PermissionDenied
          title="User management restricted"
          description="The API did not permit access to the user directory."
          detail={users.error.message}
        />
      </div>
    );
  }

  if (users.loading && !users.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" description="Loading the account directory…" />
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  if (users.error && !users.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <ErrorState
          title="The user directory is unavailable"
          error={users.error}
          onRetry={users.reload}
          retrying={users.loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Invite accounts, review verification state, and manage roles and account status. The API enforces permissions and records changes in the audit log."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={users.reload}
              loading={users.loading}
              loadingLabel="Refreshing"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
            {canManage ? (
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Invite user
              </Button>
            ) : null}
          </>
        }
        meta={
          <span>
            {pluralize(rows.length, "account")} · {filtered.length} shown
          </span>
        }
      />

      {!canManage ? (
        <FormBanner tone="info" title="Read-only view">
          Your account can view users but does not have the <span className="font-mono">users:manage</span>{" "}
          permission. Management actions are not shown; the API would refuse them regardless.
        </FormBanner>
      ) : null}

      {message ? (
        <FormBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </FormBanner>
      ) : null}

      {users.error ? (
        <FormBanner tone="warning" title="The user directory could not be refreshed">
          Showing the last successful response. Account status and roles may have changed since then.
          Retry before making further changes.
        </FormBanner>
      ) : null}

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line bg-slate-50/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="users-search"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
            >
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                aria-hidden="true"
              />
              <Input
                id="users-search"
                className="pl-9"
                placeholder="Name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="users-status"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
            >
              Status
            </label>
            <Select
              id="users-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="users-role"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
            >
              Role
            </label>
            <Select
              id="users-role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">All roles</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Administrator</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No users returned"
            description="The API returned no accounts for this portal. If you expected accounts here, check the backend and your permissions."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No users match these filters"
            description="Adjust the search term, status, or role."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setRoleFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(user) => user.id}
            caption="Portal users"
          />
        )}
      </SectionCard>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a user"
        description="The invitation is delivered by the backend. No password is set or displayed here."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              form="invite-user-form"
              loading={invite.pending}
              loadingLabel="Sending invitation"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Send invitation
            </Button>
          </>
        }
      >
        <form id="invite-user-form" onSubmit={handleInvite} className="space-y-4" noValidate>
          {invite.error ? (
            <FormBanner tone="error" title="The invitation could not be sent">
              {apiErrorMessage(invite.error)}
            </FormBanner>
          ) : null}
          <Field
            id="invite-email"
            label="Email address"
            required
            error={inviteValidation}
            hint="The account is created in the invited state and becomes active when the invitation is accepted."
          >
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={inviteEmail}
              onChange={(event) => {
                setInviteEmail(event.target.value);
                if (inviteValidation) setInviteValidation(null);
              }}
              aria-invalid={inviteValidation ? true : undefined}
              placeholder="name@organization.example"
            />
          </Field>
          <Field
            id="invite-role"
            label="Initial role"
            required
            hint="The invitee sets their display name when accepting. Roles can be changed later by an administrator with the appropriate permission."
          >
            <Select
              id="invite-role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as Role)}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(managed)}
        onClose={closeManage}
        title={managed ? `Manage ${managed.display_name}` : "Manage user"}
        description="Changes are submitted to the API and recorded in the audit log."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeManage}>
              Cancel
            </Button>
            <Button
              variant={nextStatus === "suspended" || nextStatus === "deactivated" ? "danger" : "primary"}
              size="sm"
              onClick={submitManage}
              loading={saveUser.pending}
              loadingLabel="Saving changes"
              disabled={managed?.id === me?.id || noChanges}
            >
              Save changes
            </Button>
          </>
        }
      >
        {managed ? (
          <div className="space-y-4">
            {manageError ? (
              <FormBanner tone="error" title="Changes could not be saved">
                {manageError}
              </FormBanner>
            ) : saveUser.error ? (
              <FormBanner tone="error" title="Changes could not be saved">
                {apiErrorMessage(saveUser.error)}
              </FormBanner>
            ) : null}
            {managed.id === me?.id ? (
              <FormBanner tone="warning" title="This is your own account">
                Manage your own account through the account settings page. Status and role changes
                for your own account are disabled here to avoid locking you out.
              </FormBanner>
            ) : null}

            <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-ink-subtle">Email</dt>
                <dd className="mt-0.5 text-ink">{managed.email || "Not reported"}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Verification</dt>
                <dd className="mt-0.5">
                  <VerificationCell user={managed} />
                </dd>
              </div>
            </dl>

            <Field
              id="manage-status"
              label="Account status"
              hint="Suspending or deactivating an account ends its access immediately. The API is the authority."
            >
              <Select
                id="manage-status"
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as UserStatus)}
                disabled={managed.id === me?.id}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset>
              <legend className="text-sm font-medium text-ink">Roles</legend>
              <p className="mt-0.5 text-xs leading-5 text-ink-subtle">
                Role changes alter what the API permits. At least one role is required.
              </p>
              <div className="mt-2 space-y-2">
                {ROLE_OPTIONS.map((option) => (
                  <Checkbox
                    key={option.value}
                    id={`manage-role-${option.value}`}
                    name="roles"
                    value={option.value}
                    checked={nextRoles.includes(option.value)}
                    disabled={managed.id === me?.id}
                    onChange={(event) => {
                      setNextRoles((current) =>
                        event.target.checked
                          ? [...current, option.value]
                          : current.filter((role) => role !== option.value),
                      );
                    }}
                    label={option.label}
                    description={option.description}
                  />
                ))}
              </div>
            </fieldset>

            {noChanges && managed.id !== me?.id ? (
              <p className="text-xs text-ink-subtle" role="status">
                No changes to save. Update the status or roles to enable saving.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm an access-affecting change"
        description="This change can remove access or end a session. Review it before continuing."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmManage}
              loading={saveUser.pending}
              loadingLabel="Applying change"
            >
              Apply change
            </Button>
          </>
        }
      >
        {managed ? (
          <div className="space-y-3 text-sm leading-6 text-ink-muted">
            {managed.status !== nextStatus ? (
              <p>
                Change status from <span className="font-medium text-ink">{managed.status}</span> to{" "}
                <span className="font-medium text-ink">{nextStatus}</span>.
              </p>
            ) : null}
            {rolesChanged(managed.roles, nextRoles) ? (
              <p>
                Change roles from{" "}
                <span className="font-medium text-ink">
                  {managed.roles.join(", ") || "none"}
                </span>{" "}
                to <span className="font-medium text-ink">{nextRoles.join(", ") || "none"}</span>.
              </p>
            ) : null}
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The API records this action in the audit log. Existing sessions may be revoked.
            </p>
            {saveUser.error ? (
              <FormBanner tone="error" title="The change was not applied">
                {apiErrorMessage(saveUser.error)}
              </FormBanner>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
