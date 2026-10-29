import React from 'react';
import { Project } from '../types';
import { 
  Wind, Box, FileText, Target, Settings2, Zap, ArrowUpRight, Grid, HomeIcon, 
  MousePointer2, Ruler, Trash2, Layers, Home, CornerDownRight, Sliders, Activity, 
  Sparkles, DollarSign, Scissors, Save
} from 'lucide-react';

interface SidebarProps {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  tool: string;
  setTool: (tool: any) => void;
  setMode: (mode: 'DESIGN' | 'REPORT') => void;
  onPlanUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenUnitSelector?: () => void;
  onAutoRoute?: () => void;
  onOpenQuoteHubSpot?: () => void;
  onOpenCutting?: () => void;
  onExportProjectFile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  project, 
  setProject, 
  tool, 
  setTool, 
  setMode, 
  onOpenUnitSelector, 
  onAutoRoute,
  onOpenQuoteHubSpot,
  onOpenCutting,
  onExportProjectFile
}) => {
  const ActionButton = ({ id, icon, label, active, color = "default", shortcut }: any) => {
    const colorClasses: any = {
      default: active ? "bg-slate-950 text-white border-slate-950 shadow-xl" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50",
      red: active ? "bg-red-600 text-white border-red-600 shadow-xl" : "bg-white border-slate-100 text-slate-500 hover:text-red-600",
      blue: active ? "bg-blue-600 text-white border-blue-600 shadow-xl" : "bg-white border-slate-100 text-slate-500 hover:text-blue-600",
      amber: active ? "bg-amber-500 text-white border-amber-500 shadow-xl" : "bg-white border-slate-100 text-slate-500 hover:text-amber-500",
    };

    return (
      <button 
        onClick={() => setTool(id)} 
        className={`group relative w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-300 text-[10px] font-black uppercase tracking-tight ${colorClasses[color]}`}
      >
        <span className={`${active ? "text-white" : "text-slate-300 group-hover:scale-110"} transition-all`}>{icon}</span>
        {label}
        {shortcut && <span className="ml-auto text-[8px] opacity-30 font-sans">{shortcut}</span>}
      </button>
    );
  };

  const houseTypes: Project['houseType'][] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6+'];

  return (
    <div className="w-80 bg-white border-r border-slate-100 flex flex-col z-50 shadow-2xl">
      <div className="p-8 border-b border-slate-50 bg-slate-50/30">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-100">
             <Wind size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">VentiPro</h1>
        </div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Systèmes Habitat Helios</p>
      </div>

      <div className="p-6 flex-1 space-y-8 overflow-y-auto custom-scrollbar">
        
        {/* TYPOLOGIE LOGEMENT */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Typologie Logement</p>
            <Home size={12} className="text-slate-300" />
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-2xl">
            {houseTypes.map(t => (
              <button
                key={t}
                onClick={() => setProject(prev => ({ ...prev, houseType: t }))}
                className={`py-2.5 rounded-xl text-[10px] font-black transition-all ${project.houseType === t ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Outils Navigation</p>
          <div className="grid grid-cols-1 gap-2">
            <ActionButton id="SELECT" label="Sélectionner" icon={<MousePointer2 size={18}/>} active={tool === 'SELECT'} shortcut="V" />
            <ActionButton id="CALIBRATE" label="Mise à l'échelle" icon={<Ruler size={18}/>} active={tool === 'CALIBRATE'} color="amber" shortcut="S" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Implantation KWL</p>
            {project.unit?.model && (
              <span className="text-[8px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-100 truncate max-w-[120px]">
                {project.unit.model.replace('Helios ', '')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <ActionButton id="UNIT" label="Centrale Helios" icon={<Settings2 size={18}/>} active={tool === 'UNIT'} />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton id="PLENUM_SOUF" color="blue" label="Plénum Souf." icon={<Box size={18}/>} active={tool === 'PLENUM_SOUF'} />
              <ActionButton id="PLENUM_REPR" color="red" label="Plénum Repr." icon={<Box size={18}/>} active={tool === 'PLENUM_REPR'} />
            </div>
            <ActionButton id="TREMIE" color="amber" label="Trémie Inter-Étages" icon={<Layers size={18}/>} active={tool === 'TREMIE'} />
          </div>
          {onOpenUnitSelector && (
            <button
              onClick={onOpenUnitSelector}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-red-500/10 via-red-500/5 to-slate-50 hover:from-red-500/20 hover:to-white border border-red-200/80 rounded-2xl text-[10px] font-black text-red-700 transition-all uppercase tracking-tight group shadow-sm hover:shadow"
            >
              <div className="flex items-center gap-2.5">
                <Sliders size={16} className="text-red-600 group-hover:rotate-45 transition-transform" />
                <div className="text-left">
                  <div className="text-[9px] font-black text-slate-900 group-hover:text-red-600">Paramétrage & Courbe KWL</div>
                  <div className="text-[8px] font-bold text-slate-400">Réseaux défavorisés & point Q/ΔP</div>
                </div>
              </div>
              <Activity size={14} className="text-red-500" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Terminaux & Réseaux</p>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton id="VENT_SOUF" color="blue" label="Soufflage" icon={<Layers size={18}/>} active={tool === 'VENT_SOUF'} />
            <ActionButton id="VENT_EXTR" color="red" label="Reprise" icon={<Layers size={18}/>} active={tool === 'VENT_EXTR'} />
            <ActionButton id="IP-FKB" label="Sortie Mur" icon={<Grid size={18}/>} active={tool === 'IP-FKB'} />
            <ActionButton id="IP-DHS" label="Sortie Toit" icon={<HomeIcon size={18}/>} active={tool === 'IP-DHS'} />
          </div>
        </div>

        <div className="space-y-4 pb-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Tracés Liaisons</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" title="Soufflage Bleu" />
              <span className="w-2 h-2 rounded-full bg-red-600" title="Reprise Rouge" />
            </div>
          </div>

          {/* Auto-Raccordement des Réseaux */}
          {onAutoRoute && (
            <button
              onClick={onAutoRoute}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              title="Raccorder automatiquement toutes les bouches aux plénums selon le débit et le flux"
            >
              <Sparkles size={16} className="text-amber-300 animate-pulse" />
              <span>Raccordement Automatique</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <ActionButton id="AIR_NEUF" label="Air Neuf" icon={<ArrowUpRight size={16} className="text-cyan-500"/>} active={tool === 'AIR_NEUF'} />
            <ActionButton id="AIR_REJETE" label="Rejet" icon={<ArrowUpRight size={16} className="text-orange-500"/>} active={tool === 'AIR_REJETE'} />
            <ActionButton id="SOUFFLAGE_PPAL" label="Soufflage KWL" icon={<ArrowUpRight size={16} className="text-blue-500"/>} active={tool === 'SOUFFLAGE_PPAL'} />
            <ActionButton id="REPRISE_PPAL" label="Reprise KWL" icon={<ArrowUpRight size={16} className="text-red-500"/>} active={tool === 'REPRISE_PPAL'} />
          </div>
          <ActionButton id="CONNECT" label="Liaison FlexPipe Manuelle" icon={<Zap size={18} className="text-amber-500"/>} active={tool === 'CONNECT'} shortcut="C" />
          
          {/* Guide Réseau Flexpipe */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase text-slate-700">Code Réseau FlexPipe</span>
              <span className="text-[8px] font-bold text-slate-400">Helios FRS 75</span>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-bold">
              <div className="flex items-center gap-1.5 text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                <span>Soufflage</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-red-200" />
                <span>Reprise</span>
              </div>
            </div>
            <p className="text-[8px] text-slate-400 leading-tight">
              • Clic sur un conduit pour le sélectionner et le supprimer (<kbd className="px-1 py-0.2 bg-white border rounded text-[7px]">Suppr</kbd>)<br/>
              • Passez par une <strong>Trémie</strong> pour relier les conduits au R+1
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white border-t border-slate-100 space-y-3">
        {/* Quick Links: Devis & HubSpot + Calpinage */}
        <div className="grid grid-cols-2 gap-2">
          {onOpenQuoteHubSpot && (
            <button
              onClick={onOpenQuoteHubSpot}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-800 text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
              title="Chiffrage et intégration API HubSpot Deals CRM"
            >
              <DollarSign size={13} className="text-red-600" />
              <span>Devis & CRM</span>
            </button>
          )}

          {onOpenCutting && (
            <button
              onClick={onOpenCutting}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-800 text-[9px] font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
              title="Plan de calpinage et de coupe des couronnes de 50 m"
            >
              <Scissors size={13} className="text-amber-500" />
              <span>Pose 50m</span>
            </button>
          )}
        </div>

        <button onClick={() => setMode('REPORT')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-red-600 transition-all flex items-center justify-center gap-3 active:scale-95">
          <FileText size={18} className="text-red-500" /> Dossier Technique (8 pages)
        </button>
      </div>
    </div>
  );
}
export default Sidebar;
