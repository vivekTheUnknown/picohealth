# BLE protocol v1
Service UUID: `8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001`
Notify characteristic UUID: `8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001`

Each notification: 2-byte big-endian sequence, 1-byte fragment index, 1-byte fragment count, then up to 16 bytes payload. Reassemble all fragments with matching sequence.

Frame (28 bytes, big-endian; Python struct `>IBhIIhhhhhhB`):
- uint32 uptime_ms; uint8 flags (bit 0 temp valid, bit 1 optical valid, bit 2 IMU valid)
- int16 temp centi-C (`-32768` unavailable)
- uint32 red raw, uint32 IR raw (`0xFFFFFFFF` unavailable)
- int16 accel X/Y/Z mg; int16 gyro X/Y/Z centidegrees/s (`-32768` unavailable)
- uint8 optical sample count

Flags stay unset for unverified temperature/IMU drivers. Raw optical values do not imply a valid pulse or SpO2 measurement.
