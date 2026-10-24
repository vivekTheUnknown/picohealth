# Portal Style Guide — Supabase-Inspired Product UI

**Project:** Patient-Centric Wearable Health Monitoring System  
**File:** `style.md`  
**Applies to:** Integrated doctor + administration portal

## 1. Product feel

Build a polished, developer-grade healthcare platform inspired by the **feel and responsiveness of Supabase's dashboard**.

The interface should feel fast, precise, compact, and quietly confident. It should resemble a serious software product rather than a conventional hospital dashboard.

Design principles:
- Compact navigation and efficient use of screen space.
- Strong hierarchy through typography, alignment, and subtle borders.
- Dark charcoal surfaces with restrained green accents.
- Searchable tables, filters, tabs, and detail panels.
- Immediate interactions with minimal unnecessary transitions.
- Technical detail without turning every screen into a developer console.
- Clinical information remains readable, with clear signal quality and data freshness.

Do not copy Supabase branding or reproduce its interface pixel-for-pixel.

**Avoid:** pastel wellness-app styling, giant metric cards, excessive gradients, glowing neon, heavy shadows, decorative animations, and oversized headings.

## 2. Color system

Use a dark-first theme with a charcoal application background, slightly lighter panels, subtle borders, off-white text, and a restrained green accent.

| Token | Value | Usage |
|---|---|---|
| `--app-bg` | `#17191C` | Main background |
| `--sidebar-bg` | `#141619` | Sidebar |
| `--surface` | `#1D2024` | Panels, tables, dropdowns |
| `--surface-raised` | `#23272C` | Raised panels and hover states |
| `--surface-active` | `#292F34` | Selected rows and controls |
| `--border` | `#30353B` | Borders and dividers |
| `--border-subtle` | `#272C31` | Quiet separators |
| `--text-primary` | `#E8EAED` | Main text |
| `--text-secondary` | `#A5ADB5` | Secondary text |
| `--text-muted` | `#78828C` | Timestamps and tertiary labels |
| `--accent` | `#3ECF8E` | Primary accent and active navigation |
| `--accent-hover` | `#55D99D` | Accent hover |
| `--accent-subtle` | `#18392D` | Selected navigation background |
| `--focus-ring` | `#64DFA8` | Keyboard focus |
| `--success` | `#3ECF8E` | Successful operations |
| `--success-subtle` | `#18392D` | Success background |
| `--warning` | `#E7B455` | Warnings and needs-review states |
| `--warning-subtle` | `#3A3020` | Warning background |
| `--danger` | `#F07178` | Critical events and destructive actions |
| `--danger-subtle` | `#3A2226` | Critical background |
| `--info` | `#78A9FA` | Informational states |
| `--info-subtle` | `#202F45` | Information background |

These are starting tokens; verify contrast before implementation. Green is the product accent, not a universal indicator that a patient's health is normal. Use semantic colors consistently.

Keep all tokens centralized so a light theme can be added later.

## 3. Typography

Use **Inter** or a similar clean sans-serif. Use monospace sparingly for device IDs, firmware versions, event codes, and technical identifiers.

- Page title: 20–24 px, semibold.
- Section title: 14–16 px, semibold.
- Body and controls: 13–14 px.
- Table headers: 11–12 px, muted.
- Supporting metadata: 11–12 px, but never too small for important clinical context.
- Measurement values: 24–30 px, with tabular numerals.
- Use compact, readable line heights and sentence-case labels.

Prefer consistent typography and alignment over introducing many different sizes and weights.

## 4. Layout and spacing

Use a consistent 4 px spacing scale.

- Sidebar: 220–240 px on desktop, collapsible to an icon rail.
- Top bar: 52–60 px.
- Page padding: 20–24 px desktop, 16 px tablet, 12 px narrow screens.
- Use available screen width rather than a narrow centered container.
- Prefer tabs, tables, split panes, and bordered sections over oversized card grids.
- Keep important patient identity, alert state, and data freshness visible when practical.

Use cards only when they group information with a real purpose.

Prefer:
- Compact measurement strips over oversized metric tiles.
- Tables for patients, devices, users, assignments, and events.
- Tabs for Overview, Trends, Waveforms, Events, and Notes.
- Split panes for event lists and event details.
- Inline metadata for last sync, battery, signal quality, and firmware.

Avoid nested card-on-card layouts.

### Responsive behavior

**Desktop**
- Persistent sidebar.
- Multi-column tables and wide chart panels.
- Split-pane detail views where useful.

**Tablet**
- Collapsible sidebar.
- Fewer table columns.
- Collapsible filters and compact layouts.

**Narrow screens**
- Navigation drawer.
- Stacked panels.
- Structured row details instead of tiny, unreadable tables.
- Essential actions must remain accessible without hover.

## 5. Shared application shell

### Sidebar

- Darkest surface with a subtle right border.
- Compact product logo and name.
- Grouped navigation with consistent outline icons.
- Active route uses a quiet green-tinted background, accent icon, and narrow indicator.
- Subtle hover state.
- Account and help controls near the bottom.
- Support collapse and expansion.

### Top bar

