import { Project, VentType } from '../types';
import { HELIOS_UNITS } from '../constants';
import { calculateCoilCuttingPlan } from './coilCutting';

export interface QuoteLineItem {
  reference: string;
  designation: string;
  category: 'CENTRALE' | 'PLENUM' | 'RESEAU' | 'TERMINAL' | 'ACCESSOIRE' | 'POSE';
  unitPriceHT: number;
  quantity: number;
  totalHT: number;
  unit: string;
}

export interface ProjectQuote {
  projectName: string;
  clientName: string;
  date: string;
  items: QuoteLineItem[];
  subtotalEquipmentHT: number;
  installerDiscountPercent: number;
  discountAmountHT: number;
  subtotalAfterDiscountHT: number;
  laborHT: number;
  totalHT: number;
  tvaRatePercent: number;
  tvaAmount: number;
  totalTTC: number;
}

export interface HubSpotDealPayload {
  properties: {
    dealname: string;
    amount: string;
    dealstage: string;
    pipeline: string;
    closedate?: string;
    description: string;
    kwl_model?: string;
    flow_rate_m3h?: string;
    pressure_pa?: string;
    vents_count?: string;
    coils_count?: string;
  };
}

/**
 * Helios Official Catalog List Prices (Tarifs Publics Indicatifs HT 2026)
 */
export const HELIOS_CATALOG_PRICES: Record<string, number> = {
  // Units base
  'KWL 220 D': 2850,
  'KWL 300 W': 3450,
  'KWL 360 W': 3950,
  'KWL 470 W': 4650,
  'KWL 500 W': 5200,
  'KWL 700 D': 6400,
  'KWL 850 W': 7800,
  'DEFAULT_UNIT': 3450,

  // Options
  'ENTHALPIC_EXCHANGER_OPTION': 680,

  // Distribution Plenums
  'FRS-VK 10-75/160': 235,
  'FRS-VK 6-75/125': 185,

  // Coils FlexPipe 75 (50m)
  'FRS-R 75': 248,

  // Terminal plenums & Diffusers
  'FRS-DF 75/125': 44,
  'DLV 125': 39,
  'KTVA 125': 26,

  // Accessories
  'FRS-MD 75': 19, // Manchon dalle / trémie
  'IP-R 160/1000': 46, // Isopipe barre 1m
  'IP-DHS / IP-FKB': 145, // Terminaux extérieurs
  'FRS-DR 75': 34, // Joints d'étanchéité sachet

  // Installation labor baseline
  'POSE_ET_MISE_EN_SERVICE': 1850
};

/**
 * Calculates a complete itemized quote for the project
 */
