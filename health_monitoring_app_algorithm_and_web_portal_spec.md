# Health Monitoring System --- App Processing, Derived Metrics, Algorithm Upgrade & Web Portal Specification

## 1. Project objective

Extend the existing three-sensor health-monitoring system without
replacing its working hardware acquisition setup.

The system consists of: - **Temperature sensor** - **MAX30102** optical
sensor (red and infrared channels) - **IMU** (accelerometer and
gyroscope)

The mobile app already calculates **heart rate (BPM)** and **SpO₂**. The
work in this specification is to:

1.  Add 5--7 additional, meaningful metrics derived from the three
    sensor streams.
2.  Upgrade the existing app-side BPM/SpO₂ processing to a more robust,
    quality-aware algorithm.
3.  Add MAX30102 contact/PPG-quality assessment so the app does not
    calculate or display misleading values when an object, motion
    artefact, or poor contact is present.
4.  Build a simple web interface from the ground up with **Admin,
    Doctor, and Patient** roles.
5.  Keep all sensor conversion and signal processing on the mobile app.
    The Pico W remains responsible for sensor acquisition and raw-data
    transmission only.

This document specifies functionality and architecture. It does **not**
prescribe a visual style or create a new visual design. The web
interface should follow the same overall visual language, terminology,
and interaction feel as the existing mobile app.

------------------------------------------------------------------------

## 2. System architecture and processing boundary

``` text
Temperature sensor ─┐
MAX30102 ───────────┼──> Pico W: acquire raw samples
IMU ────────────────┘             |
                                  v
                         BLE NUS raw-data stream
                                  |
                                  v
                           Existing mobile app
                                  |
                 +----------------+----------------+
                 |                |                |
                 v                v                v
          Temperature         MAX30102             IMU
          conversion          PPG processing       conversion
                 |                |                |
                 v                v                v
             Temperature      BPM, SpO2,          Acceleration,
             and trend        PI, PRV, RR         movement, posture
                 |                |                |
                 +----------------+----------------+
                                  |
                                  v
                       Validation and timestamps
                                  |
                                  v
                        Mobile app dashboard
                                  |
                                  v
                       Authenticated API / sync
                                  |
                                  v
                         Web application
                    Admin | Doctor | Patient
```

### 2.1 Pico W responsibilities

-   Read the sensors using the existing working drivers.
-   Preserve the current sensor configuration and acquisition behaviour.
-   Preserve the existing MAX30102 FIFO setup and red/IR sample pairing.
-   Transmit raw values, timestamps/sequence information, and
    sensor-error status over the existing BLE NUS connection.
-   Do **not** calculate BPM, SpO₂, temperature, HRV/PRV, respiratory
    rate, activity, posture, or other derived metrics.

### 2.2 Mobile app responsibilities

-   Receive and parse the raw BLE stream.
-   Reassemble fragmented BLE messages and detect missing/out-of-order
    samples.
-   Convert temperature and IMU raw readings using the verified
    sensor-specific scale factors.
-   Buffer paired MAX30102 red/IR samples and perform PPG processing.
-   Calculate BPM, SpO₂ and the additional derived metrics listed below.
-   Run contact, signal-quality, and validity checks.
-   Display live results and clearly distinguish valid, invalid, stale,
    and unavailable values.
-   Store/synchronise permitted measurements with the backend for the
    web portal.

### 2.3 Backend and web responsibilities

-   Authenticate users and enforce Admin, Doctor, and Patient
    permissions.
-   Store patient profiles, authorised doctor-patient relationships,
    measurements, and audit events.
-   Serve historical measurements and summaries to the web interface.
-   Never pretend that the backend or web UI is directly reading the
    Pico W sensors.
-   Never recalculate sensor metrics differently from the mobile app
    unless a separately versioned, tested server-side analytics service
    is intentionally introduced.

**Source of truth:** The mobile app's validated processing pipeline
produces the measurement values. The backend stores the values,
timestamps, validity flags, and algorithm version received from the app.

------------------------------------------------------------------------

## 3. Additional derived metrics: recommended set

BPM and SpO₂ are already calculated by the app. They remain core
measurements, but they are **not counted** among the additional metrics
requested here.

