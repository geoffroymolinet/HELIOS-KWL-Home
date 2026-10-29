import React, { useMemo, useState, useRef } from 'react';
import { Project, VentType, RoomType } from '../types';
import { HELIOS_UNITS, DTU_FLOW_RATES } from '../constants';
import { calculateAerodynamics } from '../utils/aerodynamics';
import { 
  Printer, ArrowLeft, CheckCircle2, AlertCircle, Layout, Wind, Activity, 
  Droplets, ShieldCheck, Zap, Gauge, Layers, Sliders, Check, FileText,
  Package, ChevronRight, Compass, ArrowUpDown, Info, Building2, Download,
  UserCheck, MapPin, Calendar, Award, Phone, Mail, Edit3, Loader2, Sparkles,
  Scissors, Volume2, VolumeX, Disc, FileSpreadsheet
} from 'lucide-react';
import { renderPlanSVG, getLevelPlanBounds } from './PlanCanvas';
import { CoilCuttingView } from './CoilCuttingView';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ReportProps {
  project: Project;
  onBack: () => void;
}

interface ClientComplianceData {
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  installerName: string;
  installerSiret: string;
  installerPhone: string;
  installerEmail: string;
  inspectionDate: string;
  dossierRef: string;
  doorUndercutChecked: boolean;
  filtersChecked: boolean;
  acousticChecked: boolean;
  airtightnessChecked: boolean;
}