export const calculateProjectQuote = (
  project: Project,
  installerDiscountPercent = 25,
  tvaRatePercent = 20,
  includeLabor = true
): ProjectQuote => {
  const cuttingPlan = calculateCoilCuttingPlan(project);
  const items: QuoteLineItem[] = [];

  const unitModel = project.unit?.model || 'KWL 300 W';
  const unitPrice = HELIOS_CATALOG_PRICES[unitModel] || HELIOS_CATALOG_PRICES['DEFAULT_UNIT'];
  const isEnthalpic = project.preferences?.exchangerType === 'Enthalpique';

  // 1. KWL Central Unit
  items.push({
    reference: unitModel,
    designation: `Centrale VMC Double Flux Haut Rendement Helios ${unitModel}`,
    category: 'CENTRALE',
    unitPriceHT: unitPrice,
    quantity: 1,
    totalHT: unitPrice,
    unit: 'Unité'
  });

  // Enthalpic Exchanger Option if selected
  if (isEnthalpic) {
    const enthalpicPrice = HELIOS_CATALOG_PRICES['ENTHALPIC_EXCHANGER_OPTION'];
    items.push({
      reference: 'OPT-ET',
      designation: 'Option Échangeur Enthalpique à récupération d\'humidité',
      category: 'CENTRALE',
      unitPriceHT: enthalpicPrice,
      quantity: 1,
      totalHT: enthalpicPrice,
      unit: 'Option'
    });
  }

  // 2. Plenums de distribution
  const plenumsCount = Math.max(2, project.plenums.length);
  const plenumPrice = HELIOS_CATALOG_PRICES['FRS-VK 10-75/160'];
  items.push({
    reference: 'FRS-VK 10-75/160',
    designation: 'Plénum de distribution acoustique circulaire étanche FRS-VK',
    category: 'PLENUM',
    unitPriceHT: plenumPrice,
    quantity: plenumsCount,
    totalHT: plenumPrice * plenumsCount,
    unit: 'Pièce'
  });

  // 3. FlexPipe 75 coils (50m each)
  const coilsCount = Math.max(1, cuttingPlan.totalCoilsRequired);
  const coilPrice = HELIOS_CATALOG_PRICES['FRS-R 75'];
  items.push({
    reference: 'FRS-R 75',
    designation: 'Couronne de conduit semi-rigide annelé FlexPipe DN75 (50m) antistatique & antibactérien',
    category: 'RESEAU',
    unitPriceHT: coilPrice,
    quantity: coilsCount,
    totalHT: coilPrice * coilsCount,
    unit: 'Couronne 50m'
  });

  // 4. Terminal Plenums FRS-DF
  const ventsCount = Math.max(1, project.vents.length);
  const dfPlenumPrice = HELIOS_CATALOG_PRICES['FRS-DF 75/125'];
  items.push({
    reference: 'FRS-DF 75/125',
    designation: 'Plénum terminal de bouche pour dalle ou faux-plafond FRS-DF',
    category: 'TERMINAL',
    unitPriceHT: dfPlenumPrice,
    quantity: ventsCount,
    totalHT: dfPlenumPrice * ventsCount,
    unit: 'Pièce'
  });

  // 5. Diffusers Soufflage DLV 125
  const supplyVentsCount = project.vents.filter(v => v.type === VentType.SOUFFLAGE).length || 3;
  const dlvPrice = HELIOS_CATALOG_PRICES['DLV 125'];
  items.push({
    reference: 'DLV 125',
    designation: 'Bouche d\'insufflation design ultra-silencieuse DLV 125 blanche',
    category: 'TERMINAL',
    unitPriceHT: dlvPrice,
    quantity: supplyVentsCount,
    totalHT: dlvPrice * supplyVentsCount,
    unit: 'Pièce'
  });

  // 6. Extract Vents KTVA 125
  const extractVentsCount = project.vents.filter(v => v.type === VentType.REPRISE).length || 2;
  const ktvaPrice = HELIOS_CATALOG_PRICES['KTVA 125'];
  items.push({
    reference: 'KTVA 125',
    designation: 'Bouche d\'extraction réglable KTVA 125 blanche',
    category: 'TERMINAL',
    unitPriceHT: ktvaPrice,
    quantity: extractVentsCount,
    totalHT: ktvaPrice * extractVentsCount,
    unit: 'Pièce'
  });

  // 7. Manchons de trémie si des liaisons inter-étages existent
  const shaftTransits = project.plenums.flatMap(p => p.connections).filter(c => c.shaftId).length;
  if (shaftTransits > 0) {
    const mdPrice = HELIOS_CATALOG_PRICES['FRS-MD 75'];
    items.push({
      reference: 'FRS-MD 75',
      designation: 'Manchon de traversée de dalle / trémie technique FRS-MD 75',
      category: 'ACCESSOIRE',
      unitPriceHT: mdPrice,
      quantity: shaftTransits,
      totalHT: mdPrice * shaftTransits,
      unit: 'Pièce'
    });
  }

  // 8. Isopipe insulated main ducts
  const isoLength = Math.max(4, Math.ceil(project.isoConnections.reduce((a, c) => a + c.length, 0) || 4));
  const isoPrice = HELIOS_CATALOG_PRICES['IP-R 160/1000'];
  items.push({
    reference: 'IP-R 160/1000',
    designation: 'Conduit calorifugé Isopipe DN160 anticondensation (barre de 1m)',
    category: 'RESEAU',
    unitPriceHT: isoPrice,
    quantity: isoLength,
    totalHT: isoPrice * isoLength,
    unit: 'Mètre'
  });

  // 9. External terminals
  const hoodsCount = Math.max(2, project.externalHoods.length);
  const hoodPrice = HELIOS_CATALOG_PRICES['IP-DHS / IP-FKB'];
  items.push({
    reference: 'IP-DHS / IP-FKB',
    designation: 'Terminaux extérieurs étanches (Grille façade inox ou Chapeau de toiture)',
    category: 'TERMINAL',
    unitPriceHT: hoodPrice,
    quantity: hoodsCount,
    totalHT: hoodPrice * hoodsCount,
    unit: 'Pièce'
  });

  // 10. Sealing accessories
  const sealPrice = HELIOS_CATALOG_PRICES['FRS-DR 75'];
  items.push({
    reference: 'FRS-DR 75',
    designation: 'Sachet de joints toriques d\'étanchéité classe D & colliers de serrage',
    category: 'ACCESSOIRE',
    unitPriceHT: sealPrice,
    quantity: 1,
    totalHT: sealPrice,
    unit: 'Sachet 10p'
  });

  // Subtotal equipment
  const subtotalEquipmentHT = items.reduce((acc, it) => acc + it.totalHT, 0);

  // Discount
  const discountAmountHT = Math.round((subtotalEquipmentHT * (installerDiscountPercent / 100)) * 100) / 100;
  const subtotalAfterDiscountHT = subtotalEquipmentHT - discountAmountHT;

  // Labor
  const laborHT = includeLabor ? HELIOS_CATALOG_PRICES['POSE_ET_MISE_EN_SERVICE'] : 0;
  const totalHT = Math.round((subtotalAfterDiscountHT + laborHT) * 100) / 100;

  // TVA
  const tvaAmount = Math.round((totalHT * (tvaRatePercent / 100)) * 100) / 100;
  const totalTTC = Math.round((totalHT + tvaAmount) * 100) / 100;

  return {
    projectName: project.name || 'Projet Helios KWL',
    clientName: 'Client',
    date: new Date().toLocaleDateString('fr-FR'),
    items,
    subtotalEquipmentHT,
    installerDiscountPercent,
    discountAmountHT,
    subtotalAfterDiscountHT,
    laborHT,
    totalHT,
    tvaRatePercent,
    tvaAmount,
    totalTTC
  };
};

