
import React from 'react';
import { Project, VentType, RoomType } from '../types';
import { DTU_FLOW_RATES } from '../constants';
import { Trash2, AlertTriangle, CheckCircle2, Wind, Plus, Minus, Sparkles, Zap, Check } from 'lucide-react';

interface RightSidebarProps {
  project: Project;
  updateVentFlow: (id: string, flow: number) => void;
  deleteVent: (id: string) => void;
  deleteElement?: (type: string | null, id: string) => void;
  selectedId?: string | null;
  setSelectedId?: (id: string | null) => void;
  onAutoRoute?: (targetVentId?: string) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ project, updateVentFlow, deleteVent, deleteElement, selectedId, setSelectedId, onAutoRoute }) => {
  const totalSupply = project.vents.filter(v => v.type === VentType.SOUFFLAGE).reduce((acc, v) => acc + v.flowRate, 0);
  const totalExtract = project.vents.filter(v => v.type === VentType.REPRISE).reduce((acc, v) => acc + v.flowRate, 0);
  
  const houseMin = DTU_FLOW_RATES[project.houseType]?.TOTAL_MIN || 0;
  const isConform = totalExtract >= houseMin;
  const unconnectedVents = project.vents.filter(v => !v.connected);

  const allConnections = project.plenums.flatMap(p => 
    p.connections.map(c => {
      const vent = project.vents.find(v => v.id === c.ventId);
      const shaft = project.shafts?.find(s => s.id === c.shaftId);
      const isReprise = vent?.type === VentType.REPRISE || p.type === VentType.REPRISE;
      return {
        ...c,
        plenumId: p.id,
        vent,
        shaft,
        isReprise
      };
    })
  );

  return (
    <div className="w-96 bg-white border-l flex flex-col z-50 shadow-xl overflow-hidden">
      <div className="p-6 border-b bg-slate-50/30">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-black text-slate-900 tracking-tight italic uppercase">Bilan Projet</h2>
          <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{project.houseType}</div>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Équilibre & Conformité Arrêté 1982</p>
      </div>

      <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
        {/* Conformity Status Card */}
        <div className={`p-5 rounded-[2rem] border-2 flex items-start gap-4 transition-all ${isConform ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700 shadow-[0_10px_20px_-10px_rgba(220,38,38,0.1)]'}`}>
          {isConform ? <CheckCircle2 className="mt-1" size={24}/> : <AlertTriangle className="mt-1" size={24}/>}
          <div>
            <p className="text-sm font-black uppercase tracking-tight">{isConform ? 'Règlementation OK' : 'Débit Insuffisant'}</p>
            <p className="text-[10px] font-bold opacity-80 uppercase leading-tight mt-1">
              {isConform ? 'Le seuil minimal est atteint.' : `Il manque ${houseMin - totalExtract} m3/h pour un ${project.houseType}.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-5 rounded-[2rem] text-white shadow-xl shadow-slate-200">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Extraction</p>
            <p className="text-3xl font-black italic">{totalExtract} <small className="text-[10px] font-sans opacity-50 not-italic">m3/h</small></p>
            <div className="w-full bg-white/10 h-1 rounded-full mt-3 overflow-hidden">
              <div className="bg-red-600 h-full transition-all" style={{ width: `${Math.min(100, (totalExtract/houseMin)*100)}%` }} />
            </div>
          </div>
          <div className="bg-white border border-slate-100 p-5 rounded-[2rem] text-slate-900 shadow-sm">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Insufflation</p>
            <p className="text-3xl font-black italic">{totalSupply} <small className="text-[10px] font-sans opacity-50 not-italic">m3/h</small></p>
            <div className="w-full bg-slate-100 h-1 rounded-full mt-3 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all" style={{ width: `${Math.min(100, (totalSupply/totalExtract || 1)*100)}%` }} />
            </div>
          </div>
        </div>

        {/* SECTION: CONDUITS FLEXPIPE */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Liaisons FlexPipe 75 ({allConnections.length})
            </h3>
            <span className="text-[8px] font-bold text-slate-400">Clic pour modifier/supprimer</span>
          </div>

          {/* Auto-raccordement Quick Action Card */}
          {unconnectedVents.length > 0 && (
            <div className="p-4 bg-gradient-to-br from-blue-50 via-indigo-50/70 to-slate-50 border-2 border-blue-200/80 rounded-2xl space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-blue-950">Auto-Raccordement</span>
                </div>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-sm">
                  {unconnectedVents.length} en attente
                </span>
              </div>
              <p className="text-[8px] font-bold text-slate-500 leading-tight">
                Raccordement automatique intelligent selon le débit (m³/h) et le flux (soufflage/reprise) avec passage trémie si étage.
              </p>
              <button
                onClick={() => onAutoRoute?.()}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                <Zap size={13} className="text-amber-300" />
                <span>Raccorder les {unconnectedVents.length} bouches</span>
              </button>
            </div>
          )}

          {allConnections.length > 0 ? (
            <div className="space-y-2">
              {allConnections.map((conn, idx) => {
                const connId = conn.id || conn.ventId;
                const isSelected = selectedId === connId || selectedId === conn.ventId;
                return (
                  <div 
                    key={connId || idx}
                    onClick={() => setSelectedId?.(connId)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected 
                        ? 'border-amber-500 bg-amber-50/50 shadow-md ring-2 ring-amber-400/20' 
                        : 'border-slate-100 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${conn.isReprise ? 'bg-red-600' : 'bg-blue-600'}`} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase text-slate-900">
                            {conn.vent?.roomId || 'Bouche'}
                          </span>
                          <span className={`text-[8px] font-black px-1.5 py-0.2 rounded ${conn.isReprise ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {conn.isReprise ? 'Reprise' : 'Soufflage'}
                          </span>
                        </div>
                        <div className="text-[8px] font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                          <span>{conn.ductsCount}x DN75</span>
                          <span>•</span>
                          <span>{conn.length} m</span>
                          {conn.shaft && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 font-black">Via {conn.shaft.name} (RDC ⇄ R+1)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement?.(null, connId);
                      }}
                      className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Supprimer ce tracé FlexPipe"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Aucun tracé FlexPipe relié</p>
            </div>
          )}
        </div>

        {/* SECTION: TRÉMIES TECHNIQUES */}
        {(project.shafts && project.shafts.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Trémies Inter-Étages ({project.shafts.length})
              </h3>
            </div>
            <div className="space-y-2">
              {project.shafts.map(shaft => {
                const connsPassing = allConnections.filter(c => c.shaftId === shaft.id).length;
                return (
                  <div 
                    key={shaft.id}
                    onClick={() => setSelectedId?.(shaft.id)}
                    className="p-3 bg-amber-50/40 border border-amber-200/60 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-amber-50 transition-all"
                  >
                    <div>
                      <div className="text-[10px] font-black text-slate-900 uppercase flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-amber-500" />
                        {shaft.name}
                        <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">RDC ⇄ Étage 1</span>
                      </div>
                      <p className="text-[8px] font-bold text-slate-500 mt-0.5">
                        {connsPassing > 0 ? `${connsPassing} liaison(s) en transit` : 'Prêt pour raccordement'}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement?.(null, shaft.id);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Supprimer cette trémie"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION: NOMENCLATURE TERMINAUX */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomenclature Terminaux</h3>
            <span className="text-[9px] font-bold text-slate-300">{project.vents.length} Bouche(s)</span>
          </div>
          
          {project.vents.map(v => (
            <div key={v.id} className="group bg-white border border-slate-100 rounded-3xl p-5 hover:border-red-600 hover:shadow-xl hover:shadow-slate-100 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${v.type === VentType.REPRISE ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                    <Wind size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase text-slate-900 leading-none">{v.roomId}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{v.type === VentType.REPRISE ? 'Extraction' : 'Soufflage'}</span>
                      <span className="text-slate-300">•</span>
                      {v.connected ? (
                        <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Check size={9} /> Raccordé
                        </span>
                      ) : (
                        <button
                          onClick={() => onAutoRoute?.(v.id)}
                          className="text-[8px] font-black text-amber-700 bg-amber-100/70 hover:bg-blue-600 hover:text-white px-2 py-0.5 rounded transition-all flex items-center gap-1 shadow-sm"
                          title="Raccorder automatiquement cette bouche au plénum adéquat"
                        >
                          <Zap size={9} /> Raccorder
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => deleteVent(v.id)} className="p-2 text-slate-200 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                  <Trash2 size={16}/>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-slate-50 rounded-2xl p-1">
                  <button onClick={() => updateVentFlow(v.id, Math.max(0, v.flowRate - 15))} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-red-600 transition-all"><Minus size={14}/></button>
                  <input 
                    type="number" 
                    value={v.flowRate} 
                    onChange={(e) => updateVentFlow(v.id, parseInt(e.target.value) || 0)}
                    className="w-12 bg-transparent text-center text-sm font-black focus:outline-none"
                  />
                  <button onClick={() => updateVentFlow(v.id, v.flowRate + 15)} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-red-600 transition-all"><Plus size={14}/></button>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-900 uppercase italic leading-none">{v.ductsCount} FlexPipe 75</p>
                  <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-1">Conduit Semi-rigide</p>
                </div>
              </div>
            </div>
          ))}
          
          {project.vents.length === 0 && (
            <div className="py-20 text-center bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100">
              <Wind className="mx-auto text-slate-200 mb-4 animate-pulse" size={48}/>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest px-10">Aucun terminal implanté sur le plan</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RightSidebar;