The following six metrics are the recommended first set. A seventh is
optional and depends on how the device is worn.

  ---------------------------------------------------------------------------------------------------
           Priority Additional       Sensor source     Why it is useful   Implementation confidence /
                    metric                                                caveat
  ----------------- ---------------- ----------------- ------------------ ---------------------------
                  1 **Pulse-rate     MAX30102 pulse    Tracks variation   Requires clean, motion-free
                    variability (PRV intervals         in beat-to-beat    pulse intervals.
                    / HRV-like                         timing; useful for PPG-derived PRV is not
                    metric)**                          longitudinal       identical to ECG-derived
                                                       trends             HRV.

                  2 **Respiratory    MAX30102 PPG; IMU Adds a             Estimate from respiratory
                    rate estimate**  can help identify breathing-rate     modulation of PPG only when
                                     motion artefacts  trend without      signal quality and
                                                       another sensor     recording duration are
                                                                          adequate. Validate against
                                                                          a reference.

                  3 **Perfusion      MAX30102 red      Quantifies         Define the channel and
                    index (PI)**     and/or IR PPG     pulsatile AC       AC/DC method consistently.
                                                       amplitude relative Not a standalone diagnosis
                                                       to the optical DC  or universal contact
                                                       baseline; also     threshold.
                                                       helps assess PPG   
                                                       signal strength    

                  4 **Skin/contact   Temperature       Shows changes in   Call it skin/contact
                    temperature      sensor            the temperature    temperature only if the
                    trend**                            measured at the    sensor is actually mounted
                                                       sensor location    in suitable skin contact.
                                                                          Otherwise label it sensor
                                                                          temperature.

                  5 **Activity /     IMU accelerometer Distinguishes      Requires the IMU to be worn
                    movement                           stillness, light   in a known position and
                    intensity**                        movement, and      thresholds to be tested.
                                                       higher movement    
                                                       intensity          

                  6 **Posture /      IMU               Tracks orientation First report device
                    orientation      accelerometer +   changes and can    orientation. Call it body
                    state**          gyroscope         support            posture only after
                                                       posture-duration   validating placement and
                                                       trends             classification.

       7 (optional) **Fall /         IMU               Can flag a         Not a confirmed fall
                    sudden-impact    accelerometer +   possible fall-like detector. Requires
                    event flag**     gyroscope         event for review   wearing-position-specific
                                                                          tuning and extensive
                                                                          false-positive testing.
  ---------------------------------------------------------------------------------------------------

### 3.1 Metric details and calculation requirements

#### A. Pulse-rate variability (PRV)

Derive beat-to-beat intervals (IBIs) from the validated PPG pulse
detector. For a clean sequence of intervals, calculate RMSSD:

\[ RMSSD =
`\sqrt{\frac{1}{N-1}\sum_{i=1}^{N-1}(IBI_{i+1}-IBI_i)^2}`{=tex} \]

-   Store the recording duration and number of accepted beats alongside
    the result.
-   Reject windows with movement artefacts, missed beats, or implausible
    intervals.
-   Use a sufficiently long recording protocol; do not report a
    meaningful PRV result from only a few beats.
-   Label the metric **PPG-derived PRV** or **PRV (RMSSD)**, not ECG
    HRV.
-   Do not infer stress, disease, or emotional state from this metric
    alone.

#### B. Respiratory rate estimate

Breathing can modulate the PPG waveform through changes in amplitude,
baseline, and pulse timing. An app can analyse these slower modulations
over a longer window.

-   Use a dedicated low-frequency respiratory-analysis path on the PPG
    signal.
-   Reject periods with motion, poor contact, irregular pulse detection,
    or insufficient recording duration.
-   Return breaths/minute only when the estimate passes quality checks.
-   If the algorithm is not validated, keep the metric experimental and
    do not show it as a dependable vital sign.
-   The IMU can be used to flag motion-corrupted windows; do not assume
    it directly measures respiration unless its placement supports that
    use.

#### C. Perfusion index (PI)

A commonly used PPG feature is:

\[ PI(%) = 100 `\times `{=tex}`\frac{AC}{DC}`{=tex} \]

Specify whether PI uses the red or IR channel and how AC and DC are
estimated. Keep that definition fixed across firmware/app versions and
historical records.

-   PI can indicate the relative strength of pulsatile optical
    variation.
-   It can help identify weak PPG signal conditions.
-   PI is affected by sensor placement, pressure, optical coupling, LED
    settings, and individual variation.
-   Do not use a universal PI threshold to prove finger contact or
    diagnose perfusion problems.

#### D. Temperature trend

-   Convert raw temperature using the exact sensor datasheet.
-   Store the actual measured location/type (for example,
    `sensor_temperature_c` or `skin_contact_temperature_c`).
-   Derive a trend such as change over a selected time window, rolling
    average, and rate of change.