- Breadcrumb or current section on the left.
- Search, notifications, environment indicator, and user menu on the right.
- Compact workspace switcher for users with multiple roles.
- Permission-filtered search results.
- Environment labels should distinguish development and staging without cluttering production.

### Role-aware navigation

**Doctor**
- Overview
- Patients
- Alerts

Within a patient:
- Overview
- Trends
- Waveforms
- Events
- Notes

**Administration**
- Operations
- Users
- Patients
- Assignments
- Devices
- Monitoring Config
- Audit Logs
- System Health

Both workspaces must share the same visual system. The navigation and available actions distinguish roles, not a completely different theme.

## 6. Tables and data grids

Tables are a primary interface pattern.

- Typical row height: 40–48 px.
- Thin horizontal separators rather than heavy boxed borders.
- Muted, stable column headings.
- Consistent alignment for numeric values and timestamps.
- Sorting, filtering, pagination, and appropriate time-range selection.
- Sticky headers for long tables.
- Subtle hover states and clear selected-row states.
- Inline severity, data freshness, device status, and assignment status.
- Secondary actions in a compact overflow menu.
- Compact filter toolbar with visible active filters.
- Skeleton rows, empty states, retry states, and no-results feedback.
- Preserve table state when returning from a detail view where practical.

Never rely on color alone to communicate status.

### Patient table

Suggested columns:
1. Patient and approved identifier.
2. Current status or latest event.
3. Available key measurements.
4. Data freshness and last sync.
5. Device state.
6. Actions.

At narrow widths, hide lower-priority columns while preserving patient identity and freshness.

### Device registry

Suggested columns:
- Device ID.
- Linked patient.
- Firmware version.
- Last seen.
- Battery/device state.
- Operational status.
- Actions.

Use monospace for technical identifiers, not the entire table.

## 7. Buttons, inputs, and menus

### Buttons

- **Primary:** accent green background with high-contrast text.
- **Secondary:** surface background with a subtle border.
- **Tertiary:** text or ghost button.
- **Destructive:** semantic red, with confirmation for high-impact actions.
- Compact toolbar buttons: approximately 32–36 px high.
- Standard form buttons: approximately 36–40 px high.

Use concise verbs: “Assign doctor,” “Acknowledge,” “Register device,” and “Save changes.”

### Inputs

- Dark surface with subtle border.
- Clear accent-colored focus ring.
- Persistent visible labels; placeholders are not labels.
- Inline validation and useful helper text.
- Debounced network-backed search.
- Responsive filters that preserve their state.
- Keyboard-accessible menus, dialogs, tabs, and comboboxes.

### Dialogs

Use dialogs for focused tasks and consequential confirmations, not routine navigation.

For destructive changes, clearly explain what will change and what history will be retained. Support Escape and restore focus to the triggering control.

## 8. Motion and responsiveness

The interface should feel fast because of good interaction design—not animation.

- Short transitions around 100–160 ms.
- No bouncing, animated gradients, parallax, or decorative pulsing.
- Respect reduced-motion preferences.
- Update local UI state immediately when safe, then reconcile with the server.
- Use skeletons on first load and small progress indicators for refreshes.
- Keep current content visible during minor refreshes.
- Preserve scroll position and selected tabs when possible.
- Use optimistic updates only for reversible actions; roll back and explain if the server rejects them.
- Debounce searches and cancel obsolete requests.
- Use pagination or virtualization for large tables.
- Load chart and waveform data only for the selected time window.
- Do not fetch raw waveforms when a summary view only needs derived measurements.

Show “Updated just now” or a timestamp only when supported by actual data. Never animate a disconnected or stale sensor as if it were live.

## 9. Clinical monitoring interface

Keep the developer-tool aesthetic without compromising clinical readability.

### Measurement strip

At the top of a patient workspace, show a compact row or responsive grid of:
- Heart rate.
- SpO₂.
- Respiratory-rate estimate.
- Skin temperature.
- HRV.
- Activity.

Each measurement should show its value and unit, timestamp or aggregation window, source/estimate label where relevant, and signal quality.

Avoid oversized tiles and decorative illustrations.

### Data freshness and quality

Use explicit states:

- `Live` — only when a defined freshness rule is satisfied.
- `Delayed` or `Stale` — with the last-received timestamp.
- `No recent data` — when no valid value is available.
- `Poor signal` — when quality assessment indicates it.
- `Device disconnected` — when confirmed by device or phone state.

A green dot alone is insufficient. The text and timestamp are authoritative.

### Trends

- Compact time-range controls: `1h`, `6h`, `24h`, `7d`, `30d`, and custom range if supported.
- Legible axes, units, tooltips, and timestamps.
- Restrained lines and subtle gridlines.
- Honest missing-data gaps.
- Baseline overlays only when enough quality data exists.
- Clickable event markers.
- Concise legends with optional series toggling.

### ECG and PPG waveforms

