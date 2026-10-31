# App-Side Processing: Converting Raw Data from Three Sensors into Usable Measurements

## 1. Core requirement

**All sensor-data conversion and signal processing must happen inside
the mobile app, not on the Raspberry Pi Pico W firmware.**

The Pico W should act as a sensor-data acquisition and BLE transport
device:

1.  Read the three sensors using the existing working drivers.
2.  Send the raw sensor readings to the mobile app over the existing BLE
    Nordic UART Service (NUS).
3.  Avoid converting temperature, calculating heart rate or SpO₂,
    converting IMU readings into physical units, or performing sensor
    fusion on the Pico W.

The app receives the raw readings, decodes them, performs all required
calculations, validates the results, and displays usable measurements.

This document is an app-development specification. It is intentionally
focused on the mobile app's responsibilities.

------------------------------------------------------------------------

## 2. Target architecture

``` text
Temperature sensor ─┐
MAX30102 ───────────┼──> Pico W: read raw sensor data
IMU ────────────────┘             |
                                  v
                         BLE NUS notifications
                                  |
                                  v
                         Mobile app BLE layer
                                  |
                                  v
                         Raw-data message parser
                                  |
                 +----------------+----------------+
                 |                |                |
                 v                v                v
           Temperature        MAX30102            IMU
             decoder         signal processing   decoder
                 |                |                |
                 v                v                v
              °C              SpO₂ + HR         g + °/s
                 |                |                |
                 +----------------+----------------+
                                  |
                                  v
                       Validation and quality checks
                                  |
                                  v
                         App state / data model
                                  |
                                  v
                    Live values, graphs, alerts, history
```

### Responsibilities by component

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  Pico W firmware                     Read sensors and transmit raw data

  BLE layer in app                    Connect to NUS, receive
                                      notifications, reassemble messages

  App parser                          Decode incoming raw-data packets

  Temperature module in app           Convert raw temperature register
                                      data into °C

  MAX30102 module in app              Buffer paired red/IR samples and
                                      calculate HR/SpO₂

  IMU module in app                   Convert raw axes into acceleration
                                      and angular velocity

  App data layer                      Store latest values, timestamps,
                                      validity and quality flags

  UI                                  Display values, units, graphs and
                                      error states
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 3. First requirement: define the raw-data BLE protocol

Before implementing calculations, the app and Pico W must agree on
exactly what bytes or fields the Pico W transmits.

NUS is a byte-stream transport. It does not define your sensor packet
format. The app must know how to distinguish temperature, red/IR, and
IMU readings.

### Recommended development format

For initial development, use one JSON object per line, with each message
terminated by `\n`. The Pico W sends raw values only.

Example packet:

``` json
{
  "type": "raw_sensor_data",
  "seq": 1042,
  "timestamp_ms": 123456,
  "temperature_raw": 439,
  "red_raw": 82341,
  "ir_raw": 91762,
  "accel_x_raw": 120,
  "accel_y_raw": -64,
  "accel_z_raw": 16320,
  "gyro_x_raw": 12,
  "gyro_y_raw": -8,
  "gyro_z_raw": 4
}
```

The values above are illustrative. The field names and encodings must
match the actual firmware output and sensor drivers.

**Important:** This example is suitable for a single combined update
only if the firmware can provide all these readings together. If the
sensors are sampled at different rates, the protocol should identify the
source and timestamp of each sample, or send separate typed packets.

For example:

``` json
{"type":"temperature_raw","seq":1,"timestamp_ms":1000,"raw":439}
{"type":"max30102_raw","seq":2,"timestamp_ms":1005,"red":82341,"ir":91762}
{"type":"imu_raw","seq":3,"timestamp_ms":1010,"ax":120,"ay":-64,"az":16320,"gx":12,"gy":-8,"gz":4}
```

The app must not assume that one BLE notification equals one complete
JSON message. A message may be split across notifications, and multiple
messages may arrive in one notification. The BLE layer must buffer
incoming bytes, split complete newline-terminated messages, and retain
any incomplete trailing bytes for the next notification.