-   Do not label it core body temperature unless the hardware placement
    and measurement method have been validated for that purpose.

#### E. Activity / movement intensity

After converting IMU axes into g or m/s², calculate acceleration
magnitude:

\[ A = `\sqrt{a_x^2+a_y^2+a_z^2}`{=tex} \]

For movement intensity, estimate/remove the gravity component and
calculate a windowed feature such as dynamic acceleration RMS or
standard deviation.

Possible app categories: - `still` - `light_activity` -
`moderate_activity` - `high_activity` - `unknown`

Thresholds must be calibrated for the device's actual wearing position.
If placement is unknown, display movement intensity rather than claiming
a precise activity classification.

#### F. Posture / orientation

-   Use accelerometer gravity direction for a stable reference when
    dynamic acceleration is limited.
-   Use gyroscope data for short-term rotational changes.
-   Fuse the signals using a complementary filter or another appropriate
    orientation filter.
-   Report device orientation (for example, orientation angles or
    orientation class) first.
-   Only infer sitting, standing, lying, or body posture if the device
    location and classifier have been validated.

#### G. Optional fall-like event flag

If the device is worn in a fixed, validated position: - Detect candidate
high-acceleration events. - Examine the following orientation/rotation
change and movement pattern. - Apply a post-event inactivity check. -
Mark the output as `possible_fall_event`, not `fall_confirmed`. -
Provide a user confirmation/cancellation workflow if the product later
supports alerts. - Test false positives from dropping the device,
placing it on a table, jumping, running, and ordinary daily movements.

### 3.2 Recommended release scope

For the first stable release, implement: 1. PRV (RMSSD) with strict
quality gates. 2. PI. 3. Temperature trend. 4. Activity / movement
intensity. 5. Device orientation.

Keep respiratory rate experimental until validated. Keep fall-like event
detection optional until device placement and false-positive performance
are understood.

This gives five practical additions without overclaiming what the three
sensors can measure.

------------------------------------------------------------------------

## 4. Upgrade the existing BPM and SpO₂ algorithm

### 4.1 Goal

The app already calculates BPM and SpO₂. Do not create a second
competing implementation or remove the existing one before comparison.

Upgrade the existing processing module to a quality-aware MAX3010x
pipeline based on a known reference implementation, such as the
Maxim/Analog Devices algorithm commonly ported in the SparkFun MAX3010x
library.

The upgrade should improve: - paired red/IR sample handling, - baseline
and pulsatile-signal processing, - pulse detection and interval
validation, - SpO₂ ratio calculation, - signal-quality and contact-state
handling, - independent validity of BPM and SpO₂, - handling of motion,
missing samples, clipping, and stale results.

### 4.2 Preserve acquisition and compare before replacing

-   Keep the current MAX30102 FIFO configuration and working sensor
    acquisition code unchanged.
-   Confirm the effective sample rate and pulse-width/LED configuration.
-   Keep the current app algorithm available behind a development
    comparison switch until the new algorithm has been tested.
-   Feed the same raw sample windows to the existing and upgraded
    algorithms.
-   Log both outputs, validity decisions, and processing time during
    development.
-   Replace the production path only after regression tests pass.

### 4.3 Input requirements

The app processor must receive time-ordered paired samples:

``` text
(red[0], ir[0])
(red[1], ir[1])
(red[2], ir[2])
...
```

It must know: - effective sample rate, - sample timestamps or a reliable
timing basis, - raw ADC count format, - relevant sensor configuration, -
sequence gaps or dropped samples.

Do not mix red and IR samples from different time intervals. Do not
calculate across a corrupted window.

### 4.4 Processing pipeline

1.  **Buffer paired samples:** maintain equal-length rolling red and IR
    arrays.
2.  **Validate timing and continuity:** detect missing, duplicated,
    out-of-order, or irregularly timed samples.
3.  **Check optical range:** detect no-signal conditions, clipping, and
    saturation.
4.  **Remove baseline:** estimate the slowly varying DC component
    separately for red and IR.
5.  **Extract pulsatile component:** isolate the AC waveform.
6.  **Detect pulse candidates:** use the selected reference algorithm's
    pulse detection logic.
7.  **Validate intervals:** reject implausible or inconsistent beat
    intervals and motion-corrupted windows.
8.  **Calculate AC/DC values:** calculate red and IR
    pulsatile-to-baseline ratios.
9.  **Calculate ratio of ratios:**

