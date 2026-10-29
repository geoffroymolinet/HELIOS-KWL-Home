import { Project, Vent, VentType, Plenum, Shaft, Point, Connection } from '../../types';
import { createOrthoSegment, simplifyCollinearPoints, orthogonalizeFullPath, snapPointToGrid } from './ortho';

export interface AutoRoutingResult {
  project: Project;
  newlyConnectedCount: number;
  ductsTotalCount: number;
  supplyCount: number;
  extractCount: number;
  summaryText: string;
}

/**
 * Calculates number of Helios FRS 75 ducts required based on vent airflow:
 * - <= 30 m³/h: 1 duct
 * - 31-60 m³/h: 2 ducts
 * - 61-90 m³/h: 3 ducts
 * - > 90 m³/h: 4 ducts
 */
export const calculateDuctsForFlow = (flowRate: number): number => {
  return Math.max(1, Math.ceil(flowRate / 30));
};

/**
 * Generates an orthogonal 90-degree path between two points with lane-offsetting
 * to prevent multiple ducts from superimposing.
 */
export const generateStaggeredOrthoPath = (
  start: Point,
  end: Point,
  laneIndex: number,
  scale: number,
  preferHorizontalFirst?: boolean
): Point[] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Staggering step in pixels (e.g. 14px per lane)
  const laneOffset = ((laneIndex % 5) - 2) * 14;

  const isHFirst = preferHorizontalFirst !== undefined 
    ? preferHorizontalFirst 
    : Math.abs(dx) >= Math.abs(dy);

  let rawPath: Point[];

  if (isHFirst) {
    // Start -> Move X -> Move Y -> End
    // If there is enough room, add a middle corridor offset
    const midX = start.x + dx * 0.45 + laneOffset;
    rawPath = [
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end
    ];
  } else {
    // Start -> Move Y -> Move X -> End
    const midY = start.y + dy * 0.45 + laneOffset;
    rawPath = [
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end
    ];
  }

  // Orthogonalize and simplify collinear points
  return simplifyCollinearPoints(rawPath);
};

/**
 * Automatically creates and routes connections between plenums and vents
 * according to flow rates and flow directions (Soufflage / Reprise).
 */
