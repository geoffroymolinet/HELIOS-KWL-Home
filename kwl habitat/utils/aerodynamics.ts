import { Project, VentType, Vent } from '../types';
import { HELIOS_UNITS, HeliosUnitSpecs } from '../constants';

export interface UnfavorableBranchDetail {
  branchName: string;
  totalPressureDrop: number; // in Pa
  unfavorableVent: {
    vent: Vent | null;
    roomName: string;
    flowRate: number;
    ductLength: number;
    ductsCount: number;
    ductPressureDrop: number;
    terminalPressureDrop: number;
  } | null;
  isoDuctsPressureDrop: number;
  plenumPressureDrop: number;
  terminalExtPressureDrop: number;
  details: {
    outdoorTerminalPa: number;
    isopipePa: number;
    isopipeLengthM: number;
    plenumPa: number;
    ductsPa: number;
    mostUnfavorableDuctLengthM: number;
    ventPa: number;
  };
  components: { label: string; value: number }[];
}

export interface RoomAcousticDetail {
  ventId: string;
  roomName: string;
  type: VentType;
  flowRate: number;
  ductLength: number;
  ductsCount: number;
  soundPressureLp: number; // dB(A) at 1.5m in the room
  soundPowerLwA: number; // dB(A) at diffuser
  attenuationDetails: {
    unitLwA: number;
    plenumAttenuation: number;
    ductLinearAttenuation: number;
    elbowAttenuation: number;
    terminalAttenuation: number;
    roomAbsorption: number;
  };
  comfortCategory: 'EXCEPTIONNEL' | 'OPTIMAL' | 'CONFORT' | 'ATTENTION';
  comfortLabel: string;
  benchmarkDescription: string;
  recommendation?: string;
}

export interface OperatingPointResult {
  projectFlow: number; // m³/h
  supplyFlow: number;
  extractFlow: number;
  systemPressure: number; // Pa (max of both branches)
  supplyBranch: UnfavorableBranchDetail;
  extractBranch: UnfavorableBranchDetail;
  recommendedUnit: HeliosUnitSpecs | null;
  operatingSpeedPercent: number; // estimated % of max fan speed
  operatingPoint: {
    flow: number;
    pressure: number;
    fanSpeedPercent: number;
    estimatedPowerW: number;
    sfp: number; // Specific Fan Power W/(m³/h)
    acousticLwA: number;
  };
  roomAcoustics: RoomAcousticDetail[];
}

/**
 * Calculates aerodynamic pressure losses on both branches (supply & extract),
 * identifies the most unfavorable duct/vent on each side, and computes the operating point.
 */