\[ R = `\frac{AC_{\mathrm{red}}/DC_{\mathrm{red}}}`{=tex}
{AC\_{`\mathrm{IR}`{=tex}}/DC\_{`\mathrm{IR}`{=tex}}} \]

10. **Estimate SpO₂:** use the reference algorithm's lookup table or
    supported calibration relationship.
11. **Estimate BPM:** derive pulse rate from accepted pulse intervals
    using the selected algorithm's logic.
12. **Apply independent validity checks:** BPM and SpO₂ may have
    different validity outcomes.
13. **Publish results:** update the app only when the relevant metric
    passes validation.

The ratio (R) is an intermediate feature, not an SpO₂ percentage. Do not
copy only a polynomial or lookup table and omit the signal-processing
stages.

### 4.5 Contact and PPG signal-quality state machine

The MAX30102 measures reflected red/IR light. A high reading only proves
that light is reaching the photodiode; paper, fabric, plastic, and other
objects can also reflect light. The sensor alone cannot prove that a
human finger is present.

Use these states:

  -----------------------------------------------------------------------
  State                   Meaning                 App behaviour
  ----------------------- ----------------------- -----------------------
  `no_signal`             Optical signal absent   "Place finger on
                          or below a validated    sensor"
                          threshold               

  `signal_present`        Reflection exists, but  "Signal detected ---
                          no reliable pulse has   measuring"
                          been verified           

  `verifying_pulse`       Collecting enough       "Keep finger still"
                          paired samples to       
                          evaluate waveform       
                          quality and periodicity 

  `pulse_likely`          Repeatable pulse-like   Continue measurement;
                          activity is present in  this does not guarantee
                          both channels           valid SpO₂

  `measurement_valid`     One or both metric      Display only the
                          algorithms pass their   metric(s) that passed
                          validity checks         

  `poor_signal`           Noisy, clipped,         "Adjust finger / keep
                          motion-corrupted, or    still"
                          inconsistent window     

  `sensor_error`          BLE, packet parsing, or Show sensor/connection
                          acquisition error       error
                          reported                
  -----------------------------------------------------------------------

The app should evaluate: - red and IR DC levels, - red and IR AC
amplitudes, - pulse interval plausibility and consistency, - red/IR
pulse correspondence, - clipping/saturation, - baseline jumps and motion
artefacts, - the reference algorithm's own validity output.

Thresholds must be empirically selected for this hardware configuration.
Do not use a high DC value or a single AC peak as proof of finger
contact.

### 4.6 Detection pseudocode

``` text
on each incoming paired red/IR sample:
    validate packet, sequence and timestamp
    append pair to equal-length rolling buffers

    if window is too short or samples are missing:
        state = verifying_pulse
        return

    calculate red_DC and ir_DC
    check no-signal condition and clipping/saturation

    if no meaningful optical signal:
        state = no_signal
        invalidate current BPM and SpO2
        return

    remove baseline from both channels
    calculate red_AC and ir_AC
    detect pulse candidates using reference algorithm

    evaluate:
        pulse interval plausibility and consistency
        red/IR pulse correspondence
        AC amplitude and waveform quality
        motion/noise and clipping indicators

    if window is noisy, clipped or inconsistent:
        state = poor_signal
        invalidate current estimates
        return

    if no repeatable pulse is present:
        state = signal_present or verifying_pulse
        do not publish valid BPM or SpO2
        return

    state = pulse_likely

    run BPM validity checks
    run SpO2 validity checks independently

    publish BPM only if BPM checks pass
    publish SpO2 only if SpO2 checks pass

    if either metric passes:
        state = measurement_valid
```

This is an integration outline. Preserve the selected algorithm's actual
buffer requirements, pulse detector, lookup table, and validity logic.

### 4.7 Distinguishing fingers from other objects: limits and tests

A stationary object may produce a strong DC signal but normally will not
produce a genuine cardiac pulse. However, vibration, periodic tapping,
and changing pressure can imitate periodic optical fluctuations.

Use multiple consecutive clean windows, red/IR correspondence, plausible
intervals, and signal-quality checks. Even then, describe the result as
**probable tissue contact with a valid PPG signal**, not definitive
human identification.

Test: - uncovered sensor, - finger held still, - finger moving, -
paper, - fabric, - stationary plastic, - vibrating/tapped object, -
finger removed during measurement, - dropped/reordered BLE packets.

For every test, log the raw traces, state transitions, and metric
validity decisions. Do not hard-code expected outcomes as guaranteed:
some non-biological objects may pass simplistic signal checks.

### 4.8 Separate output validity

