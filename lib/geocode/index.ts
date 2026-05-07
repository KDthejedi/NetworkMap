/**
 * Geocode a city/region/country tuple to (lat, lng).
 * Uses Mapbox if MAPBOX_ACCESS_TOKEN is set, falls back to Nominatim (OSM).
 * Returns null on failure; callers should not block contact creation on geocode.
 */
export type GeocodeInput = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  source: "mapbox" | "nominatim";
};

export async function geocode(
  input: GeocodeInput,
): Promise<GeocodeResult | null> {
  const query = [input.city, input.region, input.country]
    .filter(Boolean)
    .join(", ");
  if (!query) return null;

  const mapbox = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapbox) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&types=place&access_token=${mapbox}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = (await res.json()) as {
          features: Array<{ center: [number, number] }>;
        };
        const f = json.features?.[0];
        if (f) {
          return {
            longitude: f.center[0],
            latitude: f.center[1],
            source: "mapbox",
          };
        }
      }
    } catch {
      // fall through to Nominatim
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NetworkMap/0.1 (private)",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    const r = json[0];
    if (!r) return null;
    return {
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      source: "nominatim",
    };
  } catch {
    return null;
  }
}