### Raw-data requirements

-   Preserve signed values and correct byte order.
-   Do not convert raw values into engineering units in firmware.
-   Keep red and IR readings paired and in their original sample order.
-   Include timestamps or sequence numbers so the app can detect missing
    or out-of-order samples.
-   Do not silently replace failed sensor reads with zero. Represent
    missing data explicitly, or send a sensor-error packet.
-   Keep the packet small enough for the negotiated BLE MTU and the
    app's notification handling.
-   For MAX30102, send enough paired samples for the app to build a
    processing window. A single red/IR pair is not sufficient to
    calculate a reliable pulse-oximetry estimate.

### MAX30102 transport requirement

The app needs a continuous time series of paired red and IR samples, not
just the latest pair. The firmware may transmit a batch of samples in
each packet to reduce BLE overhead, but it must not calculate SpO₂ or
heart rate.

Example batch:

``` json
{
  "type": "max30102_batch",
  "seq": 250,
  "sample_rate_hz": 100,
  "first_sample_timestamp_ms": 250000,
  "samples": [
    [82341, 91762],
    [82360, 91780],
    [82355, 91771]
  ]
}
```

Each pair is `[red, ir]`. The example contains only three pairs for
illustration; the app should accumulate enough samples for the selected
algorithm's processing window.

If the current firmware sends only one pair per update, the app can
still accumulate those pairs, provided that: - no samples are lost, -
red/IR pairing is preserved, - sample timing is known or sufficiently
regular, - and the effective sample rate is known.

------------------------------------------------------------------------

## 4. Temperature processing inside the app

### 4.1 Identify the exact temperature sensor

The app must know the exact temperature sensor part number and the raw
value encoding used by the firmware.

Required information: - Manufacturer and exact part number. - I²C
address (useful for diagnostics, but not enough to identify the
sensor). - Which register the firmware reads. - Register width and byte
order. - Signed or unsigned encoding. - Resolution and any required bit
shift or offset. - Configuration settings that affect the reading.

The previously observed I²C addresses included `0x48` and `0x4C`. Do not
infer the sensor model from either address alone.

### 4.2 App conversion pipeline

1.  Receive the raw temperature register value.
2.  Decode the value according to the sensor's register format.
3.  Apply signed/two's-complement interpretation if required.
4.  Apply the correct bit shift, resolution, and offset from the sensor
    datasheet.
5.  Produce a numeric value in degrees Celsius.
6.  Validate the value and attach a validity status.

General form:

\[ T\_{\^`\circ `{=tex}C} =
f(`\text{raw register value}`{=tex},`\text{sensor configuration}`{=tex})
\]

For a sensor with a simple linear encoding, this may reduce to:

\[ T\_{\^`\circ `{=tex}C} = `\text{decoded raw value}`{=tex}
`\times `{=tex}`\text{resolution}`{=tex} \]

Do not use that simplified equation until the exact sensor's datasheet
confirms it.

### 4.3 App output model

``` json
{
  "temperature_c": 27.4,
  "temperature_valid": true,
  "temperature_status": "ok"
}
```

The number is illustrative.

### 4.4 Temperature validation

-   Reject malformed or missing raw values.
-   Flag sensor communication errors separately from implausible
    measurements.
-   Compare app-converted values with a reference thermometer.
-   Do not display `0 °C` as a substitute for a failed read.
-   Show an unavailable/error state when conversion cannot be completed.

------------------------------------------------------------------------

## 5. MAX30102 processing inside the app: raw red/IR to HR and SpO₂

The MAX30102 outputs red and infrared optical sample counts. It does not
directly output a clinically meaningful SpO₂ percentage from a single
reading.

**The app must perform the entire MAX30102 processing pipeline.**

### 5.1 Input data

The app must receive a time-ordered sequence of paired samples:

``` text
(red[0], ir[0])
(red[1], ir[1])
(red[2], ir[2])
...
```