- Dedicated wide panel with compact signal, time-range, zoom, and navigation controls.
- High-contrast waveform and fine grid.
- Display sampling rate, amplitude/time scales, source device, capture window, signal quality, and known missing samples.
- Distinguish detected peaks and events from the waveform itself.
- Use a split pane for event list and waveform details on wide screens; stack them on smaller screens.
- Do not imply diagnostic-grade status unless the acquisition and interpretation workflow is validated.

### Alerts and event review

Use a compact event list or table showing severity, event type, patient, time, duration, and status.

Event details can open in a side panel or dedicated page. Include:
- Supporting measurements.
- Baseline context where available.
- Signal quality and motion context.
- Data gaps.
- Rule/model version.
- Event history.

Supported states: New, Acknowledged, Under review, Resolved, False positive.

Acknowledging an alert must never delete the underlying event or its audit history.

## 10. AI-assisted review

AI should be a secondary analysis panel inside the patient workspace—not a giant chat-first interface.

- Compact summary with expandable details.
- Clear label: **AI-generated · verify against source data**.
- Display selected time window and generation time.
- Link claims to supporting charts, events, and measurements.
- Distinguish direct measurements, derived estimates, and AI interpretation.
- State when evidence or data quality is insufficient.
- Keep clinician notes separate from generated summaries.
- Avoid unsupported diagnoses and uncalibrated confidence percentages.
- Core monitoring must remain usable when the AI service is unavailable.

## 11. Administration workspace

Administration should feel like a well-designed operations console.

- Dense, searchable tables for users, patients, assignments, and devices.
- Compact filter toolbars.
- Clear row-level actions and dedicated detail pages.
- Confirmation for account suspension, assignment removal, device reassignment, and monitoring configuration changes.
- Versioned monitoring configurations with change history.
- Audit logs optimized for scanning: actor, action, target, timestamp, outcome, request ID.
- Health and synchronization failures presented with useful troubleshooting context.
- Separate operational metadata from clinical details. Do not expose patient readings unless the administrator's permissions require them.

## 12. Empty, loading, and error states

Design these explicitly:

- **Loading:** skeleton rows and panels matching the final layout.
- **Refreshing:** keep existing data visible with a small progress indicator.
- **Empty:** concise explanation and one useful next action.
- **No results:** show active filters and offer a reset.
- **Stale data:** preserve the last known value but de-emphasize it and show its timestamp.
- **Permission denied:** explain that access is unavailable without revealing whether unauthorized records exist.
- **Network/server error:** preserve user input and offer retry when safe.
- **AI unavailable:** leave the rest of the patient workspace usable.

## 13. Accessibility

- Target WCAG 2.2 AA.
- Maintain sufficient contrast for text, status labels, chart lines, borders, and focus rings.
- Use semantic headings and landmarks, labelled inputs, and accessible names for icon buttons.
- Ensure keyboard support for navigation, tables, tabs, dialogs, menus, and chart controls where practical.
- Never rely on color alone.
- Support zoom, reflow, and reduced motion.
- Do not make hover the only way to access critical actions.

## 14. Reusable components

Build reusable components around a shared token system:

- `AppShell`, `Sidebar`, `Topbar`, `WorkspaceSwitcher`
- `PageHeader`, `Breadcrumbs`, `Tabs`, `FilterToolbar`, `SearchCommand`
- `DataTable`, `TableSkeleton`, `Pagination`, `EmptyState`
- `StatusDot`, `StatusLabel`, `DataFreshness`, `SignalQuality`
- `MeasurementStrip`, `MeasurementValue`, `BaselineIndicator`
- `TrendChart`, `WaveformViewer`, `EventMarker`, `ChartToolbar`
- `EventList`, `EventDetailPanel`, `AlertActionBar`
- `AiReviewPanel`, `EvidenceReference`, `ClinicalNote`
- `ConfirmDialog`, `Toast`, `InlineError`, `LoadingButton`
- `PermissionGate` for frontend presentation only

All authorization must still be enforced by the backend.

Use one icon family with consistent stroke weight. Keep visible text for critical clinical actions.

## 15. Implementation approach

- Next.js App Router and TypeScript.
- Tailwind CSS with centralized CSS variables for design tokens.
- Use a consistent, accessible component primitive library styled to match this guide.
- Introduce table virtualization only if data volume requires it.
- Choose a chart library that supports responsive time-series data and custom ECG/PPG rendering.
- Standardize server state, loading behavior, request cancellation, and cache invalidation.
- Use synthetic data for visual development.
- Share shell components across doctor and admin routes.
- Never use visual polish to disguise missing data, poor signal quality, or unimplemented functionality.

## 16. Acceptance checklist

- The interface feels compact, precise, and responsive rather than card-heavy.
- Doctor and administration workspaces feel like one coherent product.
- Tables, filters, tabs, and detail panels are first-class UI patterns.
- Common interactions feel immediate and avoid unnecessary full-page loading.
- Stale, missing, delayed, and poor-quality data are unmistakable.
- Clinical alerts use restrained, meaningful semantic colors.
- Waveforms are legible and include necessary context.
- Responsive layouts preserve essential actions and information hierarchy.
- Keyboard focus, contrast, reduced motion, loading, empty, and error states are covered.
- The UI borrows Supabase's design qualities without copying its branding or exact interface.
