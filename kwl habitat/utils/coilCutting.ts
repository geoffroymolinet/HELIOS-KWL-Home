import { Project, VentType } from '../types';

export interface DuctSegment {
  id: string;
  ventId: string;
  roomName: string;
  type: VentType;
  ductIndex: number;
  totalDuctsForVent: number;
  length: number; // in meters
}

export interface CoilAssignment {
  coilIndex: number;
  totalLength: number; // 50m
  usedLength: number;
  wasteLength: number;
  wastePercent: number;
  segments: (DuctSegment & { cutStart: number; cutEnd: number })[];
}

export interface PlenumPortScheduleItem {
  portNumber: number;
  plenumId: string;
  plenumType: VentType;
  roomName: string;
  ventId: string;
  ductLength: number;
  flowRate: number;
  recommendedRestrictorRing: string;
  diaphragmCran: string;
}

export interface CoilCuttingPlanResult {
  totalCoilsRequired: number;
  coilCapacityM: number;
  totalDuctsM: number;
  totalWasteM: number;
  overallEfficiencyPercent: number;
  coils: CoilAssignment[];
  plenumSchedule: PlenumPortScheduleItem[];
}

/**
 * Optimizes the cutting plan for 50-meter FlexPipe FRS-R 75 coils using a Best-Fit Decreasing algorithm
 * to minimize scrap / offcuts, and generates the plenum connection schedule with balancing rings.
 */
