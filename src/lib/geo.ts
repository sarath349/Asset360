export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getGps(timeout = 10000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS is not available on this device'));
    if (!window.isSecureContext) return reject(new Error('GPS needs HTTPS (or localhost)'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission denied' : 'Could not get your location')),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

export const gpsText = (g: GpsFix) => `GPS ${g.lat},${g.lng} (±${g.accuracy}m)`;

/** Best-effort fix as a short text; resolves to '' instead of failing so a missing GPS never blocks a save. */
export async function tryGpsText(timeout = 8000): Promise<string> {
  try {
    return gpsText(await getGps(timeout));
  } catch {
    return '';
  }
}