The app must also know: - Effective sampling rate. - Sample timestamps
or a reliable timing basis. - MAX30102 ADC/sample configuration,
including relevant pulse-width and averaging settings. - Whether samples
were dropped. - The exact raw-count format produced by the firmware.

Do not mix red samples from one time interval with IR samples from
another.

### 5.2 App-side processing pipeline

Implement the following inside a dedicated MAX30102 processing module in
the app:

1.  **Sample buffering:** Maintain equal-length red and IR buffers.
    Append incoming pairs in order.
2.  **Window management:** Process a rolling or fixed-size window of
    samples. The selected algorithm determines the required buffer size
    and update cadence.
3.  **Input validation:** Detect missing samples, invalid counts,
    clipping/saturation, and insufficient data.
4.  **Contact detection:** Determine whether the optical signal is
    consistent with finger/contact being present. Treat this as a
    signal-quality estimate, not a guaranteed finger detector.
5.  **Baseline/DC estimation:** Estimate the slowly varying component of
    each channel.
6.  **AC extraction:** Extract the pulsatile component from red and IR
    signals.
7.  **Pulse detection:** Detect valid pulse cycles using a proven
    algorithm rather than counting arbitrary peaks.
8.  **AC/DC calculation:** Calculate the red and IR
    pulsatile-to-baseline ratios.
9.  **Ratio of ratios:**

\[ R = `\frac{AC_{\mathrm{red}}/DC_{\mathrm{red}}}`{=tex}
{AC\_{`\mathrm{IR}`{=tex}}/DC\_{`\mathrm{IR}`{=tex}}} \]

10. **SpO₂ estimation:** Convert the ratio into an SpO₂ estimate using
    the selected algorithm's lookup table or calibration relationship.
11. **Heart-rate estimation:** Calculate beat intervals from valid pulse
    detections.
12. **Quality checks:** Reject results from noisy, clipped,
    motion-corrupted, or otherwise invalid windows.
13. **Result publication:** Update the app's displayed HR/SpO₂ only when
    a new valid result is available.

The ratio (R) is an intermediate signal feature. It is not itself an
SpO₂ percentage.

### 5.3 Algorithm choice

Use a known MAX3010x algorithm as the starting point, such as: -
SparkFun MAX3010x library's `spo2_algorithm.cpp`, which is based on
Maxim's algorithm. - Maxim/Analog Devices' MAX3010x heart-rate/SpO₂
reference implementation.

The reference code is commonly written in C/C++. The app implementation
must be ported or reimplemented in the app's language. Preserve the
algorithm's sample-buffer assumptions, pulse-detection logic, ratio
calculation, lookup table, and validity checks. Do not copy only the
final polynomial or lookup table while omitting the signal-processing
stages.

If the app is written in JavaScript/TypeScript, Dart/Flutter, Kotlin, or
Swift, implement the processing in that language or in a native module
callable from the app. Keep the algorithm independent of the UI so it
can be unit-tested.

### 5.4 Heart-rate calculation

For two consecutive valid beats separated by (`\Delta `{=tex}t) seconds:

\[ HR\_{`\mathrm{bpm}`{=tex}} = `\frac{60}{\Delta t}`{=tex} \]

Use the selected algorithm's beat detection and interval validation. Do
not treat every local fluctuation as a beat.

### 5.5 Signal-quality states

The app should distinguish at least these states:

  -----------------------------------------------------------------------
  State                   Meaning                 UI behaviour
  ----------------------- ----------------------- -----------------------
  `no_contact`            Contact/finger criteria Ask user to place
                          are not met             finger

  `collecting`            Not enough samples yet  Show "Measuring..."

  `poor_signal`           Samples exist but       Show "Adjust finger /
                          quality checks fail     keep still"

  `valid`                 Processing window       Display estimate
                          passed validation       

  `sensor_error`          Data stream or sensor   Show sensor error
                          read failed             
  -----------------------------------------------------------------------

Heart rate and SpO₂ should have separate validity flags. One may be
valid when the other is not.

### 5.6 App output model