export const calculateCoilCuttingPlan = (project: Project): CoilCuttingPlanResult => {
  const COIL_LENGTH = 50; // Helios FlexPipe comes in 50m coils
  const segments: DuctSegment[] = [];

  // 1. Gather all duct cuts required for all connections
  project.plenums.forEach(plenum => {
    plenum.connections.forEach(conn => {
      const vent = project.vents.find(v => v.id === conn.ventId);
      const roomName = vent?.roomId || (plenum.type === VentType.SOUFFLAGE ? 'Pièce Soufflage' : 'Pièce Reprise');
      const ductsCount = Math.max(1, conn.ductsCount || 1);
      const length = Math.max(1, Math.round((conn.length || 10) * 10) / 10);

      for (let d = 0; d < ductsCount; d++) {
        segments.push({
          id: `${conn.ventId}-duct-${d + 1}`,
          ventId: conn.ventId,
          roomName,
          type: vent?.type || plenum.type,
          ductIndex: d + 1,
          totalDuctsForVent: ductsCount,
          length
        });
      }
    });
  });

  // If no connections exist yet, fallback to estimating from vents
  if (segments.length === 0 && project.vents.length > 0) {
    project.vents.forEach(vent => {
      const ductsCount = vent.ductsCount || Math.max(1, Math.ceil(vent.flowRate / 30));
      for (let d = 0; d < ductsCount; d++) {
        segments.push({
          id: `${vent.id}-est-${d + 1}`,
          ventId: vent.id,
          roomName: vent.roomId || 'Bouche',
          type: vent.type,
          ductIndex: d + 1,
          totalDuctsForVent: ductsCount,
          length: 10
        });
      }
    });
  }

  // 2. Sort segments in descending order of length (Best-Fit Decreasing)
  const sortedSegments = [...segments].sort((a, b) => b.length - a.length);

  // 3. Bin-pack into 50m coils
  const coils: CoilAssignment[] = [];

  sortedSegments.forEach(segment => {
    // Find coil with enough space that leaves minimum waste (Best-Fit)
    let bestCoilIndex = -1;
    let minRemainingSpace = Infinity;

    for (let c = 0; c < coils.length; c++) {
      const remaining = COIL_LENGTH - coils[c].usedLength;
      if (remaining >= segment.length && remaining - segment.length < minRemainingSpace) {
        minRemainingSpace = remaining - segment.length;
        bestCoilIndex = c;
      }
    }

    if (bestCoilIndex !== -1) {
      // Add to best existing coil
      const targetCoil = coils[bestCoilIndex];
      const cutStart = Math.round(targetCoil.usedLength * 10) / 10;
      const cutEnd = Math.round((targetCoil.usedLength + segment.length) * 10) / 10;
      targetCoil.segments.push({
        ...segment,
        cutStart,
        cutEnd
      });
      targetCoil.usedLength = cutEnd;
      targetCoil.wasteLength = Math.max(0, Math.round((COIL_LENGTH - targetCoil.usedLength) * 10) / 10);
      targetCoil.wastePercent = Math.round((targetCoil.wasteLength / COIL_LENGTH) * 100);
    } else {
      // Open a new 50m coil
      const newCoilIndex = coils.length + 1;
      const cutStart = 0;
      const cutEnd = segment.length;
      const newCoil: CoilAssignment = {
        coilIndex: newCoilIndex,
        totalLength: COIL_LENGTH,
        usedLength: cutEnd,
        wasteLength: Math.max(0, Math.round((COIL_LENGTH - cutEnd) * 10) / 10),
        wastePercent: Math.round(((COIL_LENGTH - cutEnd) / COIL_LENGTH) * 100),
        segments: [{
          ...segment,
          cutStart,
          cutEnd
        }]
      };
      coils.push(newCoil);
    }
  });

  const totalDuctsM = Math.round(segments.reduce((acc, s) => acc + s.length, 0) * 10) / 10;
  const totalCoilsRequired = Math.max(1, coils.length);
  const totalCoilsCapacity = totalCoilsRequired * COIL_LENGTH;
  const totalWasteM = Math.max(0, Math.round((totalCoilsCapacity - totalDuctsM) * 10) / 10);
  const overallEfficiencyPercent = totalCoilsCapacity > 0
    ? Math.round((totalDuctsM / totalCoilsCapacity) * 100)
    : 100;

  // 4. Generate Plenum Port Connection Schedule with Balancing Restrictor Rings
  // Longer ducts have higher pressure drop; shorter ducts require restrictor rings
  const maxDuctLen = Math.max(1, ...segments.map(s => s.length));
  const plenumSchedule: PlenumPortScheduleItem[] = [];

  let portCounter = 1;
  project.plenums.forEach(plenum => {
    plenum.connections.forEach(conn => {
      const vent = project.vents.find(v => v.id === conn.ventId);
      const ductsCount = Math.max(1, conn.ductsCount || 1);
      const ductLen = conn.length || 10;
      const lengthRatio = ductLen / maxDuctLen;

      // Recommended balancing restrictor ring
      let recommendedRestrictorRing = 'Ouvert 100% (Aucune bague)';
      let diaphragmCran = 'Plein débit (Cran 0)';
      if (lengthRatio < 0.35) {
        recommendedRestrictorRing = 'Bague D3 (Réduction forte)';
        diaphragmCran = 'Cran 3 (Fermé à 60%)';
      } else if (lengthRatio < 0.6) {
        recommendedRestrictorRing = 'Bague D2 (Réduction moyenne)';
        diaphragmCran = 'Cran 2 (Fermé à 40%)';
      } else if (lengthRatio < 0.8) {
        recommendedRestrictorRing = 'Bague D1 (Réduction légère)';
        diaphragmCran = 'Cran 1 (Fermé à 20%)';
      }

      for (let d = 0; d < ductsCount; d++) {
        plenumSchedule.push({
          portNumber: portCounter++,
          plenumId: plenum.id,
          plenumType: plenum.type,
          roomName: vent?.roomId || (plenum.type === VentType.SOUFFLAGE ? 'Pièce de vie' : 'Pièce humide'),
          ventId: conn.ventId,
          ductLength: ductLen,
          flowRate: vent ? Math.round(vent.flowRate / ductsCount) : 30,
          recommendedRestrictorRing,
          diaphragmCran
        });
      }
    });
  });

  return {
    totalCoilsRequired,
    coilCapacityM: COIL_LENGTH,
    totalDuctsM,
    totalWasteM,
    overallEfficiencyPercent,
    coils,
    plenumSchedule
  };
};
