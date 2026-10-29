import React from 'react';
import { Project, VentType } from '../types';
import { calculateCoilCuttingPlan, CoilCuttingPlanResult, CoilAssignment } from '../utils/coilCutting';
import { Scissors, AlertCircle, CheckCircle2, Layers, Disc, ArrowRight, ShieldCheck, Ruler } from 'lucide-react';

interface CoilCuttingViewProps {
  project: Project;
  isPrintMode?: boolean;
}

export const CoilCuttingView: React.FC<CoilCuttingViewProps> = ({ project, isPrintMode = false }) => {
  const plan: CoilCuttingPlanResult = calculateCoilCuttingPlan(project);

  return (
    <div className="space-y-6">
      {/* KPI Banners */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[9px] font-black uppercase">Couronnes de 50m</span>
            <Disc size={15} className="text-red-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{plan.totalCoilsRequired} <span className="text-xs text-slate-400 font-bold">couronne(s)</span></div>
          <p className="text-[9px] font-bold text-slate-500 mt-0.5">Capacité : {plan.totalCoilsRequired * 50} m</p>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[9px] font-black uppercase">Linéaire Utilisé</span>
            <Ruler size={15} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600">{plan.totalDuctsM} <span className="text-xs text-slate-400 font-bold">m</span></div>
          <p className="text-[9px] font-bold text-slate-500 mt-0.5">{plan.coils.flatMap(c => c.segments).length} tronçons coupés</p>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[9px] font-black uppercase">Chutes Estimées</span>
            <Scissors size={15} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{plan.totalWasteM} <span className="text-xs text-slate-400 font-bold">m</span></div>
          <p className="text-[9px] font-bold text-slate-500 mt-0.5">{100 - plan.overallEfficiencyPercent}% de chutes résiduelles</p>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[9px] font-black uppercase">Efficacité Découpe</span>
            <ShieldCheck size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{plan.overallEfficiencyPercent} %</div>
          <p className="text-[9px] font-bold text-emerald-700 mt-0.5">Calpinage optimisé Best-Fit</p>
        </div>
      </div>

      {/* Visual Coil Cutting Bars (Plan de Calpinage par Couronne) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Scissors size={14} className="text-red-600" />
            <span>Plan de Coupe Couronne par Couronne (Couronnes de 50m)</span>
          </h4>
          <span className="text-[9px] font-bold text-slate-400 uppercase">
            Coupez les tronçons dans cet ordre pour minimiser les chutes
          </span>
        </div>

        <div className="space-y-3">
          {plan.coils.map((coil) => (
            <div key={coil.coilIndex} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-black">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                    {coil.coilIndex}
                  </span>
                  <span className="text-slate-900 uppercase">Couronne #{coil.coilIndex} (50 m)</span>
                  <span className="text-[10px] text-slate-400 font-bold">• Utilisé : {coil.usedLength} m / 50 m</span>
                </div>
                <div className="text-[10px] font-black">
                  {coil.wasteLength > 0 ? (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Chute restante : {coil.wasteLength} m ({coil.wastePercent}%)
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Couronne 100% exploitée
                    </span>
                  )}
                </div>
              </div>

              {/* Graphical Proportionate Bar */}
              <div className="h-9 w-full bg-slate-100 rounded-xl overflow-hidden flex p-1 gap-1 border border-slate-200/80">
                {coil.segments.map((seg, sIdx) => {
                  const widthPercent = (seg.length / 50) * 100;
                  const isSoufflage = seg.type === VentType.SOUFFLAGE;
                  return (
                    <div 
                      key={sIdx}
                      style={{ width: `${widthPercent}%` }}
                      className={`h-full rounded-lg px-2 flex items-center justify-between text-[9px] font-black text-white truncate shadow-sm transition-all ${
                        isSoufflage ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                      }`}
                      title={`${seg.roomName} (${isSoufflage ? 'Soufflage' : 'Reprise'}) : ${seg.length} m [De ${seg.cutStart}m à ${seg.cutEnd}m]`}
                    >
                      <span className="truncate">{seg.roomName}</span>
                      <span className="shrink-0 ml-1 opacity-90">{seg.length}m</span>
                    </div>
                  );
                })}

                {/* Remaining Scrap / Chute */}
                {coil.wasteLength > 0 && (
                  <div 
                    style={{ width: `${(coil.wasteLength / 50) * 100}%` }}
                    className="h-full rounded-lg bg-slate-200/80 border border-dashed border-slate-400 px-2 flex items-center justify-center text-[8px] font-bold text-slate-600 truncate"
                    title={`Chute : ${coil.wasteLength} m`}
                  >
                    <span>Reste {coil.wasteLength}m</span>
                  </div>
                )}
              </div>

              {/* Segment breakdown list for this coil */}
              <div className="flex flex-wrap gap-2 pt-1">
                {coil.segments.map((seg, sIdx) => (
                  <span 
                    key={sIdx}
                    className="text-[9.5px] font-bold px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 flex items-center gap-1.5"
                  >
                    <span className={`w-2 h-2 rounded-full ${seg.type === VentType.SOUFFLAGE ? 'bg-blue-500' : 'bg-red-500'}`} />
                    <strong className="text-slate-900">{seg.roomName}</strong>
                    <span className="text-slate-400 font-normal">({seg.cutStart}m → {seg.cutEnd}m)</span>
                    <span className="font-black text-slate-900">{seg.length} m</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plenum Connection & Balancing Schedule (Matrice de raccordement aux plénums & Bagues) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Layers size={14} className="text-blue-600" />
            <span>Matrice de Raccordement aux Piquages Plénums & Bagues d'Équilibrage</span>
          </h4>
          <span className="text-[9px] font-bold text-slate-400 uppercase">
            Réglages à insérer aux piquages des plénums FRS-VK
          </span>
        </div>

        <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase text-slate-600">
                <th className="py-2.5 px-3">Piquage #</th>
                <th className="py-2.5 px-3">Plénum</th>
                <th className="py-2.5 px-3">Pièce Desservie</th>
                <th className="py-2.5 px-3">Flux</th>
                <th className="py-2.5 px-3 text-right">Longueur Conduit</th>
                <th className="py-2.5 px-3 text-right">Débit Branche</th>
                <th className="py-2.5 px-3">Bague de Réglage Aéraulique (FRS-DR)</th>
                <th className="py-2.5 px-3">Cran de Diaphragme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.plenumSchedule.map((item, idx) => {
                const isSoufflage = item.plenumType === VentType.SOUFFLAGE;
                return (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-black text-slate-400 text-[10px]">#{item.portNumber}</td>
                    <td className="py-2 px-3 font-bold text-slate-700 text-[11px]">
                      {isSoufflage ? 'Plénum Soufflage' : 'Plénum Reprise'}
                    </td>
                    <td className="py-2 px-3 font-black text-slate-900 uppercase text-[11px]">{item.roomName}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        isSoufflage ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isSoufflage ? 'bg-blue-600' : 'bg-red-600'}`} />
                        {isSoufflage ? 'Soufflage' : 'Reprise'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">{item.ductLength} m</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-700">{item.flowRate} m³/h</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-black ${
                        item.recommendedRestrictorRing.includes('Aucune') 
                          ? 'bg-slate-100 text-slate-600' 
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {item.recommendedRestrictorRing}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[10px] font-bold text-slate-600">{item.diaphragmCran}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