``` json
{
  "heart_rate_bpm": 76.2,
  "heart_rate_valid": true,
  "spo2_percent": 97.1,
  "spo2_valid": true,
  "max30102_contact": true,
  "max30102_signal_quality": "good"
}
```

All values are illustrative.

### 5.7 Accuracy and medical limitation

The resulting SpO₂ is an engineering estimate until the complete device
has been appropriately calibrated and validated. Calibration is
empirical and depends on the optical design, LED settings, mechanical
placement, and other factors. A prototype should be compared against an
appropriate reference pulse oximeter during engineering testing. Do not
present it as a clinically certified measurement or use it to make
medical decisions.

------------------------------------------------------------------------

## 6. IMU processing inside the app

The app must convert the raw accelerometer and gyroscope axis readings
into physical units.

### 6.1 Identify the exact IMU

The earlier firmware reported:

``` text
WHO_AM_I = 0x70
```

Do not assume the device is an MPU6050 or use MPU6050 scale factors
without confirming the actual part number.

Required information: - Exact IMU manufacturer and part number. -
`WHO_AM_I` register address and returned value. - Accelerometer
full-scale range. - Gyroscope full-scale range. - Raw register width,
signed encoding, and byte order. - Sensitivity in counts per g. -
Sensitivity in counts per degree/second. - Whether the firmware applies
any offset, scaling, or calibration already.

### 6.2 Decode signed raw values

If the IMU uses signed 16-bit two's-complement values, decode each axis
as a signed integer. For example:

``` javascript
function toSigned16(value) {
  return value & 0x8000 ? value - 0x10000 : value;
}
```

Use this only if the selected IMU's register format is standard signed
16-bit two's complement.

### 6.3 Accelerometer conversion

After confirming the configured range and datasheet sensitivity:

\[ a_x(g) = `\frac{raw_{ax}}{S_{\mathrm{accel}}}`{=tex} `\quad`{=tex}
a_y(g) = `\frac{raw_{ay}}{S_{\mathrm{accel}}}`{=tex} `\quad`{=tex}
a_z(g) = `\frac{raw_{az}}{S_{\mathrm{accel}}}`{=tex} \]

Convert g to metres per second squared when needed:

\[ a(m/s\^2) = a(g)`\times 9.80665`{=tex} \]

(S\_{`\mathrm{accel}`{=tex}}) is the sensitivity in counts per g for the
configured range.

### 6.4 Gyroscope conversion

\[ `\omega`{=tex}\_x(deg/s) = `\frac{raw_{gx}}{S_{\mathrm{gyro}}}`{=tex}
\]

\[ `\omega`{=tex}\_y(deg/s) = `\frac{raw_{gy}}{S_{\mathrm{gyro}}}`{=tex}
\]

\[ `\omega`{=tex}\_z(deg/s) = `\frac{raw_{gz}}{S_{\mathrm{gyro}}}`{=tex}
\]

(S\_{`\mathrm{gyro}`{=tex}}) is the sensitivity in counts per
degree/second for the configured range.

### 6.5 App-side calibration and filtering

-   Estimate gyroscope bias while the device is stationary.
-   Subtract the estimated bias from future gyroscope samples.
-   Check accelerometer readings in several known orientations.
-   Apply a low-pass filter if smoother graphs are needed.
-   Use timestamps to calculate the actual sample interval.
-   Keep raw and calibrated values separate for diagnostics.

Do not assume the accelerometer magnitude is always 1 g while the device
is moving.

### 6.6 Optional orientation estimation

After the basic conversions are verified, the app may calculate: - Roll
and pitch from accelerometer data. - Short-term angular changes from
gyroscope integration. - Fused orientation using a complementary filter
or a suitable sensor-fusion algorithm. - Activity/movement indicators.

Gyroscope integration drifts over time. Do not rely on gyroscope-only
integration for stable long-term orientation.

### 6.7 App output model

``` json
{
  "accel_x_g": 0.02,
  "accel_y_g": -0.01,
  "accel_z_g": 1.00,
  "gyro_x_dps": 0.4,
  "gyro_y_dps": -0.2,
  "gyro_z_dps": 0.1,
  "imu_valid": true
}
```

