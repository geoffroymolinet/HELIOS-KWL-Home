import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import { HELIOS_UNITS, HeliosUnitSpecs } from '../constants';
import { calculateAerodynamics, OperatingPointResult } from '../utils/aerodynamics';
import { 
  X, CheckCircle, Activity, BarChart2, Filter, Settings2, Wind, 
  Sparkles, Sliders, Droplets, Home, ArrowRight, ShieldCheck, 
  AlertTriangle, Check, Layers, ChevronRight, Gauge
} from 'lucide-react';

interface UnitSelectorProps {
  project: Project;
  setProject?: React.Dispatch<React.SetStateAction<Project>>;
  selectedModel: string;
  onSelect: (model: string) => void;
  onClose: () => void;
}

const UnitSelector: React.FC<UnitSelectorProps> = ({ 
  project, 
  setProject, 
  selectedModel, 
  onSelect, 
  onClose 
}) => {
  // Compute real aerodynamics for both branches
  const aeroResult: OperatingPointResult = useMemo(() => {
    return calculateAerodynamics(project);
  }, [project]);

  // Local preferences state
  const [preferredType, setPreferredType] = useState<'Tous' | 'Mural' | 'Plafonnier' | 'Sol' | 'Décentralisé'>(
    project.preferences?.preferredType || 'Tous'
  );
  const [exchangerType, setExchangerType] = useState<'Tous' | 'Standard' | 'Enthalpique'>(
    project.preferences?.exchangerType || 'Tous'
  );
  const [passiveHouseOnly, setPassiveHouseOnly] = useState<boolean>(
    project.preferences?.passiveHouseOnly || false
  );
  const [flowMargin, setFlowMargin] = useState<number>(
    project.preferences?.flowMarginPercent ?? 15
  );

  // Active previewed unit
  const [previewModel, setPreviewModel] = useState<string>(
    selectedModel || aeroResult.recommendedUnit?.model || 'Helios KWL 300 W'
  );

  // Active view tab in right pane
  const [activeTab, setActiveTab] = useState<'AERAULIQUE' | 'COURBE' | 'CATALOGUE'>('AERAULIQUE');

  // Filter units
  const filteredUnits = useMemo(() => {
    return HELIOS_UNITS.filter(u => {
      if (preferredType !== 'Tous' && u.type !== preferredType) return false;
      if (exchangerType !== 'Tous' && u.exchangerType !== exchangerType) return false;
      if (passiveHouseOnly && !u.passiveHouse) return false;
      return true;
    });
  }, [preferredType, exchangerType, passiveHouseOnly]);

  const previewUnit = useMemo(() => {
    return HELIOS_UNITS.find(u => u.model === previewModel) || HELIOS_UNITS[0];
  }, [previewModel]);

  // Check if a unit covers the operating point with margin
  const isUnitCompatible = (unit: HeliosUnitSpecs) => {
    const targetQ = aeroResult.projectFlow * (1 + flowMargin / 100);
    // Theoretical pressure at operating flow
    const maxPAtFlow = unit.maxPressure * (1 - Math.pow(Math.min(1, aeroResult.projectFlow / unit.maxFlow), 1.8));
    return unit.maxFlow >= targetQ && maxPAtFlow >= aeroResult.systemPressure;
  };

  // Save preferences to project when changed
  const updateProjectPreferences = (
    newType = preferredType,
    newExchanger = exchangerType,
    newPHI = passiveHouseOnly,
    newMargin = flowMargin
  ) => {
    if (setProject) {
      setProject(prev => ({
        ...prev,
        preferences: {
          preferredType: newType as any,
          exchangerType: newExchanger,
          passiveHouseOnly: newPHI,
          flowMarginPercent: newMargin
        }
      }));
    }
  };

  // Fan curve calculation
  const getCurvePressure = (unit: HeliosUnitSpecs, q: number) => {
    if (q >= unit.maxFlow) return 0;
    return unit.maxPressure * (1 - Math.pow(q / unit.maxFlow, 1.8));
  };

  const Chart = ({ unit }: { unit: HeliosUnitSpecs }) => {
    const w = 560;
    const h = 270;
    const padX = 55;
    const padY = 35;
    
    const maxX = Math.max(unit.maxFlow * 1.15, aeroResult.projectFlow * 1.25, 200);
    const maxY = Math.max(unit.maxPressure * 1.15, aeroResult.systemPressure * 1.25, 300);

    const scaleQ = (q: number) => padX + (q / maxX) * (w - padX - 25);
    const scaleP = (p: number) => h - padY - (p / maxY) * (h - padY - 20);

    const points = Array.from({ length: 45 }, (_, i) => {
      const q = (i / 44) * unit.maxFlow;
      const p = getCurvePressure(unit, q);
      return { q, p: Math.max(0, p) };
    });

    const pathD = `M ${points.map(pt => `${scaleQ(pt.q)} ${scaleP(pt.p)}`).join(' L ')}`;

    // Operating point
    const opX = scaleQ(aeroResult.projectFlow);
    const opY = scaleP(aeroResult.systemPressure);
    const pAtOpQ = getCurvePressure(unit, aeroResult.projectFlow);
    const isUnderCurve = aeroResult.systemPressure <= pAtOpQ && aeroResult.projectFlow <= unit.maxFlow;

    return (
      <div className="w-full relative flex flex-col items-center">
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible select-none">
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and axes */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const flowVal = Math.round((maxX * ratio) / 10) * 10;
            const pressVal = Math.round((maxY * ratio) / 10) * 10;
            return (
              <React.Fragment key={ratio}>
                <line 
                  x1={padX} 
                  y1={scaleP(pressVal)} 
                  x2={w - 25} 
                  y2={scaleP(pressVal)} 
                  stroke="#e2e8f0" 
                  strokeDasharray="4,4" 
                  strokeWidth="1"
                />
                <line 
                  x1={scaleQ(flowVal)} 
                  y1={20} 
                  x2={scaleQ(flowVal)} 
                  y2={h - padY} 
                  stroke="#e2e8f0" 
                  strokeDasharray="4,4" 
                  strokeWidth="1"
                />
                <text x={padX - 8} y={scaleP(pressVal) + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-bold font-mono">
                  {pressVal}
                </text>
                <text x={scaleQ(flowVal)} y={h - 15} textAnchor="middle" className="text-[9px] fill-slate-400 font-bold font-mono">
                  {flowVal}
                </text>
              </React.Fragment>
            );
          })}

          {/* Axis Labels */}
          <text x={12} y={15} className="text-[9px] font-black fill-slate-500 uppercase tracking-wider">
            Pression (Pa)
          </text>
          <text x={w - 30} y={h - 15} textAnchor="end" className="text-[9px] font-black fill-slate-500 uppercase tracking-wider">
            Débit (m³/h)
          </text>

          {/* Curve Area & Line */}
          <path d={`${pathD} L ${scaleQ(unit.maxFlow)} ${scaleP(0)} L ${scaleQ(0)} ${scaleP(0)} Z`} fill="url(#curveGradient)" />
          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />

          {/* 70% Speed / Comfort Acoustic Zone */}
          <line 
            x1={scaleQ(unit.maxFlow * 0.7)} 
            y1={20} 
            x2={scaleQ(unit.maxFlow * 0.7)} 
            y2={h - padY} 
            stroke="#10b981" 
            strokeWidth="1.5" 
            strokeDasharray="6,4" 
          />
          <text x={scaleQ(unit.maxFlow * 0.7) + 4} y={32} className="text-[8px] font-black fill-emerald-600 uppercase">
            Limite Confort Acoustique (70%)
          </text>

          {/* Operating Point */}
          {aeroResult.projectFlow > 0 && (
            <g>
              {/* Projection lines */}
              <line x1={padX} y1={opY} x2={opX} y2={opY} stroke={isUnderCurve ? "#10b981" : "#ef4444"} strokeWidth="1.5" strokeDasharray="3,3" />
              <line x1={opX} y1={h - padY} x2={opX} y2={opY} stroke={isUnderCurve ? "#10b981" : "#ef4444"} strokeWidth="1.5" strokeDasharray="3,3" />
              
              {/* Pulsing ring */}
              <circle cx={opX} cy={opY} r="12" fill={isUnderCurve ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"} className="animate-pulse" />
              <circle cx={opX} cy={opY} r="6" fill={isUnderCurve ? "#10b981" : "#ef4444"} stroke="#ffffff" strokeWidth="2" />
              
              {/* Badge above point */}
              <g transform={`translate(${opX}, ${opY - 18})`}>
                <rect x="-42" y="-14" width="84" height="18" rx="5" fill="#0f172a" />
                <text x="0" y="-2" textAnchor="middle" className="text-[8.5px] font-black fill-white">
                  {aeroResult.projectFlow} m³/h • {aeroResult.systemPressure.toFixed(0)} Pa
                </text>
              </g>
            </g>
          )}
        </svg>

        <div className="flex items-center gap-6 mt-3 text-[10px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-1 bg-blue-600 rounded" />
            <span>Courbe Caractéristique {unit.model}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            <span>Point de Fonctionnement ({aeroResult.projectFlow} m³/h @ {aeroResult.systemPressure.toFixed(1)} Pa)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500 border-t border-dashed" />
            <span>Plage Acoustique Idéale (&lt; 70%)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-7xl h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-100">
        
        {/* Top Header */}
        <div className="bg-slate-900 px-8 py-5 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-red-600 p-2.5 rounded-2xl shadow-lg shadow-red-500/20">
              <Settings2 size={22} className="text-white"/>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black uppercase tracking-tight">Dimensionnement & Sélection Centrale Helios KWL</h2>
                <span className="text-[9px] font-black uppercase bg-red-600/30 text-red-400 border border-red-500/30 px-2.5 py-0.5 rounded-full">
                  Catalogue Officiel Helios ({HELIOS_UNITS.length} machines)
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Calcul précis des pertes de charge des réseaux défavorisés • Échangeurs Enthalpiques ET • Plafonniers & Muraux
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-slate-300 hover:text-white"
            title="Fermer"
          >
            <X size={20}/>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50/50">
          
          {/* Left Column: Configuration, Filters & Point de Fonctionnement */}
          <div className="w-[380px] bg-white border-r border-slate-100 flex flex-col overflow-y-auto p-6 space-y-6 shrink-0 custom-scrollbar">
            
            {/* Synthesis Operating Point Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <Gauge size={100} />
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Point de Fonctionnement</span>
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                  isUnitCompatible(previewUnit) 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {isUnitCompatible(previewUnit) ? 'Plage Conforme' : 'Hors Courbe'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Débit Global (Q)</p>
                  <p className="text-2xl font-black text-white">
                    {aeroResult.projectFlow} <span className="text-xs font-bold text-slate-400">m³/h</span>
                  </p>
                  <p className="text-[7.5px] text-slate-400 mt-1">
                    Souf: {aeroResult.supplyFlow} / Rep: {aeroResult.extractFlow}
                  </p>
                </div>

                <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pression Exigée (ΔP)</p>
                  <p className="text-2xl font-black text-amber-400">
                    {aeroResult.systemPressure.toFixed(1)} <span className="text-xs font-bold text-slate-400">Pa</span>
                  </p>
                  <p className="text-[7.5px] text-slate-400 mt-1">
                    Réseau le plus défavorisé
                  </p>
                </div>
              </div>

              {/* Operating load */}
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[9px]">
                <span className="text-slate-400 font-bold uppercase">Régime moteur estimé :</span>
                <span className="font-black text-emerald-400">
                  {previewUnit.maxFlow > 0 ? Math.round((aeroResult.projectFlow / previewUnit.maxFlow) * 100) : 0}% de la vitesse max
                </span>
              </div>
            </div>

            {/* Selection Parameters */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-red-600" />
                <h3 className="text-[11px] font-black uppercase text-slate-900 tracking-wider">Paramètres de Choix</h3>
              </div>

              {/* Type d'installation */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Type d'implantation</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                  {(['Tous', 'Mural', 'Plafonnier', 'Sol'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setPreferredType(t);
                        updateProjectPreferences(t, exchangerType, passiveHouseOnly, flowMargin);
                      }}
                      className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                        preferredType === t 
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {t === 'Mural' ? 'Mural (W)' : t === 'Plafonnier' ? 'Plafonnier (D)' : t === 'Sol' ? 'Sol (S)' : 'Tous types'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Technologie Échangeur (Standard vs Enthalpique ET) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Échangeur Thermique</label>
                  <span className="text-[8px] font-bold text-purple-600 flex items-center gap-1">
                    <Droplets size={10} /> Modèles ET
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                  {(['Tous', 'Standard', 'Enthalpique'] as const).map(ex => (
                    <button
                      key={ex}
                      onClick={() => {
                        setExchangerType(ex);
                        updateProjectPreferences(preferredType, ex, passiveHouseOnly, flowMargin);
                      }}
                      className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                        exchangerType === ex 
                          ? ex === 'Enthalpique'
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-white text-slate-900 shadow-sm border border-slate-200'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {ex === 'Enthalpique' ? 'Enthalpique (ET)' : ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Maison Passive Certification Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-green-100 text-green-700 rounded-xl">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-900 tracking-tight">Certificat PassivHaus</p>
                    <p className="text-[8px] text-slate-400 font-bold">Labellisé Institut Maison Passive (PHI)</p>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  checked={passiveHouseOnly} 
                  onChange={(e) => {
                    setPassiveHouseOnly(e.target.checked);
                    updateProjectPreferences(preferredType, exchangerType, e.target.checked, flowMargin);
                  }}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
              </div>

              {/* Marge de sécurité Acoustique / Débit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Réserve acoustique</label>
                  <span className="text-[9px] font-black text-slate-900">+{flowMargin}%</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                  {[0, 10, 15, 25].map(m => (
                    <button
                      key={m}
                      onClick={() => {
                        setFlowMargin(m);
                        updateProjectPreferences(preferredType, exchangerType, passiveHouseOnly, m);
                      }}
                      className={`py-1.5 rounded-xl text-[9px] font-black transition-all ${
                        flowMargin === m 
                          ? 'bg-white text-red-600 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      +{m}%
                    </button>
                  ))}
                </div>
                <p className="text-[7.5px] text-slate-400 font-bold italic">
                  +15% recommandé pour garantir un fonctionnement à vitesse réduite et silencieux.
                </p>
              </div>
            </div>

            {/* Selected / Previewed Unit Action Card */}
            <div className="mt-auto border-2 border-red-600/30 bg-red-50/20 rounded-3xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  Centrale Sélectionnée
                </span>
                {previewUnit.hasHumidityRecovery && (
                  <span className="text-[8px] font-black uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                    Enthalpique ET
                  </span>
                )}
              </div>

              <h4 className="text-xl font-black text-slate-900 italic tracking-tight">{previewUnit.model}</h4>
              <p className="text-[8.5px] text-slate-500 font-bold mb-3">{previewUnit.description}</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                  <p className="text-[7.5px] font-bold text-slate-400 uppercase">Qmax</p>
                  <p className="font-black text-xs text-slate-900">{previewUnit.maxFlow} m³/h</p>
                </div>
                <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                  <p className="text-[7.5px] font-bold text-slate-400 uppercase">Pmax</p>
                  <p className="font-black text-xs text-slate-900">{previewUnit.maxPressure} Pa</p>
                </div>
                <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                  <p className="text-[7.5px] font-bold text-slate-400 uppercase">Classe</p>
                  <p className="font-black text-xs text-emerald-600">{previewUnit.class}</p>
                </div>
              </div>

              <button 
                onClick={() => onSelect(previewUnit.model)}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-wider transition-all shadow-xl shadow-red-500/20 flex items-center justify-center gap-2"
              >
                <Check size={16} /> Valider cette centrale
              </button>
            </div>
          </div>

          {/* Right Area: Navigation Tabs + Detailed Analysis */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            
            {/* View Navigation Tabs */}
            <div className="bg-white px-8 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('AERAULIQUE')}
                  className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeTab === 'AERAULIQUE'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Wind size={15} />
                  <span>Réseaux Défavorisés</span>
                </button>

                <button
                  onClick={() => setActiveTab('COURBE')}
                  className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeTab === 'COURBE'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <BarChart2 size={15} />
                  <span>Courbe & Point de Fonctionnement</span>
                </button>

                <button
                  onClick={() => setActiveTab('CATALOGUE')}
                  className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                    activeTab === 'CATALOGUE'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Layers size={15} />
                  <span>Catalogue Complet KWL ({filteredUnits.length})</span>
                </button>
              </div>

              {/* Automatic Recommendation Chip */}
              {aeroResult.recommendedUnit && (
                <div 
                  onClick={() => setPreviewModel(aeroResult.recommendedUnit!.model)}
                  className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all"
                  title="Cliquez pour afficher la centrale recommandée par le calcul automatique"
                >
                  <Sparkles size={14} className="text-amber-500" />
                  <span className="text-[9px] font-black text-amber-900 uppercase">
                    Auto-Sélection : {aeroResult.recommendedUnit.model}
                  </span>
                </div>
              )}
            </div>

            {/* Tab 1: Réseaux Défavorisés (The core user request!) */}
            {activeTab === 'AERAULIQUE' && (
              <div className="flex-1 p-8 overflow-y-auto space-y-6 custom-scrollbar">
                
                {/* Introduction Banner */}
                <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5 flex items-start gap-4">
                  <div className="p-2.5 bg-blue-600 text-white rounded-2xl">
                    <Activity size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-blue-950 uppercase tracking-tight">
                      Calcul Aéraulique des Deux Branches Principales
                    </h4>
                    <p className="text-[10px] text-blue-700 font-bold mt-0.5 leading-relaxed">
                      La centrale double flux doit être sélectionnée pour vaincre la perte de charge du circuit le plus résistant. 
                      Les deux branches (Soufflage d'air neuf et Extraction d'air vicié) sont calculées indépendamment en cumulant les pertes linéaires de conduits, raccords, plénums et bouches terminales.
                    </p>
                  </div>
                </div>

                {/* The 2 Unfavorable Branches Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Branch 1: Soufflage */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-3.5 h-3.5 rounded-full bg-blue-600" />
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase">Branche Amenée d'Air & Soufflage</h4>
                          <span className="text-[9px] font-bold text-slate-400">Prise d'air extérieur ➔ KWL ➔ Bouche la plus éloignée</span>
                        </div>
                      </div>
                      <span className="text-2xl font-black text-blue-600">
                        {aeroResult.supplyBranch.totalPressureDrop} <small className="text-xs text-slate-400">Pa</small>
                      </span>
                    </div>

                    {/* Most Unfavorable Vent Highlight */}
                    {aeroResult.supplyBranch.unfavorableVent && (
                      <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[8.5px] font-black uppercase text-blue-800 tracking-wider">
                            Bouche la plus défavorisée (Point critique)
                          </span>
                          <span className="text-[8.5px] font-bold text-blue-600">
                            {aeroResult.supplyBranch.unfavorableVent.flowRate} m³/h
                          </span>
                        </div>
                        <p className="text-base font-black text-slate-900 uppercase">
                          {aeroResult.supplyBranch.unfavorableVent.roomName}
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-[8px] font-bold text-slate-500 pt-1 border-t border-blue-100">
                          <div>Longueur: <strong className="text-slate-900">{aeroResult.supplyBranch.unfavorableVent.ductLength} m</strong></div>
                          <div>Gaines: <strong className="text-slate-900">{aeroResult.supplyBranch.unfavorableVent.ductsCount}x DN75</strong></div>
                          <div>Perte terminale: <strong className="text-blue-700">{aeroResult.supplyBranch.unfavorableVent.ductPressureDrop + aeroResult.supplyBranch.unfavorableVent.terminalPressureDrop} Pa</strong></div>
                        </div>
                      </div>
                    )}

                    {/* Detailed Breakdown Table */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Décomposition des pertes :</p>
                      <div className="divide-y divide-slate-100 text-[10px] font-bold">
                        {aeroResult.supplyBranch.components.map((comp, i) => (
                          <div key={i} className="py-2 flex items-center justify-between text-slate-700">
                            <span className="text-slate-600">{comp.label}</span>
                            <span className="font-mono font-black text-slate-900">{comp.value.toFixed(1)} Pa</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Branch 2: Reprise & Rejet */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-3.5 h-3.5 rounded-full bg-red-600" />
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase">Branche Reprise & Rejet d'Air</h4>
                          <span className="text-[9px] font-bold text-slate-400">Bouche la plus éloignée ➔ KWL ➔ Sortie de toit/mur</span>
                        </div>
                      </div>
                      <span className="text-2xl font-black text-red-600">
                        {aeroResult.extractBranch.totalPressureDrop} <small className="text-xs text-slate-400">Pa</small>
                      </span>
                    </div>

                    {/* Most Unfavorable Vent Highlight */}
                    {aeroResult.extractBranch.unfavorableVent && (
                      <div className="bg-red-50/60 border border-red-100 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[8.5px] font-black uppercase text-red-800 tracking-wider">
                            Bouche la plus défavorisée (Point critique)
                          </span>
                          <span className="text-[8.5px] font-bold text-red-600">
                            {aeroResult.extractBranch.unfavorableVent.flowRate} m³/h
                          </span>
                        </div>
                        <p className="text-base font-black text-slate-900 uppercase">
                          {aeroResult.extractBranch.unfavorableVent.roomName}
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-[8px] font-bold text-slate-500 pt-1 border-t border-red-100">
                          <div>Longueur: <strong className="text-slate-900">{aeroResult.extractBranch.unfavorableVent.ductLength} m</strong></div>
                          <div>Gaines: <strong className="text-slate-900">{aeroResult.extractBranch.unfavorableVent.ductsCount}x DN75</strong></div>
                          <div>Perte terminale: <strong className="text-red-700">{aeroResult.extractBranch.unfavorableVent.ductPressureDrop + aeroResult.extractBranch.unfavorableVent.terminalPressureDrop} Pa</strong></div>
                        </div>
                      </div>
                    )}

                    {/* Detailed Breakdown Table */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Décomposition des pertes :</p>
                      <div className="divide-y divide-slate-100 text-[10px] font-bold">
                        {aeroResult.extractBranch.components.map((comp, i) => (
                          <div key={i} className="py-2 flex items-center justify-between text-slate-700">
                            <span className="text-slate-600">{comp.label}</span>
                            <span className="font-mono font-black text-slate-900">{comp.value.toFixed(1)} Pa</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operating Point Verification Banner */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                  <div>
                    <span className="text-[9px] font-black uppercase text-red-400 tracking-widest">Dimensionnement Global</span>
                    <h4 className="text-xl font-black uppercase tracking-tight mt-1">
                      Pression Dimensionnante Retenue : <span className="text-amber-400">{aeroResult.systemPressure.toFixed(1)} Pa</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                      {aeroResult.supplyBranch.totalPressureDrop >= aeroResult.extractBranch.totalPressureDrop
                        ? 'Le réseau d\'amenée d\'air et de soufflage est le plus résistant.'
                        : 'Le réseau de reprise et de rejet d\'air vicié est le plus résistant.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveTab('COURBE')}
                      className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                    >
                      <BarChart2 size={15} /> Voir la courbe
                    </button>
                    <button
                      onClick={() => setActiveTab('CATALOGUE')}
                      className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-red-500/25 flex items-center gap-2"
                    >
                      Voir les centrales compatibles <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Courbe & Point de Fonctionnement */}
            {activeTab === 'COURBE' && (
              <div className="flex-1 p-8 overflow-y-auto space-y-6 custom-scrollbar">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <BarChart2 className="text-red-600" size={20} />
                      <div>
                        <h4 className="text-base font-black text-slate-900 uppercase">
                          Courbe Aéraulique : {previewUnit.model}
                        </h4>
                        <span className="text-[9px] font-bold text-slate-400">
                          {previewUnit.type} • {previewUnit.exchangerType} • Rendement {previewUnit.efficiency}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-slate-400">Point calculé</span>
                      <p className="text-base font-black text-slate-900">
                        {aeroResult.projectFlow} m³/h @ {aeroResult.systemPressure.toFixed(0)} Pa
                      </p>
                    </div>
                  </div>

                  <Chart unit={previewUnit} />
                </div>
              </div>
            )}

            {/* Tab 3: Catalogue Complet KWL */}
            {activeTab === 'CATALOGUE' && (
              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500">
                      Modèles Helios disponibles ({filteredUnits.length} affichés / {HELIOS_UNITS.length} au catalogue)
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 italic">
                      Cliquez sur "Prévisualiser" pour afficher la courbe aéraulique correspondante
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 border-b border-slate-100 text-[9px] font-black uppercase text-slate-400">
                        <tr>
                          <th className="px-6 py-3.5">Modèle KWL</th>
                          <th className="px-3 py-3.5">Type</th>
                          <th className="px-3 py-3.5">Échangeur</th>
                          <th className="px-3 py-3.5">Qmax</th>
                          <th className="px-3 py-3.5">Pmax</th>
                          <th className="px-3 py-3.5">Classe</th>
                          <th className="px-3 py-3.5">PassivHaus</th>
                          <th className="px-3 py-3.5 text-center">Compatibilité</th>
                          <th className="px-6 py-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {filteredUnits.map(unit => {
                          const compatible = isUnitCompatible(unit);
                          const isSelected = unit.model === selectedModel;
                          const isPreviewed = unit.model === previewModel;

                          return (
                            <tr 
                              key={unit.model} 
                              className={`hover:bg-slate-50/60 transition-colors ${
                                isPreviewed ? 'bg-red-50/30' : ''
                              }`}
                            >
                              <td className="px-6 py-3.5 flex items-center gap-2">
                                <span className="font-black text-slate-900">{unit.model}</span>
                                {isSelected && (
                                  <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">
                                    Installée
                                  </span>
                                )}
                                {aeroResult.recommendedUnit?.model === unit.model && (
                                  <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                                    <Sparkles size={10} /> Idéal
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3.5 text-slate-500 text-[10px]">
                                <span className={`px-2 py-0.5 rounded-md ${
                                  unit.type === 'Mural' ? 'bg-slate-100 text-slate-700' :
                                  unit.type === 'Plafonnier' ? 'bg-blue-50 text-blue-700' :
                                  unit.type === 'Sol' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {unit.type}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-[10px]">
                                {unit.exchangerType === 'Enthalpique' ? (
                                  <span className="text-purple-700 font-black flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                    <Droplets size={10} /> Enthalpique ET
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-medium">Standard</span>
                                )}
                              </td>
                              <td className="px-3 py-3.5 text-slate-900 font-mono text-[11px]">{unit.maxFlow} m³/h</td>
                              <td className="px-3 py-3.5 text-slate-900 font-mono text-[11px]">{unit.maxPressure} Pa</td>
                              <td className="px-3 py-3.5">
                                <span className={`px-2 py-0.5 rounded-md font-black text-[9px] ${
                                  unit.class === 'A+' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {unit.class}
                                </span>
                              </td>
                              <td className="px-3 py-3.5">
                                {unit.passiveHouse ? (
                                  <span className="text-green-600 font-black text-[9px] flex items-center gap-1">
                                    <Check size={12} /> PHI
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3.5 text-center">
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase ${
                                  compatible ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                                }`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${compatible ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                  {compatible ? 'Compatible' : 'Insuffisant'}
                                </div>
                              </td>
                              <td className="px-6 py-3.5 text-right space-x-2">
                                <button
                                  onClick={() => {
                                    setPreviewModel(unit.model);
                                    setActiveTab('COURBE');
                                  }}
                                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-black uppercase rounded-lg transition-all"
                                >
                                  Courbe
                                </button>
                                <button
                                  onClick={() => onSelect(unit.model)}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase rounded-lg transition-all shadow-sm"
                                >
                                  Choisir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitSelector;