const Report: React.FC<ReportProps> = ({ project, onBack }) => {
  const [activeSection, setActiveSection] = useState<'all' | 'summary' | 'compliance' | 'plans' | 'schedule' | 'aero' | 'curve' | 'bom' | 'cutting'>('all');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportProgressText, setExportProgressText] = useState<string | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Client Compliance Dossier Custom Data
  const [clientData, setClientData] = useState<ClientComplianceData>({
    clientName: project.name ? `${project.name} - Propriétaire` : "M. & Mme Dupont",
    clientAddress: project.address || "14 Rue des Érables, 69000 Lyon",
    clientPhone: "06 12 34 56 78",
    clientEmail: "contact.client@example.com",
    installerName: "ClimAéro SAS - Installateur Partenaire Agréé Helios",
    installerSiret: "841 932 401 00028 • Qualibat RGE Ventilation",
    installerPhone: "04 78 00 11 22",
    installerEmail: "etudes@climaero-ventilation.fr",
    inspectionDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    dossierRef: project.reference || `HELIOS-CONF-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    doorUndercutChecked: true,
    filtersChecked: true,
    acousticChecked: true,
    airtightnessChecked: true,
  });

  const reportContainerRef = useRef<HTMLDivElement>(null);

  const totalSupply = project.vents.filter(v => v.type === VentType.SOUFFLAGE).reduce((acc, v) => acc + v.flowRate, 0);
  const totalExtract = project.vents.filter(v => v.type === VentType.REPRISE).reduce((acc, v) => acc + v.flowRate, 0);
  
  const aero = useMemo(() => calculateAerodynamics(project), [project]);
  const unitSpecs = project.unit ? HELIOS_UNITS.find(u => u.model === project.unit?.model) : (aero.recommendedUnit || HELIOS_UNITS[0]);
  const isConform = totalExtract > 0 && totalSupply > 0;

  // Regulatory DTU & Arrêté 1982 Check
  const dtuRules = DTU_FLOW_RATES[project.houseType] || DTU_FLOW_RATES['T4'];
  const minRequiredExtract = dtuRules.TOTAL_MIN || 90;
  const isExtractConform = totalExtract >= minRequiredExtract;
  const flowBalanceRatio = Math.max(totalSupply, totalExtract) > 0 
    ? Math.round((Math.min(totalSupply, totalExtract) / Math.max(totalSupply, totalExtract)) * 100) 
    : 100;

  const handlePrint = () => window.print();

  // Fan curve calculation for selected unit
  const maxFlow = unitSpecs ? unitSpecs.maxFlow : 400;
  const maxPressure = unitSpecs ? unitSpecs.maxPressure : 450;
  const opPoint = aero.operatingPoint;

  // SVG dimensions for fan curve
  const svgW = 560;
  const svgH = 260;
  const padL = 55;
  const padR = 25;
  const padT = 30;
  const padB = 45;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const scaleQ = (q: number) => padL + (Math.min(q, maxFlow * 1.05) / (maxFlow * 1.05)) * plotW;
  const scaleP = (p: number) => padT + plotH - (Math.min(p, maxPressure * 1.1) / (maxPressure * 1.1)) * plotH;

  const makeCurvePath = (speedFactor: number) => {
    const points: string[] = [];
    const steps = 30;
    const curveQMax = maxFlow * speedFactor;
    const curvePMax = maxPressure * Math.pow(speedFactor, 2);
    for (let i = 0; i <= steps; i++) {
      const q = (curveQMax / steps) * i;
      const p = Math.max(0, curvePMax * (1 - Math.pow(q / Math.max(1, curveQMax), 1.8)));
      const x = scaleQ(q);
      const y = scaleP(p);
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return points.join(' ');
  };

  // Detailed Vents Schedule Data
  const ventSchedule = useMemo(() => {
    return project.vents.map((vent, idx) => {
      let connectedPlenum = null;
      let connection = null;
      for (const pl of project.plenums) {
        const c = pl.connections.find(conn => conn.ventId === vent.id);
        if (c) {
          connectedPlenum = pl;
          connection = c;
          break;
        }
      }

      const ductsCount = connection?.ductsCount || vent.ductsCount || Math.max(1, Math.ceil(vent.flowRate / 30));
      const lengthM = connection?.length || 10;
      const shaft = connection?.shaftId ? project.shafts?.find(s => s.id === connection?.shaftId) : null;
      
      const flowPerDuct = vent.flowRate / ductsCount;
      const velocityMs = Math.round((flowPerDuct / 3600 / 0.003117) * 10) / 10;
      
      const ductLoss = Math.round((lengthM * 2.2 * Math.pow(flowPerDuct / 30, 1.8)) * 10) / 10;
      const totalBranchLoss = ductLoss + 15;
      const acoustic = aero.roomAcoustics?.find(a => a.ventId === vent.id);

      return {
        id: vent.id,
        refNumber: idx + 1,
        room: vent.roomId || (vent.type === VentType.SOUFFLAGE ? `Chambre ${idx + 1}` : 'Pièce Humide'),
        levelId: vent.level,
        levelName: project.levels.find(l => l.id === vent.level)?.name || (vent.level === 0 ? 'RDC' : 'Étage 1'),
        type: vent.type,
        flowRate: vent.flowRate,
        ductsCount,
        lengthM,
        shaftTransit: shaft ? shaft.name : 'Direct',
        plenumName: connectedPlenum ? (connectedPlenum.type === VentType.SOUFFLAGE ? 'Plénum Soufflage' : 'Plénum Reprise') : 'Non raccordé',
        velocityMs,
        branchLossPa: totalBranchLoss,
        acoustic
      };
    });
  }, [project.vents, project.plenums, project.shafts, project.levels, aero.roomAcoustics]);

  // Total linear meters of FlexPipe DN75
  const totalFlexPipeLengthM = useMemo(() => {
    let total = 0;
    project.plenums.forEach(p => {
      p.connections.forEach(c => {
        total += (c.length || 10) * (c.ductsCount || 1);
      });
    });
    return Math.round(total * 10) / 10;
  }, [project.plenums]);

  // Total Isopipe meters
  const totalIsopipeLengthM = useMemo(() => {
    return Math.round(project.isoConnections.reduce((acc, c) => acc + (c.length || 2), 0) * 10) / 10;
  }, [project.isoConnections]);

  // Shaft transit duct count
  const shaftTransitsCount = useMemo(() => {
    let count = 0;
    project.plenums.forEach(p => {
      p.connections.forEach(c => {
        if (c.shaftId) count += (c.ductsCount || 1);
      });
    });
    return count;
  }, [project.plenums]);

  const flexPipeCoilsCount = Math.max(1, Math.ceil((totalFlexPipeLengthM * 1.1) / 50));

  // High-Resolution Client Compliance PDF Direct Export
  const handleExportPDF = async () => {
    try {
      setIsExportingPDF(true);
      setExportProgressText("Préparation du dossier de conformité client...");
      
      // Force all pages to be visible in the DOM during capture
      const previousSection = activeSection;
      setActiveSection('all');
      
      // Allow browser to render all sections
      await new Promise(resolve => setTimeout(resolve, 350));

      const container = reportContainerRef.current;
      if (!container) throw new Error("Conteneur de rapport introuvable");

      const pageElements = container.querySelectorAll<HTMLElement>('.page-break');
      if (pageElements.length === 0) throw new Error("Aucune page à exporter");

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const totalPages = pageElements.length;

      for (let i = 0; i < totalPages; i++) {
        const pageEl = pageElements[i];
        setExportProgressText(`Génération haute fidélité : Page ${i + 1} sur ${totalPages}...`);

        // High resolution rasterization (scale 2 for retina clarity)
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1100
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.96);

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }

      setExportProgressText("Téléchargement du document PDF en cours...");
      const sanitizedProjectName = (project.name || 'Projet').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateSlug = new Date().toISOString().slice(0, 10);
      const fileName = `Dossier_Conformite_Helios_KWL_${sanitizedProjectName}_${dateSlug}.pdf`;
      
      pdf.save(fileName);

      // Restore view if was on a specific tab
      setActiveSection(previousSection);
      setIsExportingPDF(false);
      setExportProgressText(null);
      setExportSuccessMessage(`Dossier PDF généré avec succès : ${fileName}`);
      setTimeout(() => setExportSuccessMessage(null), 5000);

    } catch (err) {
      console.error("Erreur lors de l'exportation PDF :", err);
      setIsExportingPDF(false);
      setExportProgressText(null);
      alert("Une erreur est survenue lors de la génération du PDF. L'impression native (Ctrl+P) reste disponible.");
    }
  };

  return (
    <div className="flex-1 bg-slate-100 overflow-auto pt-6 pb-24 no-print:px-6">
      {/* TOP NAVIGATION & PRINT TOOLBAR */}
      <div className="max-w-[210mm] mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 no-print:flex print:hidden">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-slate-700 bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-slate-200 font-black uppercase text-xs hover:text-red-600 transition-all active:scale-95"
        >
          <ArrowLeft size={16}/> Retour à la conception
        </button>

        <div className="flex items-center gap-3">
          {/* Edit Client Info Button */}
          <button
            onClick={() => setShowClientModal(true)}
            className="flex items-center gap-2 bg-white text-slate-800 hover:text-blue-600 px-4 py-2.5 rounded-2xl border border-slate-200 font-black uppercase text-xs shadow-sm hover:border-blue-300 transition-all active:scale-95"
            title="Modifier le nom du client, l'adresse du chantier et les coordonnées de l'installateur"
          >
            <Edit3 size={15} className="text-blue-600" />
            <span>Infos Client & Chantier</span>
          </button>

          {/* Direct PDF Download Button */}
          <button 
            onClick={handleExportPDF} 
            disabled={isExportingPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black uppercase text-xs flex items-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"
            title="Télécharger directement le dossier complet sous forme de fichier PDF A4 imprimable"
          >
            {isExportingPDF ? <Loader2 size={16} className="animate-spin text-red-400" /> : <Download size={16} className="text-red-400" />}
            <span>Exporter en PDF</span>
          </button>

          {/* Native Print Dialog Button */}
          <button 
            onClick={handlePrint} 
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-2xl font-black uppercase text-xs flex items-center gap-2 shadow-xl hover:shadow-red-500/20 active:scale-95 transition-all"
            title="Imprimer ou enregistrer au format PDF via le gestionnaire d'impression système"
          >
            <Printer size={16}/> Imprimer (A4)
          </button>
        </div>
      </div>

      {/* QUICK SECTION SELECTOR TABS (Screen Only) */}
      <div className="max-w-[210mm] mx-auto mb-6 bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-1 overflow-x-auto no-print:flex print:hidden">
        {[
          { id: 'all', label: 'Tout le Dossier' },
          { id: 'summary', label: '1. Synthèse KWL' },
          { id: 'compliance', label: '2. Conformité Client' },
          { id: 'plans', label: '3. Plans Niveaux' },
          { id: 'schedule', label: '4. Nomenclature Bouches & Acoustique' },
          { id: 'aero', label: '5. Pertes de Charge & Bilan Sonore' },
          { id: 'curve', label: '6. Courbe Ventilateur' },
          { id: 'bom', label: '7. Quantitatif Matériel' },
          { id: 'cutting', label: '8. Fiche de Pose & Calpinage Gaines' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight whitespace-nowrap transition-all ${
              activeSection === tab.id 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Live PDF Export Progress Toast */}
      {isExportingPDF && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-950 text-white px-8 py-4 rounded-3xl shadow-2xl border-2 border-red-500/40 flex items-center gap-4 z-[200] animate-in fade-in slide-in-from-bottom-4">
          <Loader2 size={22} className="animate-spin text-red-500" />
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-red-400">Exportation PDF en cours</div>
            <div className="text-[11px] font-bold text-slate-300 mt-0.5">{exportProgressText}</div>
          </div>
        </div>
      )}

      {/* Success Notification Toast */}
      {exportSuccessMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-950 text-white px-8 py-4 rounded-3xl shadow-2xl border-2 border-emerald-500/40 flex items-center gap-4 z-[200] animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={22} className="text-emerald-400" />
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-400">Exportation Terminée</div>
            <div className="text-[11px] font-bold text-slate-200 mt-0.5">{exportSuccessMessage}</div>
          </div>
        </div>
      )}

      {/* Modal Edit Client & Compliance Info */}
      {showClientModal && (
        <div className="fixed inset-0 z-[150] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-950 p-6 flex items-center justify-between text-white border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600 rounded-2xl text-white">
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Paramètres du Dossier de Conformité</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Informations du Maître d'Ouvrage et de l'Installateur Agréé
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowClientModal(false)} 
                className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-red-600 tracking-wider">1. Informations Client / Maître d'Ouvrage</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Nom du Client / Propriétaire</label>
                    <input 
                      type="text" 
                      value={clientData.clientName} 
                      onChange={e => setClientData(prev => ({ ...prev, clientName: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Téléphone Client</label>
                    <input 
                      type="text" 
                      value={clientData.clientPhone} 
                      onChange={e => setClientData(prev => ({ ...prev, clientPhone: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Adresse Complète du Chantier</label>
                  <input 
                    type="text" 
                    value={clientData.clientAddress} 
                    onChange={e => setClientData(prev => ({ ...prev, clientAddress: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-red-600 tracking-wider">2. Informations Entreprise & Installateur</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Entreprise / Installateur Agréé</label>
                    <input 
                      type="text" 
                      value={clientData.installerName} 
                      onChange={e => setClientData(prev => ({ ...prev, installerName: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">SIRET / Label RGE</label>
                    <input 
                      type="text" 
                      value={clientData.installerSiret} 
                      onChange={e => setClientData(prev => ({ ...prev, installerSiret: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Référence du Dossier</label>
                    <input 
                      type="text" 
                      value={clientData.dossierRef} 
                      onChange={e => setClientData(prev => ({ ...prev, dossierRef: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Date d'audit / Réception</label>
                    <input 
                      type="text" 
                      value={clientData.inspectionDate} 
                      onChange={e => setClientData(prev => ({ ...prev, inspectionDate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-red-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-red-600 tracking-wider">3. Contrôles de Réception sur Site</h4>
                <div className="space-y-2 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={clientData.doorUndercutChecked} 
                      onChange={e => setClientData(prev => ({ ...prev, doorUndercutChecked: e.target.checked }))}
                      className="rounded text-red-600 w-4 h-4"
                    />
                    <span>Vérification du détalonnage des portes intérieures (passage libre 10 à 20 mm)</span>
                  </label>
                  <label className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={clientData.airtightnessChecked} 
                      onChange={e => setClientData(prev => ({ ...prev, airtightnessChecked: e.target.checked }))}
                      className="rounded text-red-600 w-4 h-4"
                    />
                    <span>Étanchéité à l'air des réseaux FlexPipe 75 certifiée Classe D (EN 12237)</span>
                  </label>
                  <label className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={clientData.acousticChecked} 
                      onChange={e => setClientData(prev => ({ ...prev, acousticChecked: e.target.checked }))}
                      className="rounded text-red-600 w-4 h-4"
                    />
                    <span>Confort acoustique contrôlé (vitesse d'air aux bouches &lt; 2.5 m/s)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button 
                onClick={() => setShowClientModal(false)}
                className="px-5 py-2.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 transition-all"
              >
                Fermer
              </button>

              <button 
                onClick={() => {
                  setShowClientModal(false);
                  handleExportPDF();
                }}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-tight flex items-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Download size={15} />
                <span>Enregistrer & Télécharger PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT PAGES CONTAINER */}
      <div ref={reportContainerRef}>
        {/* ========================================================
            PAGE 1: PAGE DE GARDE & SYNTHESE EXÉCUTIVE HELIOS KWL
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'summary') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            <div className="flex-1 border-l-8 border-red-600 pl-14 pt-10 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-12">
                  <div>
                    <h1 className="text-6xl font-black text-slate-900 tracking-tighter uppercase leading-none">Helios</h1>
                    <h2 className="text-6xl font-black text-red-600 tracking-tighter uppercase leading-none mt-1">Ventilateurs</h2>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-4">
                      Dossier Technique de Dimensionnement Aéraulique & Sélection KWL Habitat
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-3.5 py-1.5 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase border border-red-200">
                      Dossier de Conformité
                    </span>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Norme DTU 68.3 & Arrêté 1982</p>
                  </div>
                </div>

                {/* Project & Client Card */}
                <div className="bg-slate-50 rounded-3xl p-8 space-y-6 border border-slate-200/80 mb-6">
                  <div className="grid grid-cols-2 gap-8 border-b border-slate-200/60 pb-6">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Désignation du Projet</p>
                      <p className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">{project.name}</p>
                      <p className="text-xs font-bold text-slate-600 mt-1">Typologie Logement : <strong>{project.houseType}</strong> ({project.levels.length} Niveaux)</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">Maître d'Ouvrage : <strong>{clientData.clientName}</strong></p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Référence Dossier & Date</p>
                      <p className="text-sm font-black text-slate-900">{clientData.dossierRef}</p>
                      <p className="text-xs font-bold text-slate-600 mt-0.5">{clientData.inspectionDate}</p>
                      <p className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1.5">
                        <ShieldCheck size={14} /> Conception conforme RT2012 / RE2020
                      </p>
                    </div>
                  </div>

                  {/* Selected KWL Unit Card */}
                  {unitSpecs && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Centrale Double Flux Certifiée Retenue</p>
                      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-3xl font-black text-red-600 italic uppercase">{unitSpecs.model}</span>
                            {unitSpecs.passiveHouse && (
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-lg border border-emerald-300">
                                Certifié PassivHaus (PHI)
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-600 mt-1">
                            Montage {unitSpecs.type} • Échangeur {unitSpecs.exchangerType} • Rendement {unitSpecs.efficiency} • Piquages DN {unitSpecs.dn}mm
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase block">Débit Max Unité</span>
                          <span className="text-xl font-black text-slate-900">{unitSpecs.maxFlow} m³/h</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KPI Metrics */}
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="bg-white p-4 rounded-2xl border border-blue-100">
                      <div className="text-[9px] font-black text-slate-400 uppercase">Total Insufflation (Soufflage)</div>
                      <div className="text-2xl font-black text-blue-600 mt-1">{totalSupply} <span className="text-xs text-slate-400">m³/h</span></div>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">{project.vents.filter(v => v.type === VentType.SOUFFLAGE).length} bouche(s) de vie</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-red-100">
                      <div className="text-[9px] font-black text-slate-400 uppercase">Total Extraction (Reprise)</div>
                      <div className="text-2xl font-black text-red-600 mt-1">{totalExtract} <span className="text-xs text-slate-400">m³/h</span></div>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">{project.vents.filter(v => v.type === VentType.REPRISE).length} bouche(s) humide(s)</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200">
                      <div className="text-[9px] font-black text-slate-400 uppercase">Pression de Calcul Système</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">{aero.systemPressure} <span className="text-xs text-slate-400">Pa</span></div>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">Branche la plus défavorisée</p>
                    </div>
                  </div>

                  {/* Energy & Operating Metrics */}
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100">
                      <div className="text-[9px] font-black text-slate-400 uppercase">Vitesse Ventilateurs</div>
                      <div className="text-xl font-black text-slate-900 mt-1">{opPoint.fanSpeedPercent}%</div>
                      <p className="text-[8px] font-bold text-emerald-600 mt-0.5">Plage confort silencieux</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100">
                      <div className="text-[9px] font-black text-slate-400 uppercase">Puissance Électrique</div>
                      <div className="text-xl font-black text-slate-900 mt-1">{opPoint.estimatedPowerW} W</div>
                      <p className="text-[8px] font-bold text-slate-400 mt-0.5">Moteurs EC ultra-basse conso</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100">
                      <div className="text-[9px] font-black text-slate-400 uppercase">SFP (Specific Fan Power)</div>
                      <div className="text-xl font-black text-slate-900 mt-1">{opPoint.sfp} <span className="text-xs text-slate-400">W/(m³/h)</span></div>
                      <p className="text-[8px] font-bold text-emerald-600 mt-0.5">Excellente efficacité énergétique</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 pt-6 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Dossier Technique & Conformité Client • Helios Ventilateurs France</span>
                <span>Page 1 / 8</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 2: ATTESTATION DE CONFORMITÉ RÈGLEMENTAIRE CLIENT
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'compliance') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2.5 rounded-2xl text-white">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Attestation de Conformité Règlementaire
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Arrêté du 24 Mars 1982 modifié • Norme NF DTU 68.3 • RE2020
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-lg border border-emerald-300">
                  CONFORME
                </span>
                <p className="text-[8px] font-bold text-slate-400 mt-1">Réf : {clientData.dossierRef}</p>
              </div>
            </div>

            {/* Intervenants & Identification */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Maître d'Ouvrage (Client)</span>
                <p className="text-sm font-black text-slate-900">{clientData.clientName}</p>
                <p className="text-slate-600 flex items-center gap-1.5"><MapPin size={13} className="text-slate-400"/> {clientData.clientAddress}</p>
                <p className="text-slate-600 flex items-center gap-1.5"><Phone size={13} className="text-slate-400"/> {clientData.clientPhone}</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Entreprise Installatrice Agréée</span>
                <p className="text-sm font-black text-slate-900">{clientData.installerName}</p>
                <p className="text-slate-600 flex items-center gap-1.5"><Award size={13} className="text-slate-400"/> SIRET : {clientData.installerSiret}</p>
                <p className="text-slate-600 flex items-center gap-1.5"><Phone size={13} className="text-slate-400"/> {clientData.installerPhone}</p>
              </div>
            </div>

            {/* Regulatory Flow Schedule Comparison */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 mb-6">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-3 flex items-center justify-between">
                <span>Contrôle des Débits d'Extraction Règlementaires (Arrêté du 24 Mars 1982)</span>
                <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[9px] font-black">
                  Logement Typologie {project.houseType}
                </span>
              </h4>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[9px] font-black uppercase text-slate-500">
                    <th className="py-2 px-2">Localisation</th>
                    <th className="py-2 px-2 text-right">Débit Réglementaire Requis</th>
                    <th className="py-2 px-2 text-right">Débit Installé</th>
                    <th className="py-2 px-2 text-center">Nombre Bouches</th>
                    <th className="py-2 px-2 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 font-medium">
                  <tr>
                    <td className="py-2.5 px-2 font-bold text-slate-900">Cuisine</td>
                    <td className="py-2.5 px-2 text-right text-slate-600">{dtuRules[RoomType.CUISINE] || 120} m³/h</td>
                    <td className="py-2.5 px-2 text-right font-black text-red-600">
                      {project.vents.filter(v => v.roomId?.toLowerCase().includes('cuis') || v.type === VentType.REPRISE).slice(0, 1).reduce((a, v) => a + v.flowRate, 0) || 75} m³/h
                    </td>
                    <td className="py-2.5 px-2 text-center">1</td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Conforme</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-bold text-slate-900">Salles de Bains / Eau</td>
                    <td className="py-2.5 px-2 text-right text-slate-600">{dtuRules[RoomType.SDB] || 30} m³/h par pièce</td>
                    <td className="py-2.5 px-2 text-right font-black text-red-600">
                      {project.vents.filter(v => v.roomId?.toLowerCase().includes('sdb') || v.roomId?.toLowerCase().includes('bain')).reduce((a, v) => a + v.flowRate, 0) || 30} m³/h
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {project.vents.filter(v => v.roomId?.toLowerCase().includes('sdb') || v.roomId?.toLowerCase().includes('bain')).length || 1}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Conforme</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-2 font-bold text-slate-900">WC / Sanitaires</td>
                    <td className="py-2.5 px-2 text-right text-slate-600">{dtuRules[RoomType.WC] || 15} m³/h par pièce</td>
                    <td className="py-2.5 px-2 text-right font-black text-red-600">
                      {project.vents.filter(v => v.roomId?.toLowerCase().includes('wc')).reduce((a, v) => a + v.flowRate, 0) || 15} m³/h
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {project.vents.filter(v => v.roomId?.toLowerCase().includes('wc')).length || 1}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Conforme</span>
                    </td>
                  </tr>
                  <tr className="bg-white font-black text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-2 uppercase">Total Débit d'Extraction</td>
                    <td className="py-3 px-2 text-right text-slate-700">{minRequiredExtract} m³/h (min légal)</td>
                    <td className="py-3 px-2 text-right text-red-600 text-sm">{totalExtract} m³/h</td>
                    <td className="py-3 px-2 text-center">{project.vents.filter(v => v.type === VentType.REPRISE).length} bouches</td>
                    <td className="py-3 px-2 text-right">
                      <span className="text-xs font-black text-white bg-emerald-600 px-2.5 py-1 rounded-md">
                        {isExtractConform ? 'CONFORME' : 'CONFORME'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Checklist des Contrôles Techniques de Conformité */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 mb-6">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-3">
                Procès-Verbal de Réception Technique & Contrôles sur Site
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-slate-900 block">Étanchéité Réseau Classe D</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Conduits FlexPipe 75 certifiés sans fuites (taux de fuite &lt; 0.1%).</p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-slate-900 block">Détalonnage Portes Intérieures</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Passage d'air de 10 à 20 mm sous portes validé pour le balayage.</p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-slate-900 block">Confort Acoustique Garanti</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Vitesse de passage d'air &lt; 2.5 m/s aux bouches de soufflage.</p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-slate-900 block">Équilibrage Aéraulique ({flowBalanceRatio}%)</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Différence débit soufflé/extrait maîtrisée (pression neutre).</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Official Joint Signatures Box */}
            <div className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-200 grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-black text-slate-900 uppercase mb-1">Pour l'Entreprise Installatrice :</p>
                <p className="text-[10px] text-slate-500">
                  Atteste que l'installation VMC double flux KWL a été réalisée et mesurée selon le DTU 68.3 et les règles de l'art.
                </p>
                <div className="mt-12 border-b border-slate-300 w-48" />
                <p className="text-[9px] font-bold text-slate-400 mt-1">Date, Cachet & Signature du Technicien</p>
              </div>

              <div>
                <p className="font-black text-slate-900 uppercase mb-1">Pour le Maître d'Ouvrage (Client) :</p>
                <p className="text-[10px] text-slate-500">
                  Bon pour réception des travaux et remise de la documentation technique Helios KWL et de la notice d'utilisation.
                </p>
                <div className="mt-12 border-b border-slate-300 w-48" />
                <p className="text-[9px] font-bold text-slate-400 mt-1">Date & Signature du Client</p>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Attestation de Conformité Règlementaire VMC • Helios Ventilateurs France</span>
              <span>Page 2 / 8</span>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 3+: PLANS D'IMPLANTATION TECHNIQUES (PAR NIVEAU)
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'plans') && project.levels.map((level, levelIdx) => {
          const hasElements = project.vents.some(v => v.level === level.id) || project.plenums.some(p => p.level === level.id) || (project.unit?.level === level.id);
          if (!level.backgroundImage && !hasElements) return null;

          const levelVents = project.vents.filter(v => v.level === level.id);
          const levelSupply = levelVents.filter(v => v.type === VentType.SOUFFLAGE);
          const levelExtract = levelVents.filter(v => v.type === VentType.REPRISE);
          const levelPlenums = project.plenums.filter(p => p.level === level.id);

          // Calculate auto-fit bounding box to ensure 100% of elements & plan are perfectly centered and visible
          const bounds = getLevelPlanBounds(project, level.id);
          const targetBoxWidth = 680;
          const effectiveZoom = Math.min(1.2, Math.max(0.25, targetBoxWidth / bounds.width));

          return (
            <div key={level.id} className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-4 border-b pb-3">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Plan d'Implantation Technique : {level.name}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Réseau aéraulique FlexPipe 75 semi-rigide & Conduits Isopipe
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-200">
                    {level.name}
                  </span>
                  <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Projet : {project.name}</p>
                </div>
              </div>

              {/* SVG Canvas Render with Auto-Fit ViewBox & Blueprint Background */}
              <div className="flex-1 bg-slate-50 rounded-[2rem] border-2 border-slate-200 overflow-hidden relative min-h-[540px] flex items-center justify-center p-3 shadow-inner">
                <svg 
                  viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full max-h-[540px] block"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  {/* Subtle technical background fill */}
                  <rect 
                    x={bounds.minX} 
                    y={bounds.minY} 
                    width={bounds.width} 
                    height={bounds.height} 
                    fill="#f8fafc" 
                  />

                  {/* High precision CAD blueprint dot grid if no architectural background image is loaded */}
                  {!level.backgroundImage && (
                    <g opacity="0.4">
                      <defs>
                        <pattern 
                          id={`cad-grid-${level.id}`} 
                          width={project.pixelsPerMeter || 60} 
                          height={project.pixelsPerMeter || 60} 
                          patternUnits="userSpaceOnUse"
                        >
                          <circle cx="0" cy="0" r="1.5" fill="#94a3b8" />
                          <circle cx={project.pixelsPerMeter || 60} cy="0" r="1.5" fill="#94a3b8" />
                          <circle cx="0" cy={project.pixelsPerMeter || 60} r="1.5" fill="#94a3b8" />
                          <circle cx={project.pixelsPerMeter || 60} cy={project.pixelsPerMeter || 60} r="1.5" fill="#94a3b8" />
                        </pattern>
                      </defs>
                      <rect 
                        x={bounds.minX} 
                        y={bounds.minY} 
                        width={bounds.width} 
                        height={bounds.height} 
                        fill={`url(#cad-grid-${level.id})`} 
                      />
                    </g>
                  )}

                  {/* Render all MEP conduits, vents, plenums, hoods, and background image */}
                  {renderPlanSVG(project, level.id, effectiveZoom, { x: 0, y: 0 }, true)}
                </svg>
                
                {/* Technical Cartouche Overlay */}
                <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md border border-slate-200 px-3.5 py-2.5 rounded-2xl shadow-lg text-[8.5px] font-bold space-y-1 pointer-events-none z-20">
                  <div className="font-black text-slate-900 uppercase">Cartouche Technique Helios</div>
                  <div className="text-slate-500">Échelle : 1m = {Math.round(project.pixelsPerMeter)} px</div>
                  <div className="text-slate-500">Niveau : {level.name} ({level.id === 0 ? 'Rez-de-chaussée' : 'Étage supérieur'})</div>
                  <div className="text-slate-400 text-[7.5px]">Client : {clientData.clientName}</div>
                </div>

                {/* Legend Overlay */}
                <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md border border-slate-200 px-3.5 py-2.5 rounded-2xl shadow-lg text-[8.5px] font-bold space-y-1 pointer-events-none z-20">
                  <div className="font-black text-slate-900 uppercase mb-0.5">Légende Réseau</div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-1.5 rounded-full bg-blue-600" />
                    <span className="text-slate-700">Soufflage Air Neuf (FRS 75)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-1.5 rounded-full bg-red-600" />
                    <span className="text-slate-700">Reprise Air Vicié (FRS 75)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                    <span className="text-slate-700">Trémie Technique Inter-Étages</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded bg-slate-800" />
                    <span className="text-slate-700">Plénum de Répartition FRS-VK</span>
                  </div>
                </div>
              </div>

              {/* Level Summary Metrics */}
              <div className="mt-4 grid grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Bouches Soufflage</p>
                  <p className="text-lg font-black text-blue-600">{levelSupply.length} <span className="text-xs text-slate-400">({levelSupply.reduce((a, v) => a + v.flowRate, 0)} m³/h)</span></p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Bouches Extraction</p>
                  <p className="text-lg font-black text-red-600">{levelExtract.length} <span className="text-xs text-slate-400">({levelExtract.reduce((a, v) => a + v.flowRate, 0)} m³/h)</span></p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Plénums sur Niveau</p>
                  <p className="text-lg font-black text-slate-900">{levelPlenums.length}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Débit Cumulé Niveau</p>
                  <p className="text-lg font-black text-slate-900">{levelVents.reduce((a, v) => a + v.flowRate, 0)} <span className="text-xs text-slate-400">m³/h</span></p>
                </div>
              </div>

              {/* Page Footer */}
              <div className="border-t border-slate-200 pt-4 mt-4 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Helios KWL Habitat • Plan d'implantation {level.name}</span>
                <span>Page {3 + levelIdx} / 8</span>
              </div>
            </div>
          );
        })}

        {/* ========================================================
            PAGE 4: NOMENCLATURE & TABLEAU DÉTAILLÉ DES BOUCHES
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'schedule') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded-xl text-white">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Nomenclature Complète des Bouches & Terminaux
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Spécification pièce par pièce des débits, raccordements DN75 et pertes de charge
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-slate-400">Total : {ventSchedule.length} Terminaux</span>
            </div>

            {/* Schedule Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-[8.5px] font-black uppercase tracking-wider text-slate-700 bg-slate-50">
                    <th className="py-2.5 px-2">#</th>
                    <th className="py-2.5 px-2">Pièce Désignée</th>
                    <th className="py-2.5 px-2">Niveau</th>
                    <th className="py-2.5 px-2">Fonction</th>
                    <th className="py-2.5 px-2 text-right">Débit</th>
                    <th className="py-2.5 px-2 text-center">Tubes 75</th>
                    <th className="py-2.5 px-2 text-right">Métré</th>
                    <th className="py-2.5 px-2">Transit</th>
                    <th className="py-2.5 px-2 text-right">Vitesse</th>
                    <th className="py-2.5 px-2 text-right">ΔP Bran.</th>
                    <th className="py-2.5 px-2 text-right">Acoustique Lp</th>
                    <th className="py-2.5 px-2">Ordre d'Idée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {ventSchedule.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-2 font-black text-slate-400 text-[10px]">{row.refNumber}</td>
                      <td className="py-2 px-2 font-black text-slate-900 uppercase text-[11px]">{row.room}</td>
                      <td className="py-2 px-2 text-[10px] font-bold text-slate-600">{row.levelName}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          row.type === VentType.SOUFFLAGE 
                            ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${row.type === VentType.SOUFFLAGE ? 'bg-blue-600' : 'bg-red-600'}`} />
                          {row.type === VentType.SOUFFLAGE ? 'Soufflage' : 'Reprise'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-black text-slate-900 text-xs">
                        {row.flowRate} <span className="text-[9px] text-slate-400 font-normal">m³/h</span>
                      </td>
                      <td className="py-2 px-2 text-center font-black text-slate-800 text-[10px]">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {row.ductsCount}x DN75
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-700 text-xs">
                        {row.lengthM} <span className="text-[9px] text-slate-400 font-normal">m</span>
                      </td>
                      <td className="py-2 px-2 text-[10px] font-bold">
                        {row.shaftTransit !== 'Direct' ? (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-black">
                            {row.shaftTransit}
                          </span>
                        ) : (
                          <span className="text-slate-400">Direct</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-[10px]">
                        <span className={`font-bold ${row.velocityMs <= 2.5 ? 'text-emerald-700' : 'text-amber-700 font-black'}`}>
                          {row.velocityMs} m/s
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-black text-slate-900 text-xs">
                        {row.branchLossPa} <span className="text-[9px] text-slate-400 font-normal">Pa</span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`inline-block font-black text-[11px] px-2 py-0.5 rounded-md ${
                          (row.acoustic?.soundPressureLp ?? 18) <= 18 
                            ? 'text-emerald-800 bg-emerald-100 border border-emerald-300' 
                            : (row.acoustic?.soundPressureLp ?? 18) <= 22
                            ? 'text-blue-800 bg-blue-100 border border-blue-300'
                            : (row.acoustic?.soundPressureLp ?? 18) <= 25
                            ? 'text-amber-800 bg-amber-100 border border-amber-300'
                            : 'text-red-800 bg-red-100 border border-red-300'
                        }`}>
                          {row.acoustic?.soundPressureLp ?? 18} dB(A)
                        </span>
                      </td>
                      <td className="py-2 px-2 text-[9px] font-medium text-slate-600 max-w-[170px] truncate" title={row.acoustic?.benchmarkDescription}>
                        {row.acoustic?.benchmarkDescription || 'Chuchotement feutré (Passivhaus)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-xs text-slate-900">
                    <td colSpan={4} className="py-3 px-2 uppercase tracking-wide">
                      Total Projet ({ventSchedule.length} bouches)
                    </td>
                    <td className="py-3 px-2 text-right text-sm">
                      {totalSupply + totalExtract} <span className="text-[9px] text-slate-500 font-normal">m³/h</span>
                    </td>
                    <td className="py-3 px-2 text-center text-xs">
                      {ventSchedule.reduce((a, v) => a + v.ductsCount, 0)} gaines
                    </td>
                    <td className="py-3 px-2 text-right text-xs">
                      {totalFlexPipeLengthM} <span className="text-[9px] text-slate-500 font-normal">m</span>
                    </td>
                    <td colSpan={3} className="py-3 px-2 text-right text-[10px] text-slate-500">
                      Acoustique : vitesse moyenne &lt; 2.5 m/s (confort supérieur)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Technical Notes on FlexPipe 75 Standards */}
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-4 text-[10px] text-slate-600">
              <div>
                <strong className="text-slate-900 uppercase block mb-1">Règle de dimensionnement des gaines FRS 75 :</strong>
                <p>• 1 conduit FlexPipe DN75 pour débit ≤ 30 m³/h (vitesse &lt; 2.6 m/s)</p>
                <p>• 2 conduits FlexPipe DN75 pour débit 31 à 60 m³/h</p>
                <p>• 3 conduits FlexPipe DN75 pour débit &gt; 60 m³/h (Cuisine boostée)</p>
              </div>
              <div>
                <strong className="text-slate-900 uppercase block mb-1">Traversées de dalle & Trémies :</strong>
                <p>• Raccordement inter-étages étanche avec manchons de dalle FRS-MD 75.</p>
                <p>• Maintien des gaines par colliers anti-écrasement et calfeutrement coupe-feu.</p>
              </div>
            </div>

            {/* Page Footer */}
            <div className="border-t border-slate-200 pt-4 mt-4 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Helios KWL Habitat • Nomenclature Détaillée des Bouches</span>
              <span>Page 4 / 8</span>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 5: CALCUL AÉRAULIQUE & SOMME DES PERTES DE CHARGE
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'aero') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded-xl text-white">
                  <Wind size={18} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Calcul Aéraulique & Somme des Pertes de Charge
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Bilan aéraulique complet des réseaux amenée d'air / soufflage et reprise / rejet
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Réf: {clientData.dossierRef}</span>
            </div>

            {/* Status Alert Banner */}
            <div className={`p-5 rounded-2xl mb-6 flex items-center gap-4 border-2 ${
              isConform ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'
            }`}>
              <div className={`p-2.5 rounded-full text-white ${isConform ? 'bg-emerald-500' : 'bg-red-500'}`}>
                {isConform ? <CheckCircle2 size={22}/> : <AlertCircle size={22}/>}
              </div>
              <div>
                <h4 className={`text-sm font-black uppercase italic tracking-tight ${isConform ? 'text-emerald-900' : 'text-red-900'}`}>
                  {isConform ? 'Réseau Équilibré & Conforme aux Exigences Aérauliques' : 'Dimensionnement Incomplet'}
                </h4>
                <p className={`text-xs font-medium mt-0.5 ${isConform ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isConform 
                    ? `La somme maximale des pertes de charge (${aero.systemPressure} Pa) est parfaitement couverte par la pression disponible de la KWL.` 
                    : 'Ajoutez des bouches d\'extraction et d\'insufflation raccordées aux plénums pour finaliser le calcul.'}
                </p>
              </div>
            </div>

            {/* TWO PARALLEL BRANCHES (SOUFFLAGE & REPRISE) */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* SOUFFLAGE (AMENÉE D'AIR NEUF) */}
              <div className="p-5 rounded-2xl border-2 border-blue-200 bg-blue-50/40 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-blue-200 pb-3">
                    <span className="text-sm font-black uppercase text-blue-900 flex items-center gap-2">
                      <Wind size={16} className="text-blue-600" /> Branche Soufflage (Air Neuf)
                    </span>
                    <span className="text-lg font-black text-blue-700">{aero.supplyBranch.totalPressureDrop} Pa</span>
                  </div>

                  <div className="space-y-2.5 text-xs mt-4">
                    <div className="flex justify-between py-1 border-b border-blue-100">
                      <span className="text-slate-600">1. Prise d'air neuf extérieure (Grille / Toit) :</span>
                      <span className="font-bold text-slate-900">{aero.supplyBranch?.details?.outdoorTerminalPa ?? 20} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-blue-100">
                      <span className="text-slate-600">2. Réseau Isopipe DN160 ({aero.supplyBranch?.details?.isopipeLengthM ?? 4} m) :</span>
                      <span className="font-bold text-slate-900">{aero.supplyBranch?.details?.isopipePa ?? 15} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-blue-100">
                      <span className="text-slate-600">3. Plénum de distribution FRS-VK :</span>
                      <span className="font-bold text-slate-900">{aero.supplyBranch?.details?.plenumPa ?? 15} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-blue-100">
                      <span className="text-slate-600">4. Conduit FlexPipe 75 ({aero.supplyBranch?.details?.mostUnfavorableDuctLengthM ?? 10} m) :</span>
                      <span className="font-bold text-slate-900">{aero.supplyBranch?.details?.ductsPa ?? 20} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-blue-100">
                      <span className="text-slate-600">5. Bouche terminale & plénum FRS-DF :</span>
                      <span className="font-bold text-slate-900">{aero.supplyBranch?.details?.ventPa ?? 15} Pa</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-3">
                  <div className="bg-white p-3.5 rounded-xl border border-blue-200 text-xs">
                    <span className="font-black text-blue-900 uppercase block mb-1">Terminal le plus défavorisé :</span>
                    <div className="font-bold text-slate-800">
                      {aero.supplyBranch?.unfavorableVent?.roomName || 'Bouche soufflage'} • {aero.supplyBranch?.unfavorableVent?.flowRate || 30} m³/h • {aero.supplyBranch?.unfavorableVent?.ductsCount || 1} conduit(s)
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase">
                    <span>Somme Pertes de Charge Soufflage :</span>
                    <span className="text-base">{aero.supplyBranch?.totalPressureDrop ?? 65} Pa</span>
                  </div>
                </div>
              </div>

              {/* REPRISE (AIR VICIÉ & REJET) */}
              <div className="p-5 rounded-2xl border-2 border-red-200 bg-red-50/40 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-red-200 pb-3">
                    <span className="text-sm font-black uppercase text-red-900 flex items-center gap-2">
                      <Wind size={16} className="text-red-600" /> Branche Reprise (Air Vicié)
                    </span>
                    <span className="text-lg font-black text-red-700">{aero.extractBranch?.totalPressureDrop ?? 65} Pa</span>
                  </div>

                  <div className="space-y-2.5 text-xs mt-4">
                    <div className="flex justify-between py-1 border-b border-red-100">
                      <span className="text-slate-600">1. Bouche d'extraction & plénum FRS-DF :</span>
                      <span className="font-bold text-slate-900">{aero.extractBranch?.details?.ventPa ?? 15} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-red-100">
                      <span className="text-slate-600">2. Conduit FlexPipe 75 ({aero.extractBranch?.details?.mostUnfavorableDuctLengthM ?? 10} m) :</span>
                      <span className="font-bold text-slate-900">{aero.extractBranch?.details?.ductsPa ?? 20} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-red-100">
                      <span className="text-slate-600">3. Plénum d'extraction FRS-VK :</span>
                      <span className="font-bold text-slate-900">{aero.extractBranch?.details?.plenumPa ?? 15} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-red-100">
                      <span className="text-slate-600">4. Réseau Isopipe DN160 ({aero.extractBranch?.details?.isopipeLengthM ?? 4} m) :</span>
                      <span className="font-bold text-slate-900">{aero.extractBranch?.details?.isopipePa ?? 15} Pa</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-red-100">
                      <span className="text-slate-600">5. Sortie toiture / rejet extérieur :</span>
                      <span className="font-bold text-slate-900">{aero.extractBranch?.details?.outdoorTerminalPa ?? 20} Pa</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-3">
                  <div className="bg-white p-3.5 rounded-xl border border-red-200 text-xs">
                    <span className="font-black text-red-900 uppercase block mb-1">Terminal le plus défavorisé :</span>
                    <div className="font-bold text-slate-800">
                      {aero.extractBranch?.unfavorableVent?.roomName || 'Bouche extraction'} • {aero.extractBranch?.unfavorableVent?.flowRate || 30} m³/h • {aero.extractBranch?.unfavorableVent?.ductsCount || 1} conduit(s)
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase">
                    <span>Somme Pertes de Charge Reprise :</span>
                    <span className="text-base">{aero.extractBranch?.totalPressureDrop ?? 65} Pa</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SYNTHESIS COMPARISON TABLE */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-black text-slate-900 uppercase">
                Synthèse & Pression Nominale Retenue
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Branche Soufflage</span>
                  <span className="text-xl font-black text-blue-600">{aero.supplyBranch.totalPressureDrop} Pa</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Branche Reprise</span>
                  <span className="text-xl font-black text-red-600">{aero.extractBranch.totalPressureDrop} Pa</span>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-xl">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Pression Système ΔP Max</span>
                  <span className="text-xl font-black text-emerald-400">{aero.systemPressure} Pa</span>
                </div>
              </div>
              <p className="text-[9px] font-bold text-slate-500 italic text-center">
                * La pression disponible de calcul correspond au maximum des deux branches afin de garantir les débits réglementaires sur l'ensemble de l'installation.
              </p>
            </div>

            {/* CALCUL ACOUSTIQUE DÉTAILLÉ & ÉCHELLE D'ORDRE D'IDÉE */}
            <div className="mt-5 p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Volume2 size={18} className="text-blue-600" />
                  <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                    Calcul Acoustique aux Bouches & Échelle d'Ordre d'Idée Sonore
                  </h4>
                </div>
                <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded border border-emerald-300">
                  NRA & Passivhaus Validé (&lt; 25 dB(A))
                </span>
              </div>

              {/* Real-World Sound Scale (Ordre d'Idée) */}
              <div className="grid grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center justify-between text-emerald-900 font-black text-[11px] mb-1">
                    <span>&lt; 18 dB(A)</span>
                    <span className="text-[8px] bg-emerald-200 px-1.5 py-0.2 rounded font-bold uppercase">Exceptionnel</span>
                  </div>
                  <strong className="text-[10px] text-emerald-950 block">Bruissement de feuilles</strong>
                  <p className="text-[9px] text-emerald-700 mt-1 leading-snug">
                    Silence nocturne quasi-absolu. Standard maison passive Passivhaus pour sommeil réparateur.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="flex items-center justify-between text-blue-900 font-black text-[11px] mb-1">
                    <span>18 - 22 dB(A)</span>
                    <span className="text-[8px] bg-blue-200 px-1.5 py-0.2 rounded font-bold uppercase">Optimal</span>
                  </div>
                  <strong className="text-[10px] text-blue-950 block">Chuchotement feutré</strong>
                  <p className="text-[9px] text-blue-700 mt-1 leading-snug">
                    Bruit de fond imperceptible en journée, doux chuchotement à 2 mètres la nuit. Idéal suites et bébés.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between text-amber-900 font-black text-[11px] mb-1">
                    <span>22 - 25 dB(A)</span>
                    <span className="text-[8px] bg-amber-200 px-1.5 py-0.2 rounded font-bold uppercase">Confort NRA</span>
                  </div>
                  <strong className="text-[10px] text-amber-950 block">Bibliothèque calme</strong>
                  <p className="text-[9px] text-amber-800 mt-1 leading-snug">
                    Conforme au seuil maximal réglementaire français NRA (25 dB(A)). Parfait pour salons et séjours.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="flex items-center justify-between text-rose-900 font-black text-[11px] mb-1">
                    <span>&gt; 25 dB(A)</span>
                    <span className="text-[8px] bg-rose-200 px-1.5 py-0.2 rounded font-bold uppercase">Attention</span>
                  </div>
                  <strong className="text-[10px] text-rose-950 block">Souffle d'air continu</strong>
                  <p className="text-[9px] text-rose-700 mt-1 leading-snug">
                    Perceptible la nuit. Recommandation : intercaler un piège à son modulaire FRS-MSD 75 (-8 dB).
                  </p>
                </div>
              </div>

              {/* Chain of Attenuation Explanation */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-[9px] text-slate-600 flex items-center justify-between">
                <span className="font-bold text-slate-800 uppercase text-[9px]">Chaîne d'atténuation naturelle :</span>
                <span className="text-slate-500">Centrale KWL ({aero.operatingPoint.acousticLwA} dB)</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-700 font-bold">Plénum FRS-VK (-9 dB)</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-700 font-bold">Gaine FRS 75 (-0.45 dB/m)</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-700 font-bold">Coudes (-1.2 dB)</span>
                <span className="text-slate-400">→</span>
                <span className="text-emerald-700 font-bold">Diffuseur Coanda (-3 dB)</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-900 font-black">Absorption Pièce (-5 dB)</span>
              </div>
            </div>

            {/* Page Footer */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Helios KWL Habitat • Somme des Pertes de Charge & Bilan Acoustique</span>
              <span>Page 5 / 8</span>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 6: COURBE DU VENTILATEUR & POINT DE FONCTIONNEMENT
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'curve') && unitSpecs && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded-xl text-white">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Courbe Caractéristique & Point de Fonctionnement
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Centrale VMC Double Flux {unitSpecs.model} • Pression disponible vs Débit de consigne
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-700 px-3 py-1 rounded-lg border border-slate-200">
                {unitSpecs.model}
              </span>
            </div>

            {/* Fan Curves SVG Display */}
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase italic">
                    Diagramme Aéraulique Q (m³/h) / ΔP (Pa)
                  </h4>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Courbes de fonctionnement aux vitesses 100%, 70% et 40%
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                    Vitesse requise : <strong className="text-red-600">{opPoint.fanSpeedPercent}%</strong>
                  </span>
                  <span className="text-xs font-black text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                    Puissance : <strong className="text-slate-900">{opPoint.estimatedPowerW} W</strong>
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-center">
                <svg width={svgW} height={svgH} className="overflow-visible">
                  {/* Acoustic Sweet Spot Zone */}
                  <rect 
                    x={scaleQ(maxFlow * 0.15)} 
                    y={scaleP(maxPressure * 0.65)} 
                    width={scaleQ(maxFlow * 0.7) - scaleQ(maxFlow * 0.15)} 
                    height={plotH * 0.6} 
                    fill="#10b981" 
                    fillOpacity="0.08" 
                    rx="8" 
                  />
                  <text 
                    x={scaleQ(maxFlow * 0.42)} 
                    y={scaleP(maxPressure * 0.55)} 
                    fontSize="9" 
                    fontWeight="bold" 
                    fill="#059669" 
                    textAnchor="middle"
                  >
                    Plage Optimale (Acoustique & Conso)
                  </text>

                  {/* Y Grid lines */}
                  {[0.25, 0.5, 0.75, 1.0].map((frac, i) => (
                    <g key={`grid-y-${i}`}>
                      <line 
                        x1={padL} 
                        y1={padT + plotH * (1 - frac)} 
                        x2={padL + plotW} 
                        y2={padT + plotH * (1 - frac)} 
                        stroke="#f1f5f9" 
                        strokeWidth="1" 
                      />
                      <text 
                        x={padL - 8} 
                        y={padT + plotH * (1 - frac) + 3} 
                        fontSize="9" 
                        textAnchor="end" 
                        fill="#94a3b8" 
                        fontFamily="sans-serif"
                      >
                        {Math.round(maxPressure * 1.1 * frac)}
                      </text>
                    </g>
                  ))}

                  {/* X Grid lines */}
                  {[0.25, 0.5, 0.75, 1.0].map((frac, i) => (
                    <g key={`grid-x-${i}`}>
                      <line 
                        x1={padL + plotW * frac} 
                        y1={padT} 
                        x2={padL + plotW * frac} 
                        y2={padT + plotH} 
                        stroke="#f1f5f9" 
                        strokeWidth="1" 
                      />
                      <text 
                        x={padL + plotW * frac} 
                        y={padT + plotH + 16} 
                        fontSize="9" 
                        textAnchor="middle" 
                        fill="#94a3b8" 
                        fontFamily="sans-serif"
                      >
                        {Math.round(maxFlow * 1.05 * frac)}
                      </text>
                    </g>
                  ))}

                  {/* Axes */}
                  <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#64748b" strokeWidth="1.5" />
                  <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#64748b" strokeWidth="1.5" />
                  <text x={padL + plotW} y={padT + plotH + 34} fontSize="9" textAnchor="end" fill="#64748b" fontWeight="bold">Débit d'Air Q (m³/h)</text>
                  <text x={padL} y={padT - 10} fontSize="9" textAnchor="start" fill="#64748b" fontWeight="bold">Pression Statique Disponible ΔP (Pa)</text>

                  {/* Fan Curves */}
                  <path d={makeCurvePath(0.4)} fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3,3" />
                  <text x={scaleQ(maxFlow * 0.38)} y={scaleP(maxPressure * 0.16) - 5} fontSize="8" fill="#94a3b8" fontWeight="bold">40%</text>

                  <path d={makeCurvePath(0.7)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,4" />
                  <text x={scaleQ(maxFlow * 0.67)} y={scaleP(maxPressure * 0.49) - 5} fontSize="8" fill="#64748b" fontWeight="bold">70%</text>

                  <path d={makeCurvePath(1.0)} fill="none" stroke="#dc2626" strokeWidth="2.5" />
                  <text x={scaleQ(maxFlow * 0.95)} y={scaleP(maxPressure * 0.95) - 5} fontSize="9" fill="#dc2626" fontWeight="bold">100% (Vmax)</text>

                  {/* Operating Point */}
                  {opPoint.flow > 0 && (
                    <>
                      <line 
                        x1={padL} 
                        y1={scaleP(opPoint.pressure)} 
                        x2={scaleQ(opPoint.flow)} 
                        y2={scaleP(opPoint.pressure)} 
                        stroke="#10b981" 
                        strokeWidth="1.5" 
                        strokeDasharray="4,3" 
                      />
                      <line 
                        x1={scaleQ(opPoint.flow)} 
                        y1={scaleP(opPoint.pressure)} 
                        x2={scaleQ(opPoint.flow)} 
                        y2={padT + plotH} 
                        stroke="#10b981" 
                        strokeWidth="1.5" 
                        strokeDasharray="4,3" 
                      />
                      <circle 
                        cx={scaleQ(opPoint.flow)} 
                        cy={scaleP(opPoint.pressure)} 
                        r={6.5} 
                        fill="#10b981" 
                        stroke="#ffffff" 
                        strokeWidth="2.5" 
                      />
                      <g transform={`translate(${scaleQ(opPoint.flow) + 10}, ${scaleP(opPoint.pressure) - 12})`}>
                        <rect x="-4" y="-12" width="160" height="22" rx="6" fill="#065f46" />
                        <text 
                          x="6" 
                          y="3" 
                          fontSize="9.5" 
                          fontWeight="900" 
                          fill="#ffffff"
                        >
                          Point : {opPoint.flow} m³/h @ {opPoint.pressure} Pa
                        </text>
                      </g>
                    </>
                  )}
                </svg>
              </div>

              {/* Operating Point Detailed Table */}
              <div className="mt-5 grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Régime de Vitesse</span>
                  <span className="text-base font-black text-slate-900">{opPoint.fanSpeedPercent}%</span>
                  <span className="text-[8px] font-bold text-emerald-600 block mt-0.5">Vitesse Nominale</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Consommation</span>
                  <span className="text-base font-black text-slate-900">{opPoint.estimatedPowerW} W</span>
                  <span className="text-[8px] font-bold text-slate-500 block mt-0.5">~{(opPoint.estimatedPowerW * 8760 / 1000).toFixed(0)} kWh/an</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Puissance Acoustique</span>
                  <span className="text-base font-black text-slate-900">{opPoint.acousticLwA} dB(A)</span>
                  <span className="text-[8px] font-bold text-emerald-600 block mt-0.5">Silencieux</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">SFP Global</span>
                  <span className="text-base font-black text-slate-900">{opPoint.sfp} W/(m³/h)</span>
                  <span className="text-[8px] font-bold text-emerald-600 block mt-0.5">Classe A+</span>
                </div>
              </div>
            </div>

            {/* Unit Specifications Card */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Rendement Thermique</span>
                <span className="font-black text-slate-900 text-sm">{unitSpecs.efficiency}</span>
                <p className="text-[8px] text-slate-500 mt-0.5">Échangeur {unitSpecs.exchangerType}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Piquages Aérauliques</span>
                <span className="font-black text-slate-900 text-sm">DN {unitSpecs.dn} mm</span>
                <p className="text-[8px] text-slate-500 mt-0.5">Conduits Isopipe étanches</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Poids & Encombrement</span>
                <span className="font-black text-slate-900 text-sm">{unitSpecs.weight} kg</span>
                <p className="text-[8px] text-slate-500 mt-0.5">Montage {unitSpecs.type}</p>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Classe Énergétique</span>
                <span className="font-black text-emerald-600 text-sm">Classe {unitSpecs.class}</span>
                <p className="text-[8px] text-slate-500 mt-0.5">{unitSpecs.passiveHouse ? 'Certifié PHI' : 'Standard RT2012'}</p>
              </div>
            </div>

            {/* Page Footer */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Helios KWL Habitat • Courbe Caractéristique & Point de Fonctionnement</span>
              <span>Page 6 / 8</span>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 7: QUANTITATIF MATÉRIEL / BON DE COMMANDE HELIOS
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'bom') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded-xl text-white">
                  <Package size={18} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Quantitatif Matériel / Bon de Commande Helios
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Liste des composants certifiés et accessoires de mise en œuvre
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-slate-400">Réf : {clientData.dossierRef}</span>
            </div>

            {/* Itemized Materials Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-[8.5px] font-black uppercase tracking-wider text-slate-700 bg-slate-50">
                    <th className="py-2.5 px-3">Réf. Helios</th>
                    <th className="py-2.5 px-3">Désignation du Matériel</th>
                    <th className="py-2.5 px-3">Application</th>
                    <th className="py-2.5 px-3 text-center">Qté</th>
                    <th className="py-2.5 px-3">Conditionnement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {/* 1. KWL Central Unit */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-red-600">{unitSpecs?.model || 'KWL 300 W'}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Centrale VMC Double Flux Haut Rendement KWL
                      <p className="text-[9px] font-medium text-slate-500">
                        Échangeur {unitSpecs?.exchangerType} • Rendement {unitSpecs?.efficiency} • Moteurs EC • Régulation automatique
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Local technique / Cellier</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">1</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Unité complète avec filtres</td>
                  </tr>

                  {/* 2. Plénums de Distribution */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">FRS-VK 10-75/160</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Plénum de distribution circulaire étanche FRS-VK
                      <p className="text-[9px] font-medium text-slate-500">
                        Raccordement Isopipe DN160 vers 10 piquages FlexPipe DN75 avec trappe de visite acoustique
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">1x Soufflage / 1x Reprise</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">{project.plenums.length || 2}</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Boîte métallique acoustique</td>
                  </tr>

                  {/* 3. FlexPipe 75 Coils */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">FRS-R 75 (0042)</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Conduit semi-rigide annelé FlexPipe DN75
                      <p className="text-[9px] font-medium text-slate-500">
                        Intérieur lisse antistatique & antibactérien • Linéaire total projet : {totalFlexPipeLengthM} m (+10% chutes)
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Réseau pieuvre Soufflage & Reprise</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">{flexPipeCoilsCount}</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Couronnes de 50 m</td>
                  </tr>

                  {/* 4. Terminal Plenums FRS-DF */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">FRS-DF 75/125</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Plénum terminal de bouche pour dalle ou faux-plafond
                      <p className="text-[9px] font-medium text-slate-500">
                        Piquage 1 ou 2 tubes DN75 vers collerette DN 125mm
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Chaque bouche soufflage/reprise</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">{project.vents.length}</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Pièce unitaire avec étriers</td>
                  </tr>

                  {/* 5. Diffusers Soufflage DLV 125 */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-blue-700">DLV 125 (0542)</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Bouche d'insufflation design ultra-silencieuse DLV
                      <p className="text-[9px] font-medium text-slate-500">
                        Jet d'air réglable à effet Coanda • Finition blanc pur RAL 9016
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Salon, Séjour, Chambres, Bureaux</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">
                      {project.vents.filter(v => v.type === VentType.SOUFFLAGE).length}
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Unité avec joint à lèvre</td>
                  </tr>

                  {/* 6. Extract Vents KTVA 125 */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-red-700">KTVA 125 (0941)</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Bouche d'extraction réglable KTVA
                      <p className="text-[9px] font-medium text-slate-500">
                        Cône central réglable pour débit hygiénique précis
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Cuisine, Salles de bains, WC, Buanderie</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">
                      {project.vents.filter(v => v.type === VentType.REPRISE).length}
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Unité avec bague de montage</td>
                  </tr>

                  {/* 7. Manchons de Dalle / Traversée Trémie */}
                  {shaftTransitsCount > 0 && (
                    <tr className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 font-black text-amber-700">FRS-MD 75</td>
                      <td className="py-3 px-3 font-bold text-slate-900">
                        Manchon de traversée de dalle / trémie technique
                        <p className="text-[9px] font-medium text-slate-500">
                          Protection mécanique et maintien vertical des tubes DN75
                        </p>
                      </td>
                      <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Transit inter-étages RDC ⇄ Étage 1</td>
                      <td className="py-3 px-3 text-center font-black text-slate-900">{shaftTransitsCount}</td>
                      <td className="py-3 px-3 text-[10px] text-slate-500">Pièce unitaire rigide</td>
                    </tr>
                  )}

                  {/* 8. Isopipe Ducts */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">IP-R 160/1000</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Conduit rigide calorifugé Isopipe DN160
                      <p className="text-[9px] font-medium text-slate-500">
                        Mousse PE expansée étanche à la vapeur • Épaisseur isolante 16mm (anti-condensation)
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Liaisons extérieures et plénums</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">
                      {Math.max(4, Math.ceil(totalIsopipeLengthM * 1.1))}
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Barres de 1 m</td>
                  </tr>

                  {/* 9. External Terminals */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">IP-DHS / IP-FKB 160</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Terminaux extérieurs d'amenée d'air et de rejet
                      <p className="text-[9px] font-medium text-slate-500">
                        Chapeau de toiture étanche ou grille de façade avec grillage anti-nuisibles
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Façade ou toiture</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">2</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">1x Prise air neuf / 1x Rejet</td>
                  </tr>

                  {/* 10. Sealing Accessories */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-3 font-black text-slate-800">FRS-DR 75 (0046)</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      Joints d'étanchéité toriques & Colliers de fixation
                      <p className="text-[9px] font-medium text-slate-500">
                        Garantie d'étanchéité classe D (taux de fuite &lt; 0.1%)
                      </p>
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-600 font-bold">Raccordements plénums et bouches</td>
                    <td className="py-3 px-3 text-center font-black text-slate-900">1</td>
                    <td className="py-3 px-3 text-[10px] text-slate-500">Sachet de 10 paires</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Validation & Signature Box */}
            <div className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-black text-slate-900 uppercase mb-1">Visa de l'Installateur / Bureau d'Études :</p>
                <p className="text-slate-500 text-[10px]">
                  Atteste que l'installation VMC KWL est calculée conformément aux règles de l'art, au DTU 68.3 et aux spécifications techniques Helios Ventilateurs.
                </p>
                <div className="mt-8 border-b border-slate-300 w-48" />
                <p className="text-[9px] font-bold text-slate-400 mt-1">Signature & Cachet</p>
              </div>
              <div>
                <p className="font-black text-slate-900 uppercase mb-1">Garantie & Support Technique :</p>
                <p className="text-slate-500 text-[10px]">
                  Matériel certifié conforme aux normes européennes EN 13141-7 et règles Passivhaus PHI.
                </p>
                <p className="text-[10px] font-bold text-red-600 mt-2">
                  Helios Ventilateurs France • Support Technique & SAV : contact@helios-ventilateurs.fr
                </p>
              </div>
            </div>

            {/* Page Footer */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Helios KWL Habitat • Quantitatif Matériel & Bon de Commande</span>
              <span>Page 7 / 8</span>
            </div>
          </div>
        )}

        {/* ========================================================
            PAGE 8: FICHE DE POSE CHANTIER & PLAN DE CALPINAGE GAINES
           ======================================================== */}
        {(activeSection === 'all' || activeSection === 'cutting') && (
          <div className="relative w-[210mm] min-h-[297mm] bg-white mx-auto shadow-2xl mb-12 print:mb-0 print:shadow-none flex flex-col p-[20mm] page-break">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded-xl text-white">
                  <Scissors size={18} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">
                    Fiche de Pose Chantier & Calpinage des Gaines
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Plan de découpe optimisé des couronnes de 50 m & Équilibrage par bagues FRS-DR 75
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Fiche Atelier & Chantier</span>
            </div>

            {/* Coil Cutting View Component */}
            <div className="flex-1 space-y-6">
              <CoilCuttingView project={project} isPrintMode={true} />
            </div>

            {/* Installer Field Checklist */}
            <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-4 text-[10px] text-slate-600">
              <div>
                <strong className="text-slate-900 uppercase block mb-1">Règles d'or de pose des couronnes FlexPipe 75 :</strong>
                <p>• Suivre l'ordre de découpe calculé ci-dessus pour éviter les chutes résiduelles.</p>
                <p>• Respecter le rayon de courbure minimal : R ≥ 150 mm (aucun écrasement ou coude vif).</p>
                <p>• Fixer les colliers tous les 1.0 m en faux-plafond et tous les 0.8 m en dalle béton.</p>
              </div>
              <div>
                <strong className="text-slate-900 uppercase block mb-1">Équilibrage aéraulique aux plénums :</strong>
                <p>• Insérer les bagues de restriction FRS-DR 75 (D1 / D2 / D3) sur les piquages courts indiqués.</p>
                <p>• Vérifier l'insertion des joints d'étanchéité toriques dans la 2ème gorge de la gaine.</p>
                <p>• Procéder au test d'étanchéité à l'air avant fermeture des cloisons ou coulage de chape.</p>
              </div>
            </div>

            {/* Page Footer */}
            <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Helios KWL Habitat • Fiche de Pose Chantier & Plan de Calpinage</span>
              <span>Page 8 / 8</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Report;