These values are illustrative.

------------------------------------------------------------------------

## 7. App software structure

Keep the sensor processing separate from BLE code and UI code. A
suitable architecture is:

``` text
app/
  ble/
    nus_client
    notification_buffer
    packet_parser

  sensors/
    temperature/
      temperature_decoder
      temperature_validation

    max30102/
      sample_buffer
      signal_filter
      pulse_detector
      spo2_estimator
      signal_quality

    imu/
      raw_decoder
      unit_conversion
      gyro_calibration
      motion_filter
      orientation_estimator

  data/
    sensor_models
    sensor_repository
    timestamps
    validity_states

  ui/
    live_dashboard
    sensor_details
    charts
    diagnostics
```

The names are illustrative; adapt them to the app's existing framework
and folder structure.

### Key design rules

-   BLE code should only receive and parse raw messages.
-   Each sensor processor should accept raw samples and return processed
    results.
-   UI components should read processed state; they should not contain
    sensor formulas.
-   Keep raw values available in a diagnostics view.
-   Write unit tests for each conversion function.
-   Write tests for incomplete BLE messages, malformed packets, missing
    samples, and reconnects.
-   Do not block the UI thread while processing large MAX30102 windows.
    Use an asynchronous/background worker where the app framework
    supports it.

------------------------------------------------------------------------

## 8. App data model

A processed sensor state can use a structure like:

``` json
{
  "timestamp_ms": 123456,
  "temperature": {
    "raw": 439,
    "value_c": 27.4,
    "valid": true,
    "status": "ok"
  },
  "max30102": {
    "red_raw": 82341,
    "ir_raw": 91762,
    "heart_rate_bpm": 76.2,
    "heart_rate_valid": true,
    "spo2_percent": 97.1,
    "spo2_valid": true,
    "contact": true,
    "signal_quality": "good"
  },
  "imu": {
    "accel_g": {"x": 0.02, "y": -0.01, "z": 1.0},
    "gyro_dps": {"x": 0.4, "y": -0.2, "z": 0.1},
    "valid": true
  }
}
```

This is the app's processed data model. It is not the raw BLE packet
format.

------------------------------------------------------------------------

## 9. Dashboard requirements

Suggested live dashboard:

  Measurement        Display                       Unit
  ------------------ ----------------------------- -----------
  Temperature        Converted temperature         °C
  SpO₂               Estimated oxygen saturation   \%
  Heart rate         Estimated pulse rate          bpm
  Acceleration       X, Y, Z                       g or m/s²
  Angular velocity   X, Y, Z                       °/s

### UI behaviour

-   Display `--` or "Unavailable" for invalid values; never substitute
    zero.
-   Display units next to every value.
-   Show a "Measuring..." state while the MAX30102 buffer fills.
-   Show "Place finger" for no-contact state.
-   Show "Poor signal" when the MAX30102 window fails quality checks.
-   Show when the last valid update was received.
-   Mark old values as stale after a timeout; do not present them as
    live.
-   Show BLE connection/reconnection status.
-   Label SpO₂ as an estimate until the device has been properly
    validated.
-   Keep raw sensor counts on a separate diagnostics screen.

------------------------------------------------------------------------

## 10. Implementation and testing sequence

### Phase 1 --- BLE raw-data reception

1.  Connect the app to the existing NUS service.
2.  Subscribe to the notification characteristic.
3.  Receive raw packets without changing sensor conversion logic.
4.  Implement notification reassembly and packet parsing.
5.  Display raw values on a diagnostics screen.
6.  Verify sequence numbers, timestamps, and sample ordering.

**Exit condition:** The app reliably displays the same raw readings that
the firmware reports.

### Phase 2 --- Temperature conversion in the app

1.  Confirm the exact temperature sensor part number.
2.  Confirm the raw register format used in the packet.
3.  Implement the datasheet-specific decoder in the app.
4.  Convert to °C.
5.  Compare against a reference thermometer.
6.  Add validity and error states.