/**
 * Builds the HubSpot CRM Deals Payload
 */
export const buildHubSpotDealPayload = (
  project: Project,
  quote: ProjectQuote,
  customDealName?: string,
  dealStage = 'appointmentscheduled',
  pipeline = 'default'
): HubSpotDealPayload => {
  const totalSupply = project.vents.filter(v => v.type === VentType.SOUFFLAGE).reduce((a, v) => a + v.flowRate, 0);
  const totalExtract = project.vents.filter(v => v.type === VentType.REPRISE).reduce((a, v) => a + v.flowRate, 0);
  const coilsCount = Math.max(1, calculateCoilCuttingPlan(project).totalCoilsRequired);

  const desc = [
    `Étude Aéraulique VMC Double Flux Helios`,
    `Projet: ${project.name} (Typologie ${project.houseType})`,
    `Centrale: ${project.unit?.model || 'KWL 300 W'} (${project.preferences?.exchangerType || 'Standard'})`,
    `Débit Soufflage: ${totalSupply} m³/h | Débit Reprise: ${totalExtract} m³/h`,
    `Nombre de bouches: ${project.vents.length} | Couronnes FlexPipe 75: ${coilsCount}x 50m`,
    `Sous-total Matériel HT: ${quote.subtotalEquipmentHT} €`,
    `Remise Installateur (${quote.installerDiscountPercent}%): -${quote.discountAmountHT} €`,
    `Main d'œuvre pose: ${quote.laborHT} €`,
    `Total Devis HT: ${quote.totalHT} € | Total TTC: ${quote.totalTTC} €`
  ].join('\n');

  return {
    properties: {
      dealname: customDealName || `Devis VMC KWL - ${project.name}`,
      amount: quote.totalHT.toFixed(2),
      dealstage: dealStage,
      pipeline: pipeline,
      closedate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      description: desc,
      kwl_model: project.unit?.model || 'KWL 300 W',
      flow_rate_m3h: Math.max(totalSupply, totalExtract).toString(),
      vents_count: project.vents.length.toString(),
      coils_count: coilsCount.toString()
    }
  };
};

/**
 * Sends Deal to HubSpot API using user's Private App Token
 */
export const sendDealToHubSpot = async (
  token: string,
  payload: HubSpotDealPayload
): Promise<{ success: boolean; dealId?: string; error?: string; rawResponse?: any }> => {
  if (!token || token.trim().length === 0) {
    return {
      success: false,
      error: "Jeton d'accès privé HubSpot (Private App Token) manquant. Renseignez votre jeton d'accès HubSpot."
    };
  }

  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      return {
        success: true,
        dealId: data.id,
        rawResponse: data
      };
    } else {
      return {
        success: false,
        error: data.message || `Erreur HubSpot API (${res.status}): ${JSON.stringify(data.errors || data)}`,
        rawResponse: data
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Erreur de connexion réseau vers api.hubapi.com. Vérifiez vos règles CORS ou votre proxy."
    };
  }
};

/**
 * Exports Quote as CSV for direct import into Excel or any CRM
 */
export const exportQuoteToCSV = (quote: ProjectQuote): string => {
  const headers = ['Reference', 'Designation', 'Categorie', 'Prix_Unitaire_HT', 'Quantite', 'Unite', 'Total_HT'];
  const rows = quote.items.map(item => [
    `"${item.reference}"`,
    `"${item.designation.replace(/"/g, '""')}"`,
    `"${item.category}"`,
    item.unitPriceHT.toFixed(2),
    item.quantity.toString(),
    `"${item.unit}"`,
    item.totalHT.toFixed(2)
  ]);

  rows.push([]);
  rows.push(['"SOUS_TOTAL_MATERIEL_HT"', '""', '""', '""', '""', '""', quote.subtotalEquipmentHT.toFixed(2)]);
  rows.push([`"REMISE_INSTALLATEUR_${quote.installerDiscountPercent}%"`, '""', '""', '""', '""', '""', `-${quote.discountAmountHT.toFixed(2)}`]);
  rows.push(['"MAIN_D_OEUVRE_POSE_HT"', '""', '""', '""', '""', '""', quote.laborHT.toFixed(2)]);
  rows.push(['"TOTAL_DEVIS_HT"', '""', '""', '""', '""', '""', quote.totalHT.toFixed(2)]);
  rows.push([`"TVA_${quote.tvaRatePercent}%"`, '""', '""', '""', '""', '""', quote.tvaAmount.toFixed(2)]);
  rows.push(['"TOTAL_TTC"', '""', '""', '""', '""', '""', quote.totalTTC.toFixed(2)]);

  return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
};
