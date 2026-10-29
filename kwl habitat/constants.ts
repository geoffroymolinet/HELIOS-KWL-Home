
import { RoomType } from './types';

export const ISOPIPE_STYLES: Record<string, { color: string, radius: number, label: string }> = {
  AIR_NEUF: { color: '#06b6d4', radius: 80, label: 'Air Neuf (Prise extérieure -> KWL)' },       
  SOUFFLAGE_PPAL: { color: '#2563eb', radius: 80, label: 'Soufflage Principal (KWL -> Plénum)' }, 
  REPRISE_PPAL: { color: '#dc2626', radius: 80, label: 'Reprise Principale (Plénum -> KWL)' },    
  AIR_REJETE: { color: '#ea580c', radius: 80, label: 'Air Rejeté (KWL -> Sortie)' },   
};

export const DTU_FLOW_RATES: Record<string, any> = {
  'T1': { [RoomType.CUISINE]: 75, [RoomType.SDB]: 15, [RoomType.WC]: 15, [RoomType.SDB_WC]: 15, 'TOTAL_MIN': 35 },
  'T2': { [RoomType.CUISINE]: 90, [RoomType.SDB]: 15, [RoomType.WC]: 15, [RoomType.SDB_WC]: 30, 'TOTAL_MIN': 60 },
  'T3': { [RoomType.CUISINE]: 105, [RoomType.SDB]: 30, [RoomType.WC]: 15, [RoomType.SDB_WC]: 45, 'TOTAL_MIN': 75 },
  'T4': { [RoomType.CUISINE]: 120, [RoomType.SDB]: 30, [RoomType.WC]: 30, [RoomType.SDB_WC]: 45, 'TOTAL_MIN': 90 },
  'T5': { [RoomType.CUISINE]: 135, [RoomType.SDB]: 30, [RoomType.WC]: 30, [RoomType.SDB_WC]: 45, 'TOTAL_MIN': 105 },
  'T6+': { [RoomType.CUISINE]: 135, [RoomType.SDB]: 30, [RoomType.WC]: 30, [RoomType.SDB_WC]: 45, 'TOTAL_MIN': 120 },
};

export const ROOM_CATEGORIES = {
  EXTRACT: [RoomType.CUISINE, RoomType.SDB, RoomType.WC, RoomType.SDB_WC, RoomType.BUANDERIE],
  SUPPLY: [RoomType.CHAMBRE, RoomType.SEJOUR, RoomType.SALON, RoomType.CELLIER, RoomType.AUTRE]
};

export const HELIOS_SPECS = {
  FRS_75: {
    EXT_DIAM: 75,
    MAX_FLOW_PER_DUCT: 30, 
    MIN_BENDING_RADIUS: 0.45,
    PRESSURE_COEFF: 2.2, 
  },
  ISOPIPE: {
    DP_LINEAR: 0.5,      
    DP_ELBOW_45: 0.8,    
    DP_ELBOW_90: 1.5,    
    WALL_THICKNESS: 15,
    DIAMETERS: [125, 160, 180] // Diamètres Isopipe Helios
  },
  TERMINALS: {
    FACADE: { model: 'IP-FKB', label: 'Grille de façade Inox' },
    ROOF: { model: 'IP-DHS', label: 'Chapeau de toiture' }
  }
};

export interface HeliosUnitSpecs {
  model: string;
  maxFlow: number;             // m³/h
  maxPressure: number;         // Pa
  dn: number;                  // mm
  type: 'Mural' | 'Plafonnier' | 'Sol' | 'Décentralisé';
  exchangerType: 'Standard' | 'Enthalpique';
  hasHumidityRecovery: boolean; // Récupération d'humidité (modèles ET)
  passiveHouse: boolean;        // Certifié PassivHaus Institut (PHI)
  efficiency: string;           // ex: '93%'
  weight: number;               // kg
  class: string;                // 'A+' ou 'A'
  spi: number;                  // W/(m³/h)
  domains: string[];
  description: string;
}