Maintain separate fields:

``` json
{
  "max30102_state": "verifying_pulse",
  "optical_signal_present": true,
  "contact_likely": true,
  "pulse_detected": false,
  "ppg_signal_quality": "insufficient",
  "heart_rate_bpm": null,
  "heart_rate_valid": false,
  "spo2_percent": null,
  "spo2_valid": false,
  "algorithm_version": "max3010x-app-v2"
}
```

`contact_likely` is a heuristic, not proof of human identity. Do not
keep showing the last valid BPM/SpO₂ as if it were current after the
signal becomes invalid. Preserve the old value only as timestamped
history and mark it stale.

### 4.9 Algorithm references

-   SparkFun MAX3010x SpO₂ algorithm:\
    https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/src/spo2_algorithm.cpp
-   Maxim/Analog Devices heart-rate reference implementation:\
    https://github.com/MaximIntegrated/Maxim-HeartRate
-   Analog Devices --- Guidelines for SpO₂ Measurement:\
    https://www.analog.com/en/resources/technical-articles/guidelines-for-spo2-measurement.html
-   MAX30102 datasheet:\
    https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf

The algorithm output is an engineering estimate until the complete
device has been appropriately calibrated and validated. Do not claim
clinical accuracy or use prototype results for medical decisions.

------------------------------------------------------------------------

## 5. App-side data model and synchronisation

The app should store raw diagnostic samples separately from processed
measurements. Normal dashboard and web queries should primarily use
processed measurements.

### 5.1 Processed measurement record

Each record should include: - patient/device identifier, - measurement
timestamp, - received timestamp, - sequence number or session ID, -
metric name and value, - unit, - validity flag, - quality/status, -
algorithm version, - source sensor(s).

Example:

``` json
{
  "patient_id": "patient-id",
  "device_id": "device-id",
  "measured_at": "2026-10-31T08:00:00Z",
  "algorithm_version": "max3010x-app-v2",
  "metrics": {
    "heart_rate_bpm": {"value": 76, "unit": "bpm", "valid": true},
    "spo2_percent": {"value": 97, "unit": "%", "valid": true},
    "prv_rmssd_ms": {"value": 34, "unit": "ms", "valid": true},
    "perfusion_index_percent": {"value": 2.1, "unit": "%", "valid": true},
    "respiratory_rate_bpm": {"value": null, "unit": "breaths/min", "valid": false},
    "temperature_c": {"value": 33.2, "unit": "°C", "valid": true},
    "activity_level": {"value": "light_activity", "valid": true},
    "orientation": {"value": "upright", "valid": true}
  }
}
```

All values are examples, not actual readings. `patient_id` and
`device_id` are placeholders.

### 5.2 Synchronisation rules

-   Synchronise processed data only after app-side validation.
-   Preserve timestamps from the sample/measurement window, not merely
    the upload time.
-   Queue records locally when offline and retry safely.
-   Make uploads idempotent using a record/session ID.
-   Avoid uploading every raw MAX30102 sample by default; retain raw
    traces locally for diagnostics or upload them only when explicitly
    enabled and consented to.
-   Include algorithm version so historical results can be interpreted
    after algorithm updates.
-   Do not overwrite historical measurements when the algorithm changes.
    Store new results with the new version.

------------------------------------------------------------------------

## 6. Simple web interface --- functional specification

Build a simple web application from the ground up with three roles: -
**Admin** - **Doctor** - **Patient**

The web interface should have the same overall feel as the existing
mobile app. Reuse its terminology, visual conventions, colours,
typography, spacing, icon language, and status labels where possible. Do
not redesign the mobile app or invent a separate visual identity. The
exact styling is intentionally left to the existing app.

### 6.1 Web application goals

-   Give patients a way to view their own measurements and trends.
-   Give doctors a way to view only patients who have been assigned to
    them or have explicitly authorised access.
-   Give admins a way to manage users, devices, and doctor-patient
    assignments.
-   Present current and historical data clearly.
-   Make invalid, poor-quality, stale, or missing measurements obvious.
-   Keep the initial portal deliberately simple; avoid unnecessary
    clinical workflow features.

