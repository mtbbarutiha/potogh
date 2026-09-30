import { prisma } from "../db/prisma.js";
import {
  NEARBY_RADIUS_KM,
  NEARBY_RADIUS_OPTIONS_KM,
} from "../data/packages.js";
import { formatDistance, haversineKm } from "../lib/geo.js";

const pendingRadius = new Map<number, number>();

export function setNearbyRadius(userId: number, km: number) {
  pendingRadius.set(userId, km);
}

export function getNearbyRadius(userId: number): number {
  return pendingRadius.get(userId) ?? NEARBY_RADIUS_KM;
}

export function clearNearbyRadius(userId: number) {
  pendingRadius.delete(userId);
}

export function isValidNearbyRadius(km: number): boolean {
  return (NEARBY_RADIUS_OPTIONS_KM as readonly number[]).includes(km);
}

export async function saveLocation(
  userId: number,
  latitude: number,
  longitude: number,
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      latitude,
      longitude,
      locationAt: new Date(),
      state: "idle",
      lastActiveAt: new Date(),
    },
  });
}

/**
 * افراد نزدیک بر اساس GPS واقعی (haversine) و شعاع انتخابی.
 */
export async function findNearby(userId: number, radiusKm?: number) {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me?.latitude || !me?.longitude) return [];

  const radius = radiusKm ?? getNearbyRadius(userId);
  const { excludedUserIds } = await import("./block.js");
  const blockedIds = await excludedUserIds(userId);

  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: [userId, ...blockedIds] },
      registered: true,
      isActive: true,
      deletedAt: null,
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  const maxResults = radius <= 10 ? 30 : radius <= 50 ? 50 : 80;

  return candidates
    .map((u) => ({
      user: u,
      km: haversineKm(me.latitude!, me.longitude!, u.latitude!, u.longitude!),
    }))
    .filter((x) => Number.isFinite(x.km) && x.km <= radius)
    .sort((a, b) => a.km - b.km)
    .slice(0, maxResults)
    .map((x) => ({ ...x, distanceLabel: formatDistance(x.km) }));
}