**Exit condition:** The app displays plausible °C values and correctly
handles invalid data.

### Phase 3 --- IMU conversion in the app

1.  Confirm the exact IMU part number.
2.  Confirm accelerometer and gyroscope configured ranges.
3.  Implement signed raw-value decoding.
4.  Convert acceleration to g.
5.  Convert angular velocity to °/s.
6.  Estimate gyroscope bias while stationary.
7.  Test known orientations and stationary readings.

**Exit condition:** The app displays stable, correctly scaled X/Y/Z
values.

### Phase 4 --- MAX30102 processing in the app

1.  Confirm the actual sample rate and raw sample format.
2.  Ensure the app receives continuous paired red/IR samples.
3.  Implement a rolling sample buffer.
4.  Port a proven MAX3010x algorithm.
5.  Add contact and signal-quality states.
6.  Calculate HR and SpO₂ only when a window passes validation.
7.  Compare results with a reference pulse oximeter for engineering
    evaluation.

**Exit condition:** The app produces estimates only for valid windows
and correctly reports no-contact/poor-signal conditions.

### Phase 5 --- Dashboard and history

1.  Connect processed values to the dashboard.
2.  Add graphs using timestamps.
3.  Store processed values and optional raw diagnostic samples.
4.  Handle stale data and BLE disconnection.
5.  Test the complete system with all three sensor streams active.

------------------------------------------------------------------------

## 11. Information needed to implement exact app formulas

The equations cannot be made exact until the app implementation has the
sensor identities and raw packet details.

  -----------------------------------------------------------------------
  Needed information                  Why it matters
  ----------------------------------- -----------------------------------
  App framework and language          Determines implementation structure
                                      and BLE APIs

  Current BLE NUS packet format       Determines how the app parses
                                      incoming data

  Exact temperature sensor model      Determines raw register decoding
                                      and °C formula

  Temperature raw sample examples     Helps verify byte order and
                                      decoding

  Exact IMU model                     Determines axis register format and
                                      scale factors

  IMU accelerometer/gyro ranges       Determines conversion sensitivities

  MAX30102 sample rate                Required for time-based pulse
                                      processing

  MAX30102 LED current and            Helps interpret signal and choose
  pulse-width configuration           algorithm settings

  MAX30102 packet/batch format        Determines how to build paired
                                      sample windows
  -----------------------------------------------------------------------

Do not guess missing sensor models or scale factors. Confirm them from
the module markings, existing driver, firmware configuration, or
datasheet.

------------------------------------------------------------------------

## 12. Reference implementations and datasheets

Use these as starting points for the app-side MAX30102 implementation:

-   SparkFun MAX3010x SpO₂ algorithm:\
    https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library/blob/master/src/spo2_algorithm.cpp
-   Maxim/Analog Devices heart-rate reference implementation:\
    https://github.com/MaximIntegrated/Maxim-HeartRate
-   Analog Devices --- Guidelines for SpO₂ Measurement:\
    https://www.analog.com/en/resources/technical-articles/guidelines-for-spo2-measurement.html
-   MAX30102 datasheet:\
    https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf

For temperature and IMU conversion, use the datasheets for the exact
parts fitted to the hardware.

------------------------------------------------------------------------

## 13. Final acceptance criteria

The implementation is complete when:

-   The Pico W transmits raw sensor readings without doing the
    conversions described in this document.
-   The app receives and correctly parses all raw sensor streams.
-   The app converts temperature readings into °C using the correct
    sensor-specific formula.
-   The app converts IMU readings into correctly scaled acceleration and
    angular velocity.
-   The app buffers paired MAX30102 red/IR samples and performs the
    complete signal-processing pipeline locally.
-   The app shows HR and SpO₂ only when their respective validity checks
    pass.
-   Invalid, missing, stale, or poor-quality data is clearly
    represented.
-   The dashboard displays processed values with units and appropriate
    status indicators.
-   BLE disconnect/reconnect and sensor failures do not cause misleading
    values to be displayed.