### 6.2 Role and permission matrix

  -------------------------------------------------------------------------------
  Capability               Admin               Doctor               Patient
  ----------------- ------------------- --------------------- -------------------
  Sign in / sign            Yes                  Yes                  Yes
  out                                                         

  View own                  Yes                  Yes                  Yes
  account/profile                                             

  Create, disable,          Yes                  No                   No
  and manage user                                             
  accounts                                                    

  Assign doctors to         Yes                  No                   No
  patients                                                    

  Register/assign           Yes                  No                   No
  devices                                                     

  View all users            Yes                  No                   No
  and system/device                                           
  status                                                      

  View assigned          Optional                Yes                  No
  patients                                                    

  View a patient's   Only if required    Assigned/authorised     Own data only
  measurements        for support and       patients only     
                          audited                             

  View historical    Only if required    Assigned/authorised     Own data only
  graphs              for support and       patients only     
                          audited                             

  Export             Admin-controlled    Assigned/authorised     Own data, if
  measurement                           patients, if enabled        enabled
  history                                                     

  Edit medical              No                   No                   No
  measurements                                                

  Edit                 Limited admin         Own profile          Own profile
  account/profile         fields                              
  details                                                     

  View audit log            Yes                  No                   No
  -------------------------------------------------------------------------------

**Important:** Admin access to health measurements should not be
automatic just because the role is Admin. Prefer metadata/system
administration by default; any exceptional access to patient
measurements must be permissioned and audited.

### 6.3 Admin interface

The Admin role should have these pages:

**A. Admin dashboard** - Total registered patients. - Total doctors. -
Registered devices. - Devices currently reporting / not recently
reporting. - Recent account/device events. - Basic system status.

Do not show patient health readings on the admin dashboard by default.

**B. User management** - List/search users. - Create doctor and patient
accounts. - Activate/deactivate accounts. - Reset or initiate password
reset. - Assign role. - View account status and creation date.

**C. Doctor-patient assignment** - Assign one or more patients to a
doctor, according to the product's intended care model. - Revoke an
assignment. - Show assignment status and timestamps. - Prevent doctors
from seeing unassigned patients.

**D. Device management** - Register a device. - Associate a device with
a patient. - Change or revoke a device assignment. - Show device
identifier, last-seen time, app/device status, and firmware/app protocol
version if available. - Do not expose BLE credentials or secrets.

**E. Audit log** - Record account creation, role changes, assignment
changes, device assignment changes, data exports, and exceptional access
to patient records. - Show actor, action, target, timestamp, and
outcome.

### 6.4 Doctor interface

**A. Doctor dashboard** - List of assigned patients. - Search/filter by
patient. - Last data-sync time for each patient. - Latest available
measurement timestamp. - Data-quality/connection indicator. - Avoid
making automated diagnosis or treatment recommendations.

**B. Patient overview** - Patient's basic permitted profile
information. - Device assignment and last-seen time. - Latest valid BPM,
SpO₂ estimate, temperature, and additional metrics. - Clear indication
when a value is invalid, unavailable, or stale. - Link to measurement
history.

**C. Measurement detail** - Time-series charts for BPM and SpO₂. -
Temperature trend. - PRV/PI trend where valid data exists. - Activity
and orientation timeline. - Respiratory-rate trend only if the
experimental estimator is enabled and labelled accordingly. -
Signal-quality markers and gaps in the time series. - Algorithm version
and measurement timestamps. - Do not connect invalid points as if they
were continuous valid measurements.

**D. Patient history** - Select date/time range. - Filter by metric. -
View valid/invalid status and quality. - Export only if enabled by
product policy and patient authorisation.

**E. Notes (optional later phase)** - If notes are added, keep them
separate from automatically measured data. - Record author and
timestamp. - Do not let a note silently alter a sensor measurement.

### 6.5 Patient interface

**A. Patient dashboard** - Latest valid measurements. - Last update time
and device connection/sync status. - BPM and SpO₂ estimate. -
Temperature with accurate label (sensor or skin-contact temperature). -
Additional available metrics: PRV, PI, activity, orientation. -
Respiratory rate only if validated or clearly marked experimental. -
Plain-language sensor states such as "Place finger", "Measuring", "Poor
signal", and "Last updated".

**B. My trends** - Daily/weekly/monthly graphs. - Select a metric and
date range. - Show gaps and invalid windows. - Avoid implying that a
change is clinically significant without an appropriate reference and
clinical context.

**C. My devices** - Device name/identifier. - Last sync time. -
Connection status as last reported by the app. - Basic instructions for
reconnecting.

**D. My account and privacy** - View/edit permitted profile fields. -
View authorised doctor relationship. - View data-sharing
status/consent. - Sign out and initiate account recovery.

### 6.6 Shared UI requirements

-   Use the same labels and units as the mobile app.
-   Reuse the mobile app's design language rather than introducing a new
    one.