export const calculateAerodynamics = (project: Project): OperatingPointResult => {
  const supplyVents = project.vents.filter(v => v.type === VentType.SOUFFLAGE);
  const extractVents = project.vents.filter(v => v.type === VentType.REPRISE);

  const supplyFlow = supplyVents.reduce((acc, v) => acc + v.flowRate, 0);
  const extractFlow = extractVents.reduce((acc, v) => acc + v.flowRate, 0);
  const projectFlow = Math.max(supplyFlow, extractFlow);

  // 1. Calculate pressure drops on Supply branch (Air Neuf -> KWL -> Soufflage)
  // External intake terminal (IP-FKB / IP-DHS)
  const hasIntakeHood = project.externalHoods.some(h => h.type === 'IP-FKB' || h.type === 'IP-DHS');
  const intakeTerminalLoss = hasIntakeHood || projectFlow > 0 ? 20 : 0;

  // Isopipe Air Neuf & Soufflage Principal
  const isoAirNeuf = project.isoConnections.filter(c => c.type === 'AIR_NEUF');
  const isoSoufflagePpal = project.isoConnections.filter(c => c.type === 'SOUFFLAGE_PPAL');
  
  const isoAirNeufLoss = isoAirNeuf.reduce((acc, c) => acc + c.length * 0.6 + 8, 0) || (projectFlow > 0 ? 15 : 0);
  const isoSoufflagePpalLoss = isoSoufflagePpal.reduce((acc, c) => acc + c.length * 0.6 + 8, 0) || (projectFlow > 0 ? 15 : 0);
  const totalSupplyIsoLoss = Math.round((isoAirNeufLoss + isoSoufflagePpalLoss) * 10) / 10;

  const supplyPlenums = project.plenums.filter(p => p.type === VentType.SOUFFLAGE);
  const supplyPlenumLoss = supplyPlenums.length > 0 || supplyVents.length > 0 ? 15 : 0;

  // Find most unfavorable supply vent
  let maxSupplyVentLoss = 0;
  let unfavSupplyVentDetail: UnfavorableBranchDetail['unfavorableVent'] = null;

  if (supplyVents.length > 0) {
    for (const v of supplyVents) {
      // Find connecting duct
      let ductLength = 10;
      let ductsCount = v.ductsCount || Math.max(1, Math.ceil(v.flowRate / 30));
      for (const p of supplyPlenums) {
        const conn = p.connections.find(c => c.ventId === v.id);
        if (conn) {
          ductLength = conn.length;
          ductsCount = conn.ductsCount || ductsCount;
          break;
        }
      }

      const flowPerDuct = v.flowRate / ductsCount;
      // Helios FlexPipe 75 pressure drop formula
      const ductLoss = Math.round((ductLength * 2.2 * Math.pow(flowPerDuct / 30, 1.8)) * 10) / 10;
      const terminalLoss = 15; // Bouche de soufflage ajustable
      const totalVentLoss = ductLoss + terminalLoss;

      if (totalVentLoss > maxSupplyVentLoss || unfavSupplyVentDetail === null) {
        maxSupplyVentLoss = totalVentLoss;
        unfavSupplyVentDetail = {
          vent: v,
          roomName: v.roomId || 'Bouche soufflage',
          flowRate: v.flowRate,
          ductLength,
          ductsCount,
          ductPressureDrop: ductLoss,
          terminalPressureDrop: terminalLoss
        };
      }
    }
  } else if (projectFlow > 0) {
    // Default estimated unfavorable branch if vents not yet placed
    maxSupplyVentLoss = 38;
    unfavSupplyVentDetail = {
      vent: null,
      roomName: 'Bouche la plus éloignée (estimée)',
      flowRate: 30,
      ductLength: 12,
      ductsCount: 1,
      ductPressureDrop: 23,
      terminalPressureDrop: 15
    };
  }

  const totalSupplyPressure = Math.round(
    (intakeTerminalLoss + totalSupplyIsoLoss + supplyPlenumLoss + maxSupplyVentLoss) * 10
  ) / 10;

  const supplyIsoLength = Math.round(
    ((isoAirNeuf.reduce((acc, c) => acc + c.length, 0) || 2) + (isoSoufflagePpal.reduce((acc, c) => acc + c.length, 0) || 2)) * 10
  ) / 10;

  const supplyBranch: UnfavorableBranchDetail = {
    branchName: 'Amenée d\'Air & Soufflage',
    totalPressureDrop: totalSupplyPressure,
    unfavorableVent: unfavSupplyVentDetail,
    isoDuctsPressureDrop: totalSupplyIsoLoss,
    plenumPressureDrop: supplyPlenumLoss,
    terminalExtPressureDrop: intakeTerminalLoss,
    details: {
      outdoorTerminalPa: intakeTerminalLoss,
      isopipePa: totalSupplyIsoLoss,
      isopipeLengthM: supplyIsoLength,
      plenumPa: supplyPlenumLoss,
      ductsPa: unfavSupplyVentDetail?.ductPressureDrop || 20,
      mostUnfavorableDuctLengthM: unfavSupplyVentDetail?.ductLength || 10,
      ventPa: unfavSupplyVentDetail?.terminalPressureDrop || 15
    },
    components: [
      { label: 'Prise d\'air extérieur (Grille/Toit)', value: intakeTerminalLoss },
      { label: 'Réseaux Isopipe (Air neuf + Soufflage ppal)', value: totalSupplyIsoLoss },
      { label: 'Plénum de répartition soufflage', value: supplyPlenumLoss },
      { 
        label: `Bouche soufflage la plus défavorisée (${unfavSupplyVentDetail?.roomName || 'N/A'})`, 
        value: maxSupplyVentLoss 
      }
    ]
  };

  // 2. Calculate pressure drops on Extract branch (Reprise -> KWL -> Rejet)
  const extractPlenums = project.plenums.filter(p => p.type === VentType.REPRISE);
  const extractPlenumLoss = extractPlenums.length > 0 || extractVents.length > 0 ? 15 : 0;

  let maxExtractVentLoss = 0;
  let unfavExtractVentDetail: UnfavorableBranchDetail['unfavorableVent'] = null;

  if (extractVents.length > 0) {
    for (const v of extractVents) {
      let ductLength = 10;
      let ductsCount = v.ductsCount || Math.max(1, Math.ceil(v.flowRate / 30));
      for (const p of extractPlenums) {
        const conn = p.connections.find(c => c.ventId === v.id);
        if (conn) {
          ductLength = conn.length;
          ductsCount = conn.ductsCount || ductsCount;
          break;
        }
      }

      const flowPerDuct = v.flowRate / ductsCount;
      const ductLoss = Math.round((ductLength * 2.2 * Math.pow(flowPerDuct / 30, 1.8)) * 10) / 10;
      const terminalLoss = 15; // Bouche d'extraction
      const totalVentLoss = ductLoss + terminalLoss;

      if (totalVentLoss > maxExtractVentLoss || unfavExtractVentDetail === null) {
        maxExtractVentLoss = totalVentLoss;
        unfavExtractVentDetail = {
          vent: v,
          roomName: v.roomId || 'Bouche extraction',
          flowRate: v.flowRate,
          ductLength,
          ductsCount,
          ductPressureDrop: ductLoss,
          terminalPressureDrop: terminalLoss
        };
      }
    }
  } else if (projectFlow > 0) {
    maxExtractVentLoss = 42;
    unfavExtractVentDetail = {
      vent: null,
      roomName: 'Bouche la plus éloignée (Cuisine/SDB)',
      flowRate: 45,
      ductLength: 10,
      ductsCount: 2,
      ductPressureDrop: 27,
      terminalPressureDrop: 15
    };
  }

  // Isopipe Reprise & Rejet
  const isoReprisePpal = project.isoConnections.filter(c => c.type === 'REPRISE_PPAL');
  const isoAirRejete = project.isoConnections.filter(c => c.type === 'AIR_REJETE');

  const isoReprisePpalLoss = isoReprisePpal.reduce((acc, c) => acc + c.length * 0.6 + 8, 0) || (projectFlow > 0 ? 15 : 0);
  const isoAirRejeteLoss = isoAirRejete.reduce((acc, c) => acc + c.length * 0.6 + 8, 0) || (projectFlow > 0 ? 15 : 0);
  const totalExtractIsoLoss = Math.round((isoReprisePpalLoss + isoAirRejeteLoss) * 10) / 10;

  const dischargeTerminalLoss = hasIntakeHood || projectFlow > 0 ? 20 : 0;

  const totalExtractPressure = Math.round(
    (maxExtractVentLoss + extractPlenumLoss + totalExtractIsoLoss + dischargeTerminalLoss) * 10
  ) / 10;

  const extractIsoLength = Math.round(
    ((isoReprisePpal.reduce((acc, c) => acc + c.length, 0) || 2) + (isoAirRejete.reduce((acc, c) => acc + c.length, 0) || 2)) * 10
  ) / 10;

  const extractBranch: UnfavorableBranchDetail = {
    branchName: 'Reprise & Rejet d\'Air',
    totalPressureDrop: totalExtractPressure,
    unfavorableVent: unfavExtractVentDetail,
    isoDuctsPressureDrop: totalExtractIsoLoss,
    plenumPressureDrop: extractPlenumLoss,
    terminalExtPressureDrop: dischargeTerminalLoss,
    details: {
      outdoorTerminalPa: dischargeTerminalLoss,
      isopipePa: totalExtractIsoLoss,
      isopipeLengthM: extractIsoLength,
      plenumPa: extractPlenumLoss,
      ductsPa: unfavExtractVentDetail?.ductPressureDrop || 20,
      mostUnfavorableDuctLengthM: unfavExtractVentDetail?.ductLength || 10,
      ventPa: unfavExtractVentDetail?.terminalPressureDrop || 15
    },
    components: [
      { 
        label: `Bouche reprise la plus défavorisée (${unfavExtractVentDetail?.roomName || 'N/A'})`, 
        value: maxExtractVentLoss 
      },
      { label: 'Plénum de répartition reprise', value: extractPlenumLoss },
      { label: 'Réseaux Isopipe (Reprise ppale + Rejet)', value: totalExtractIsoLoss },
      { label: 'Sortie d\'air rejeté (Chapeau de toit / Grille)', value: dischargeTerminalLoss }
    ]
  };

  const systemPressure = Math.max(totalSupplyPressure, totalExtractPressure, projectFlow > 0 ? 45 : 0);

  // Automatically select the best unit based on flow, pressure, and preferences
  const prefs = project.preferences || {
    preferredType: 'Automatique',
    exchangerType: 'Tous',
    passiveHouseOnly: false,
    flowMarginPercent: 15
  };

  const marginMultiplier = 1 + (prefs.flowMarginPercent ?? 15) / 100;
  const targetDesignFlow = projectFlow * marginMultiplier;

  // Filter candidates
  const candidates = HELIOS_UNITS.filter(unit => {
    // Type filter
    if (prefs.preferredType && prefs.preferredType !== 'Automatique') {
      if (unit.type !== prefs.preferredType) return false;
    }
    // Exchanger filter
    if (prefs.exchangerType && prefs.exchangerType !== 'Tous') {
      if (unit.exchangerType !== prefs.exchangerType) return false;
    }
    // Passive House filter
    if (prefs.passiveHouseOnly && !unit.passiveHouse) {
      return false;
    }
    // Aerodynamic capacity
    return unit.maxFlow >= targetDesignFlow && unit.maxPressure >= systemPressure;
  });

  // Pick the best match: closest capacity above targetDesignFlow
  let recommendedUnit: HeliosUnitSpecs | null = null;
  if (candidates.length > 0) {
    recommendedUnit = candidates.reduce((prev, curr) => {
      return curr.maxFlow < prev.maxFlow ? curr : prev;
    });
  } else {
    // Fallback: look across all units
    const fallbackList = HELIOS_UNITS.filter(u => u.maxFlow >= projectFlow);
    recommendedUnit = fallbackList.length > 0 ? fallbackList[0] : HELIOS_UNITS[HELIOS_UNITS.length - 1];
  }

  // Operating speed: percentage of max flow
  const operatingSpeedPercent = recommendedUnit && recommendedUnit.maxFlow > 0
    ? Math.min(100, Math.round((projectFlow / recommendedUnit.maxFlow) * 100))
    : 50;

  // Electrical consumption estimated from EC fans curve
  const estimatedPowerW = projectFlow > 0
    ? Math.max(14, Math.round(16 + (projectFlow / 100) * 18 * Math.pow(operatingSpeedPercent / 65, 2)))
    : 12;

  // SFP (Specific Fan Power in W/(m³/h))
  const sfp = projectFlow > 0
    ? Math.round((estimatedPowerW / projectFlow) * 100) / 100
    : 0.28;

  // Acoustic power level of central unit at calculated fan speed
  const acousticLwA = Math.round(36 + (operatingSpeedPercent / 100) * 16);

  // Calculate detailed acoustics for each vent
  const roomAcoustics: RoomAcousticDetail[] = project.vents.map(vent => {
    let ductLength = 10;
    let ductsCount = vent.ductsCount || Math.max(1, Math.ceil(vent.flowRate / 30));
    let pathPointsCount = 3;

    for (const pl of project.plenums) {
      const conn = pl.connections.find(c => c.ventId === vent.id);
      if (conn) {
        ductLength = conn.length;
        ductsCount = conn.ductsCount || ductsCount;
        pathPointsCount = (conn.path?.length || 2) + (conn.targetLevelPath?.length || 0);
        break;
      }
    }

    // Natural attenuation elements:
    // 1. Plenum FRS-VK interior acoustic absorption foam: 9 dB
    const plenumAttenuation = 9;
    // 2. Linear attenuation of FlexPipe 75 semi-rigid duct: 0.45 dB per meter
    const ductLinearAttenuation = Math.round((ductLength * 0.45) * 10) / 10;
    // 3. Direction changes / elbows (approx 1.2 dB per bend)
    const elbowCount = Math.max(1, pathPointsCount - 2);
    const elbowAttenuation = Math.round((elbowCount * 1.2) * 10) / 10;
    // 4. Terminal diffuser / Coanda effect attenuation
    const terminalAttenuation = 3.0;
    // 5. Room volume absorption effect (diffuse field at 1.5m in furnished room)
    const roomAbsorption = 5.0;

    const totalAttenuation = plenumAttenuation + ductLinearAttenuation + elbowAttenuation + terminalAttenuation + roomAbsorption;
    
    // Sound power level at diffuser LwA
    const soundPowerLwA = Math.max(15, Math.round((acousticLwA - plenumAttenuation - ductLinearAttenuation - elbowAttenuation) * 10) / 10);
    
    // Resulting sound pressure level Lp in room (dB(A))
    const soundPressureLp = Math.max(14, Math.round((soundPowerLwA - terminalAttenuation - roomAbsorption) * 10) / 10);

    let comfortCategory: RoomAcousticDetail['comfortCategory'] = 'OPTIMAL';
    let comfortLabel = 'Chuchotement feutré (18-22 dB(A))';
    let benchmarkDescription = 'Ambiance nocturne très feutrée. Largement inférieur au seuil réglementaire NRA de 25 dB(A).';
    let recommendation: string | undefined = undefined;

    if (soundPressureLp <= 18) {
      comfortCategory = 'EXCEPTIONNEL';
      comfortLabel = 'Silence quasi-absolu (< 18 dB(A))';
      benchmarkDescription = 'Comparable au bruissement de feuilles. Qualité Passivhaus optimale pour sommeil profond.';
    } else if (soundPressureLp <= 22) {
      comfortCategory = 'OPTIMAL';
      comfortLabel = 'Chuchotement feutré (18-22 dB(A))';
      benchmarkDescription = 'Ambiance nocturne très calme. Recommandé pour chambres d\'enfants et suites parentales.';
    } else if (soundPressureLp <= 26) {
      comfortCategory = 'CONFORT';
      comfortLabel = 'Bibliothèque calme (22-26 dB(A))';
      benchmarkDescription = 'Bruit de fond doux de bibliothèque. Très bon confort pour salon, séjour et bureau.';
    } else {
      comfortCategory = 'ATTENTION';
      comfortLabel = 'Souffle perceptible (> 26 dB(A))';
      benchmarkDescription = 'Perceptible en ambiance de nuit silencieuse.';
      recommendation = 'Ajouter un silencieux modulaire Helios FRS-MSD 75 sur ce conduit pour ramener le niveau sous 20 dB(A).';
    }

    return {
      ventId: vent.id,
      roomName: vent.roomId || (vent.type === VentType.SOUFFLAGE ? 'Pièce de vie' : 'Pièce humide'),
      type: vent.type,
      flowRate: vent.flowRate,
      ductLength,
      ductsCount,
      soundPressureLp,
      soundPowerLwA,
      attenuationDetails: {
        unitLwA: acousticLwA,
        plenumAttenuation,
        ductLinearAttenuation,
        elbowAttenuation,
        terminalAttenuation,
        roomAbsorption
      },
      comfortCategory,
      comfortLabel,
      benchmarkDescription,
      recommendation
    };
  });

  const operatingPoint = {
    flow: projectFlow,
    pressure: systemPressure,
    fanSpeedPercent: operatingSpeedPercent,
    estimatedPowerW,
    sfp,
    acousticLwA
  };

  return {
    projectFlow,
    supplyFlow,
    extractFlow,
    systemPressure,
    supplyBranch,
    extractBranch,
    recommendedUnit,
    operatingSpeedPercent,
    operatingPoint,
    roomAcoustics
  };
};
