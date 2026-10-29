
export type Point = { x: number; y: number };

export enum RoomType {
  CUISINE = 'Cuisine',
  SDB = 'Salle de Bain',
  WC = 'WC',
  SDB_WC = 'SDB + WC',
  SEJOUR = 'Séjour',
  SALON = 'Salon',
  CHAMBRE = 'Chambre',
  BUANDERIE = 'Buanderie',
  CELLIER = 'Cellier/Bureau',
  AUTRE = 'Autre'
}

export enum VentType {
  SOUFFLAGE = 'Soufflage',
  REPRISE = 'Reprise'
}

export interface Obstacle {
  id: string;
  points: Point[];
  level: number;
  type: 'WALL' | 'STRUCTURE';
}

export interface Dimension {
  id: string;
  p1: Point;
  p2: Point;
  offsetPos: Point;
  level: number;
}

export interface Vent {
  id: string;
  type: VentType;
  roomId: string;
  pos: Point;
  level: number;
  flowRate: number;
  ductsCount: number;
  connected: boolean;
}

export interface Shaft {
  id: string;
  name: string;
  pos: Point;
  width: number; // in meters (e.g. 0.45m)
  height: number; // in meters (e.g. 0.45m)
  fromLevel: number; // e.g. 0 (RDC)
  toLevel: number; // e.g. 1 (Étage 1)
}

export interface Connection {
  id?: string;
  ventId: string;
  path: Point[];
  targetLevelPath?: Point[];
  length: number;
  fromLevel: number;
  toLevel: number;
  ductsCount: number;
  shaftId?: string;
}

export interface IsoConnection {
  id: string;
  fromId: string; 
  toId: string;   
  type: 'AIR_NEUF' | 'AIR_REJETE' | 'SOUFFLAGE_PPAL' | 'REPRISE_PPAL';
  path: Point[];
  length: number;
  diameter: number;
  pressureLoss: number;
}

export interface Level {
  id: number;
  name: string;
  backgroundImage?: string;
  rooms: any[];
  planOpacity: number;
  planScale: number;
  planOffset: Point;
  zoom: number; // Stockage du zoom pour le rapport
  viewOffset: Point; // Stockage du pan pour le rapport
  planWidth?: number;
  planHeight?: number;
}

export interface Plenum {
  id: string;
  type: VentType;
  pos: Point;
  level: number;
  connections: Connection[];
  model: string;
}

export interface Unit {
  id: string;
  model: string;
  pos: Point;
  level: number;
}

export interface ExternalHood {
  id: string;
  pos: Point;
  level: number;
  type: string;
}

export interface UnitPreferences {
  preferredType: 'Automatique' | 'Mural' | 'Plafonnier' | 'Sol';
  exchangerType: 'Tous' | 'Standard' | 'Enthalpique';
  passiveHouseOnly: boolean;
  flowMarginPercent: number; // e.g. 15 (%)
}

export interface Project {
  name: string;
  address?: string;
  reference?: string;
  levels: Level[];
  vents: Vent[];
  plenums: Plenum[];
  dimensions: Dimension[];
  isoConnections: IsoConnection[];
  obstacles: Obstacle[];
  unit: Unit | null;
  externalHoods: ExternalHood[];
  shafts: Shaft[];
  houseType: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6+';
  pixelsPerMeter: number;
  preferences?: UnitPreferences;
}