export const autoRouteVents = (currentProject: Project, targetVentId?: string): AutoRoutingResult => {
  const updatedProject: Project = JSON.parse(JSON.stringify(currentProject));
  const scale = updatedProject.pixelsPerMeter || 60;

  // 1. Identify unconnected vents
  const existingConnVentIds = new Set<string>();
  for (const pl of updatedProject.plenums) {
    for (const c of pl.connections) {
      existingConnVentIds.add(c.ventId);
    }
  }

  let ventsToConnect = updatedProject.vents.filter(v => {
    if (targetVentId) return v.id === targetVentId;
    return !v.connected || !existingConnVentIds.has(v.id);
  });

  if (ventsToConnect.length === 0) {
    return {
      project: updatedProject,
      newlyConnectedCount: 0,
      ductsTotalCount: 0,
      supplyCount: 0,
      extractCount: 0,
      summaryText: "Toutes les bouches sont déjà raccordées aux plénums."
    };
  }

  // 2. Ensure we have appropriate Plenums for Soufflage and Reprise
  const ensurePlenums = () => {
    const hasSupplyVents = ventsToConnect.some(v => v.type === VentType.SOUFFLAGE);
    const hasExtractVents = ventsToConnect.some(v => v.type === VentType.REPRISE);

    let supplyPlenums = updatedProject.plenums.filter(p => p.type === VentType.SOUFFLAGE);
    let extractPlenums = updatedProject.plenums.filter(p => p.type === VentType.REPRISE);

    // If plenums exist but their type was unassigned or both defaulted to SOUFFLAGE
    if (updatedProject.plenums.length >= 2 && extractPlenums.length === 0 && hasExtractVents) {
      // Convert the second plenum to REPRISE
      updatedProject.plenums[1].type = VentType.REPRISE;
      extractPlenums = [updatedProject.plenums[1]];
      supplyPlenums = [updatedProject.plenums[0]];
    }

    // Default base location for new plenums (near unit or near centroid)
    const basePos = updatedProject.unit 
      ? { x: updatedProject.unit.pos.x, y: updatedProject.unit.pos.y }
      : { x: 350, y: 300 };
    const baseLevel = updatedProject.unit ? updatedProject.unit.level : 0;

    // Create Supply plenum if missing
    if (hasSupplyVents && supplyPlenums.length === 0) {
      const newSupplyPlenum: Plenum = {
        id: 'plenum_souf_' + Math.random().toString(36).substr(2, 8),
        type: VentType.SOUFFLAGE,
        pos: { x: basePos.x + 75, y: basePos.y - 45 },
        level: baseLevel,
        connections: [],
        model: 'FRS-VK 10-75 (Soufflage)'
      };
      updatedProject.plenums.push(newSupplyPlenum);
    }

    // Create Extract plenum if missing
    if (hasExtractVents && extractPlenums.length === 0) {
      const newExtractPlenum: Plenum = {
        id: 'plenum_extr_' + Math.random().toString(36).substr(2, 8),
        type: VentType.REPRISE,
        pos: { x: basePos.x + 75, y: basePos.y + 45 },
        level: baseLevel,
        connections: [],
        model: 'FRS-VK 10-75 (Reprise)'
      };
      updatedProject.plenums.push(newExtractPlenum);
    }
  };

  ensurePlenums();

  let newlyConnectedCount = 0;
  let ductsTotalCount = 0;
  let supplyCount = 0;
  let extractCount = 0;

  // 3. Process each vent
  ventsToConnect.forEach((vent, ventIdx) => {
    const ductsCount = calculateDuctsForFlow(vent.flowRate);
    const ventType = vent.type;

    // Find plenums of matching type
    const candidatePlenums = updatedProject.plenums.filter(p => p.type === ventType);
    if (candidatePlenums.length === 0) return;

    // Preference: same floor first, then closest
    let bestPlenum: Plenum | null = null;
    let bestDist = Infinity;
    let bestShaft: Shaft | null = null;

    // First check plenums on the same floor
    const sameFloorPlenums = candidatePlenums.filter(p => p.level === vent.level);
    if (sameFloorPlenums.length > 0) {
      for (const p of sameFloorPlenums) {
        const d = Math.hypot(p.pos.x - vent.pos.x, p.pos.y - vent.pos.y);
        if (d < bestDist) {
          bestDist = d;
          bestPlenum = p;
        }
      }
    } else {
      // Different floor: need to route via a Shaft / Trémie
      // Check existing shafts between plenum level and vent level
      for (const p of candidatePlenums) {
        const minLvl = Math.min(p.level, vent.level);
        const maxLvl = Math.max(p.level, vent.level);

        let viableShafts = (updatedProject.shafts || []).filter(s => 
          Math.min(s.fromLevel, s.toLevel) <= minLvl && 
          Math.max(s.fromLevel, s.toLevel) >= maxLvl
        );

        // If no shaft exists between levels, create one
        if (viableShafts.length === 0) {
          const autoShaft: Shaft = {
            id: 'shaft_auto_' + Math.random().toString(36).substr(2, 8),
            name: `Trémie T${(updatedProject.shafts?.length || 0) + 1}`,
            pos: { 
              x: Math.round((p.pos.x + vent.pos.x) / 2 / 20) * 20, 
              y: Math.round((p.pos.y + vent.pos.y) / 2 / 20) * 20 
            },
            width: 0.45,
            height: 0.45,
            fromLevel: minLvl,
            toLevel: maxLvl
          };
          if (!updatedProject.shafts) updatedProject.shafts = [];
          updatedProject.shafts.push(autoShaft);
          viableShafts = [autoShaft];
        }

        // Find closest shaft for this plenum-vent pair
        for (const s of viableShafts) {
          const dTotal = Math.hypot(p.pos.x - s.pos.x, p.pos.y - s.pos.y) + Math.hypot(s.pos.x - vent.pos.x, s.pos.y - vent.pos.y);
          if (dTotal < bestDist) {
            bestDist = dTotal;
            bestPlenum = p;
            bestShaft = s;
          }
        }
      }
    }

    if (!bestPlenum) return;

    // Generate paths
    const isMultiFloor = bestPlenum.level !== vent.level && bestShaft !== null;
    const laneIndex = bestPlenum.connections.length;

    let pathFloor1: Point[];
    let pathFloor2: Point[] | undefined = undefined;
    let totalLengthMeters = 0;

    if (isMultiFloor && bestShaft) {
      // 1. Plenum to Shaft on Plenum floor
      pathFloor1 = generateStaggeredOrthoPath(bestPlenum.pos, bestShaft.pos, laneIndex, scale);
      // 2. Shaft to Vent on Vent floor
      pathFloor2 = generateStaggeredOrthoPath(bestShaft.pos, vent.pos, laneIndex, scale);

      let pxLen1 = 0;
      for (let i = 1; i < pathFloor1.length; i++) {
        pxLen1 += Math.hypot(pathFloor1[i].x - pathFloor1[i - 1].x, pathFloor1[i].y - pathFloor1[i - 1].y);
      }
      let pxLen2 = 0;
      for (let i = 1; i < pathFloor2.length; i++) {
        pxLen2 += Math.hypot(pathFloor2[i].x - pathFloor2[i - 1].x, pathFloor2[i].y - pathFloor2[i - 1].y);
      }

      // Add 2.7m vertical shaft crossing
      totalLengthMeters = Math.max(1, Math.round(((pxLen1 + pxLen2) / scale + 2.7) * 10) / 10);
    } else {
      // Single floor: Plenum to Vent
      pathFloor1 = generateStaggeredOrthoPath(bestPlenum.pos, vent.pos, laneIndex, scale);

      let pxLen = 0;
      for (let i = 1; i < pathFloor1.length; i++) {
        pxLen += Math.hypot(pathFloor1[i].x - pathFloor1[i - 1].x, pathFloor1[i].y - pathFloor1[i - 1].y);
      }
      totalLengthMeters = Math.max(0.5, Math.round((pxLen / scale) * 10) / 10);
    }

    // Build the new Connection
    const newConn: Connection = {
      id: 'conn_' + Math.random().toString(36).substr(2, 9),
      ventId: vent.id,
      path: pathFloor1,
      targetLevelPath: pathFloor2,
      length: totalLengthMeters,
      fromLevel: bestPlenum.level,
      toLevel: vent.level,
      ductsCount,
      shaftId: isMultiFloor && bestShaft ? bestShaft.id : undefined
    };

    bestPlenum.connections.push(newConn);

    // Update vent state
    const ventInProj = updatedProject.vents.find(v => v.id === vent.id);
    if (ventInProj) {
      ventInProj.connected = true;
      ventInProj.ductsCount = ductsCount;
    }

    newlyConnectedCount++;
    ductsTotalCount += ductsCount;
    if (ventType === VentType.SOUFFLAGE) supplyCount++;
    else extractCount++;
  });

  const summary = `${newlyConnectedCount} bouche(s) raccordée(s) (${supplyCount} soufflage, ${extractCount} reprise) • ${ductsTotalCount} gaine(s) FlexPipe DN75 configurée(s).`;

  return {
    project: updatedProject,
    newlyConnectedCount,
    ductsTotalCount,
    supplyCount,
    extractCount,
    summaryText: summary
  };
};
