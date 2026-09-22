// @ts-check

const EARTH_RADIUS_M = 6_371_000;
const METRES_PER_DEGREE_LATITUDE = 111_320;

/** @param {number} degrees */
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 * @param {import('../types.js').Position} a
 * @param {import('../types.js').Position} b
 */
export function distanceMeters(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * A position moved by a number of metres north and east.
 * @param {import('../types.js').Position} origin
 * @param {number} northM
 * @param {number} eastM
 * @returns {import('../types.js').Position}
 */
export function offsetPosition(origin, northM, eastM) {
  return {
    lat: origin.lat + northM / METRES_PER_DEGREE_LATITUDE,
    lng: origin.lng + eastM / (METRES_PER_DEGREE_LATITUDE * Math.cos(toRadians(origin.lat))),
  };
}

/**
 * @param {{ lat?: number | null, lng?: number | null } | null | undefined} value
 * @returns {value is import('../types.js').Position}
 */
export function hasPosition(value) {
  return typeof value?.lat === 'number' && typeof value?.lng === 'number';
}