-   Make role-specific navigation simple and predictable.
-   Clearly show last-updated timestamps.
-   Show loading, empty, error, stale, and disconnected states.
-   Do not show invalid readings as zero.
-   Do not use red/green colours as the only way to communicate status;
    include text labels/icons.
-   Make charts readable on desktop and mobile browser widths.
-   Provide accessible labels, keyboard navigation, and sufficient
    contrast.
-   Do not show patient identifiers or health data in URLs where
    avoidable.
-   Do not cache sensitive patient data in shared/public browser
    sessions.

------------------------------------------------------------------------

## 7. Backend/API requirements for the web portal

The backend is the access-control and data-persistence layer. The mobile
app should send processed, timestamped measurements to authenticated
endpoints.

Suggested resource groups (exact routes can be chosen during
implementation):

  -----------------------------------------------------------------------
  Resource group                      Purpose
  ----------------------------------- -----------------------------------
  Authentication                      Sign in, sign out, token/session
                                      refresh, password reset

  Users                               Admin user management and profile
                                      retrieval

  Patients                            Patient profile and permitted
                                      patient listing

  Doctors                             Doctor profile and assigned-patient
                                      listing

  Assignments                         Create/revoke doctor-patient
                                      relationships

  Devices                             Register and assign devices;
                                      last-seen status

  Measurements                        Store and retrieve processed
                                      measurements

  Trends                              Return time-series data for
                                      selected metrics and ranges

  Audit                               Record and retrieve authorised
                                      administrative events

  Consent                             Record data-sharing authorisation
                                      and revocation
  -----------------------------------------------------------------------

### 7.1 Example endpoint shape

Illustrative only; final routes should match the existing backend
conventions.

``` text
POST   /auth/login
POST   /auth/logout
GET    /me

GET    /admin/users
POST   /admin/users
PATCH  /admin/users/{user_id}/status

GET    /admin/devices
POST   /admin/devices
POST   /admin/assignments
DELETE /admin/assignments/{assignment_id}

GET    /doctor/patients
GET    /doctor/patients/{patient_id}/measurements
GET    /doctor/patients/{patient_id}/trends

GET    /patient/me/measurements
GET    /patient/me/trends
GET    /patient/me/devices

POST   /measurements/batch
GET    /audit-events
```

Do not rely on frontend route hiding for security. Every endpoint must
enforce role and patient-level access on the server.

### 7.2 Minimum data entities

-   `User`: identity, login identifier, password hash or
    identity-provider reference, role, account status.
-   `PatientProfile`: patient-specific profile fields.
-   `DoctorProfile`: doctor-specific profile fields.
-   `Device`: device ID, status, protocol/app version, last-seen
    timestamp.
-   `DeviceAssignment`: device-to-patient association and validity
    period.
-   `DoctorPatientAssignment`: doctor-to-patient access relationship and
    validity period.
-   `Measurement`: patient, device, timestamp, metric, value, unit,
    validity, quality, algorithm version.
-   `Consent`: patient, scope, authorised party, status, timestamps.
-   `AuditEvent`: actor, action, target, timestamp, outcome.

Use stable internal IDs. Do not use a patient's name or email as the
primary key.

------------------------------------------------------------------------

## 8. Security, privacy, and safety requirements

Health measurements are sensitive personal data. Design access control
and data handling from the beginning.

-   Use authenticated sessions and secure password storage or a
    reputable identity provider.
-   Enforce role-based access control and patient-level authorisation on
    every backend request.
-   A doctor can access only assigned/authorised patients.
-   A patient can access only their own records.
-   Admin access to health readings should be exceptional, limited, and
    audited.
-   Use HTTPS for all web/API traffic.
-   Protect sessions and tokens; do not store long-lived secrets in
    insecure browser storage.
-   Validate all incoming measurement payloads and enforce size/rate
    limits.
-   Record audit events for account changes, access grants/revocations,
    exports, and exceptional health-record access.
-   Provide patient data-sharing consent and revocation workflows
    appropriate to the product.
-   Define retention, deletion, backup, and breach-response policies
    before deployment.
-   Avoid sending patient health data to analytics or error-tracking
    services unless appropriately protected and disclosed.
-   Do not present the prototype as a certified medical device.
-   Clearly label SpO₂ as an estimate until the complete device has
    undergone appropriate calibration and validation.
-   Do not provide automated diagnosis, medication, or treatment advice
    in the first version.

