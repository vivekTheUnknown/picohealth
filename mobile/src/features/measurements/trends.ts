/** Windowed temperature trend from the app's 1 Hz series. */

export interface TemperatureTrend {
  averageC: number | null;
  deltaC: number | null;
  ratePerMinC: number | null;
  samples: number;
  windowMinutes: number;
}

export function temperatureTrend(
  points: ReadonlyArray<{ t: number; temperatureC: number | null }>,
  windowMs: number,
  now: number,
): TemperatureTrend {
  const windowMinutes = Math.round(windowMs / 60000);
  const windowPoints = points
    .filter(
      (point) =>
        point.t >= now - windowMs &&
        point.t <= now &&
        point.temperatureC !== null &&
        Number.isFinite(point.temperatureC),
    )
    .sort((a, b) => a.t - b.t);

  if (windowPoints.length < 2) {
    return {
      averageC: windowPoints.length === 1 ? windowPoints[0].temperatureC! : null,
      deltaC: null,
      ratePerMinC: null,
      samples: windowPoints.length,
      windowMinutes,
    };
  }

  const first = windowPoints[0];
  const last = windowPoints[windowPoints.length - 1];
  const deltaC = Number((last.temperatureC! - first.temperatureC!).toFixed(2));
  const minutes = (last.t - first.t) / 60000;
  const averageC = Number(
    (
      windowPoints.reduce((sum, point) => sum + point.temperatureC!, 0) /
      windowPoints.length
    ).toFixed(2),
  );

  return {
    averageC,
    deltaC,
    ratePerMinC:
      minutes > 0 ? Number((deltaC / minutes).toFixed(2)) : null,
    samples: windowPoints.length,
    windowMinutes,
  };
}