export const HELIOS_UNITS: HeliosUnitSpecs[] = ([
  // 1. Décentralisés
  { model: 'Helios KWL EC 45-160', maxFlow: 45, maxPressure: 60, dn: 160, type: 'Décentralisé', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: false, efficiency: '88%', weight: 4.5, class: 'A+', spi: 0.16, domains: ['Pièce d\'habitation', 'Maison individuelle'], description: 'Ventilation décentralisée avec accumulateur thermique céramique' },
  { model: 'Helios KWL EC 60', maxFlow: 60, maxPressure: 80, dn: 100, type: 'Décentralisé', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: false, efficiency: '70%', weight: 9, class: 'A', spi: 0.22, domains: ['Pièce d\'habitation', 'Maison individuelle', 'Immeuble par appt'], description: 'Appareil compact décentralisé pour rénovation' },
  { model: 'Helios KWL EC 70', maxFlow: 70, maxPressure: 120, dn: 100, type: 'Décentralisé', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: false, efficiency: '85%', weight: 15, class: 'A+', spi: 0.20, domains: ['Pièce d\'habitation', 'Maison individuelle', 'Immeuble par appt'], description: 'Appareil décentralisé haut rendement' },
  { model: 'Helios KWL EC 70 ET', maxFlow: 70, maxPressure: 120, dn: 100, type: 'Décentralisé', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: false, efficiency: '81%', weight: 15, class: 'A', spi: 0.20, domains: ['Pièce d\'habitation', 'Maison individuelle', 'Immeuble par appt'], description: 'Appareil décentralisé avec récupération d\'humidité (échangeur enthalpique)' },

  // 2. Muraux Standard (W)
  { model: 'Helios KWL 170 W', maxFlow: 170, maxPressure: 300, dn: 125, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '88%', weight: 36, class: 'A+', spi: 0.27, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale compacte murale certifiée PassivHaus pour T2/T3' },
  { model: 'Helios KWL 170 W ET', maxFlow: 170, maxPressure: 300, dn: 125, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '84%', weight: 36, class: 'A', spi: 0.27, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale compacte PassivHaus avec récupération d\'humidité' },
  
  { model: 'Helios KWL 200 W', maxFlow: 200, maxPressure: 350, dn: 125, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: false, efficiency: '91%', weight: 37, class: 'A', spi: 0.25, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale pour logements individuels et collectifs' },
  { model: 'Helios KWL 200 W ET', maxFlow: 200, maxPressure: 350, dn: 125, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: false, efficiency: '87%', weight: 37, class: 'A', spi: 0.25, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale avec échangeur enthalpique' },

  { model: 'Helios KWL 220 D', maxFlow: 220, maxPressure: 380, dn: 125, type: 'Plafonnier', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '90%', weight: 42, class: 'A+', spi: 0.22, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale plafonnière extra-plate certifiée PassivHaus' },

  { model: 'Helios KWL 250 W', maxFlow: 250, maxPressure: 380, dn: 125, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '93%', weight: 43, class: 'A+', spi: 0.22, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale certifiée PassivHaus pour T3/T4' },
  { model: 'Helios KWL 250 W ET', maxFlow: 250, maxPressure: 380, dn: 125, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '89%', weight: 43, class: 'A', spi: 0.22, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale PassivHaus avec récupération d\'humidité' },

  { model: 'Helios KWL 300 W', maxFlow: 300, maxPressure: 400, dn: 160, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '90%', weight: 37, class: 'A', spi: 0.22, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale polyvalente avec régulation easyControls 3.0' },
  { model: 'Helios KWL 300 W ET', maxFlow: 300, maxPressure: 400, dn: 160, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '86%', weight: 37, class: 'A', spi: 0.22, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale avec échangeur enthalpique et easyControls 3.0' },

  { model: 'Helios KWL 340 D', maxFlow: 340, maxPressure: 450, dn: 160, type: 'Plafonnier', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '92%', weight: 54, class: 'A+', spi: 0.21, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale plafonnière extra-plate 340 m³/h certifiée PassivHaus' },

  { model: 'Helios KWL 360 W', maxFlow: 360, maxPressure: 420, dn: 160, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '94%', weight: 72, class: 'A+', spi: 0.20, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale premium haute efficacité A+ (94%)' },
  { model: 'Helios KWL 360 W ET', maxFlow: 360, maxPressure: 420, dn: 160, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '90%', weight: 72, class: 'A', spi: 0.20, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale premium avec échangeur enthalpique' },

  { model: 'Helios KWL 470 W', maxFlow: 470, maxPressure: 500, dn: 160, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '92%', weight: 70, class: 'A+', spi: 0.21, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale grand volume pour villas et grandes maisons' },
  { model: 'Helios KWL 470 W ET', maxFlow: 470, maxPressure: 500, dn: 160, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '88%', weight: 70, class: 'A', spi: 0.21, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale grand volume avec échangeur enthalpique' },

  { model: 'Helios KWL 500 W', maxFlow: 500, maxPressure: 550, dn: 160, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '90%', weight: 58, class: 'A', spi: 0.21, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale 500 m³/h pour habitat individuel ou petit tertiaire' },
  { model: 'Helios KWL 500 W ET', maxFlow: 500, maxPressure: 550, dn: 160, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '86%', weight: 58, class: 'A', spi: 0.21, domains: ['Maison individuelle', 'Immeuble par appt'], description: 'Centrale murale 500 m³/h avec récupération d\'humidité' },

  // 3. Plafonniers Haute Puissance (D)
  { model: 'Helios KWL EC 700 D', maxFlow: 700, maxPressure: 600, dn: 250, type: 'Plafonnier', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '90%', weight: 110, class: 'A', spi: 0.23, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale plafonnière grand débit pour habitat groupé ou tertiaire' },
  { model: 'Helios KWL EC 1400 D', maxFlow: 1400, maxPressure: 700, dn: 315, type: 'Plafonnier', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '89%', weight: 165, class: 'A', spi: 0.25, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale plafonnière tertiaire 1400 m³/h' },
  { model: 'Helios KWL EC 2000 D', maxFlow: 2000, maxPressure: 750, dn: 355, type: 'Plafonnier', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '88%', weight: 210, class: 'A', spi: 0.26, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale plafonnière collective et tertiaire 2000 m³/h' },

  // 4. Modèles Sol (S) & Très Grands Volumes
  { model: 'Helios KWL EC 800 S', maxFlow: 800, maxPressure: 700, dn: 250, type: 'Sol', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '90%', weight: 180, class: 'A', spi: 0.24, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale de sol compacte avec récupération d\'humidité' },
  { model: 'Helios KWL 890 W', maxFlow: 890, maxPressure: 600, dn: 200, type: 'Mural', exchangerType: 'Standard', hasHumidityRecovery: false, passiveHouse: true, efficiency: '91%', weight: 98, class: 'A+', spi: 0.20, domains: ['Maison individuelle', 'Immeuble par appt', 'Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale murale très haute performance jusqu\'à 890 m³/h' },
  { model: 'Helios KWL 890 W ET', maxFlow: 890, maxPressure: 600, dn: 200, type: 'Mural', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '87%', weight: 98, class: 'A+', spi: 0.20, domains: ['Maison individuelle', 'Immeuble par appt', 'Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale murale 890 m³/h avec échangeur enthalpique certifié PassivHaus' },
  { model: 'Helios KWL EC 1200 S', maxFlow: 1200, maxPressure: 750, dn: 315, type: 'Sol', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '89%', weight: 230, class: 'A', spi: 0.25, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale de sol tertiaire et collectif avec récupération d\'humidité' },
  { model: 'Helios KWL EC 1800 S', maxFlow: 1800, maxPressure: 850, dn: 355, type: 'Sol', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '88%', weight: 320, class: 'A', spi: 0.26, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale de sol haute puissance pour collectif et tertiaire' },
  { model: 'Helios KWL EC 2600 S', maxFlow: 2600, maxPressure: 1000, dn: 560, type: 'Sol', exchangerType: 'Enthalpique', hasHumidityRecovery: true, passiveHouse: true, efficiency: '87%', weight: 490, class: 'A', spi: 0.27, domains: ['Immeuble centralisé', 'Bâtiments tertiaires'], description: 'Centrale de sol ultra-puissance 2600 m³/h - 1000 Pa avec batterie eau chaude/électrique (Page 2 PDF)' },
] as HeliosUnitSpecs[]).sort((a, b) => a.maxFlow - b.maxFlow);