Because the product will handle health data in India, obtain appropriate
legal/privacy review before real-patient deployment. This specification
is an engineering requirement, not legal advice.

------------------------------------------------------------------------

## 9. Development phases and acceptance criteria

### Phase 1 --- Confirm data contract

-   Document the existing BLE raw packet format.
-   Confirm exact temperature and IMU models and configurations.
-   Confirm MAX30102 sample rate, FIFO output format, and red/IR
    pairing.
-   Confirm how the current app stores BPM/SpO₂ results.

**Complete when:** raw inputs, units, timestamps, and sample rates are
unambiguous.

### Phase 2 --- Upgrade BPM/SpO₂ processing

-   Port/adapt the selected reference algorithm inside the app.
-   Preserve existing FIFO acquisition and compare old/new algorithms on
    identical sample windows.
-   Add signal-quality and contact-likelihood states.
-   Add independent BPM and SpO₂ validity flags.
-   Test no-contact, finger, movement, paper, fabric, stationary object,
    vibration, and packet-loss cases.

**Complete when:** the app rejects poor windows, does not publish
invalid estimates, and has documented comparison results.

### Phase 3 --- Add additional metrics

Recommended order: 1. PI. 2. PRV/RMSSD. 3. Temperature trend. 4.
Activity intensity. 5. Orientation. 6. Respiratory-rate estimator
(experimental until validated). 7. Possible-fall event flag (optional,
placement-dependent).

**Complete when:** every metric has a defined formula, unit, input
window, quality gate, validity flag, timestamp, and test results.

### Phase 4 --- Backend and data sync

-   Add authentication and user roles.
-   Add patient/device/assignment entities.
-   Add measurement ingestion and history APIs.
-   Add offline queue/retry and idempotency.
-   Add audit logging and consent controls.

**Complete when:** app measurements sync reliably and access is enforced
server-side.

### Phase 5 --- Web portal

Build the basic portal in this order: 1. Authentication and role-aware
navigation. 2. Admin user/device/assignment pages. 3. Doctor
assigned-patient list and patient measurement views. 4. Patient
dashboard and personal trends. 5. Audit log and privacy controls. 6.
Loading, empty, error, stale, and disconnected states.

**Complete when:** each role can perform only its permitted actions and
cannot access another role's protected data.

### Phase 6 --- End-to-end validation

-   Test with all three sensor streams active.
-   Test BLE disconnect/reconnect and missing samples.
-   Test app offline sync and duplicate uploads.
-   Test role permissions with separate test accounts.
-   Test direct API access attempts across roles.
-   Test that invalid measurements remain invalid in stored history and
    web charts.
-   Verify that algorithm version and timestamps appear in historical
    records.

------------------------------------------------------------------------

## 10. Decisions and information to confirm before implementation

The following details are still needed to turn this specification into
exact implementation tasks:

  -----------------------------------------------------------------------
  Item                                Why it matters
  ----------------------------------- -----------------------------------
  Existing mobile app                 Determines how to integrate the
  framework/language                  updated PPG algorithm and metric
                                      modules

  Existing BPM/SpO₂ implementation    Needed to compare and upgrade
                                      rather than accidentally replace
                                      working logic

  MAX30102 sample rate and LED/pulse  Required for buffer timing and
  settings                            algorithm configuration

  Existing BLE raw packet format      Needed to ensure the app processor
                                      receives the right paired samples

  Exact temperature sensor model      Required for correct temperature
                                      conversion

  Exact IMU model and configured      Required for acceleration/gyro
  ranges                              scale factors

  Device wearing/location             Determines whether activity,
                                      posture, fall-like events, and
                                      skin-contact temperature are
                                      meaningful

  Existing backend, if any            Determines whether to extend it or
                                      create the API layer

  Existing app design references      Needed to match the web portal's
                                      feel without inventing a new visual
                                      identity

  Doctor/patient relationship model   Determines assignment and consent
                                      rules
  -----------------------------------------------------------------------

Do not assume the app framework, backend stack, sensor model, or wearing
location. Confirm them before writing production code.

------------------------------------------------------------------------

## 11. Scope boundaries

The first web portal is a monitoring and data-review interface, not a
full hospital information system.

Do not include in the first release unless separately requested: -
automated diagnosis, - treatment recommendations, - prescriptions, -
billing, - appointment scheduling, - video consultations, - complex
electronic medical records, - unvalidated blood-pressure estimation, -
unvalidated stress or calorie claims.

The initial goal is a dependable data pipeline, transparent measurement
quality, useful derived metrics, and secure role-specific access.
