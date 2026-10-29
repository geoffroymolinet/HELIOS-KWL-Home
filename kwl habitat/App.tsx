
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, RoomType, Vent, VentType, Point, Level } from './types';
import { HELIOS_UNITS, DTU_FLOW_RATES, ROOM_CATEGORIES } from './constants';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import PlanCanvas from './components/PlanCanvas';
import Report from './components/Report';
import UnitSelector from './components/UnitSelector';
import { calculateAerodynamics } from './utils/aerodynamics';
import { autoRouteVents } from './utils/autoRouting';
import { 
  Wind, X as CloseIcon, Undo2, Redo2, Save, FolderOpen, 
  DollarSign, Scissors, Github, Check, CheckCircle2, Sliders, Sparkles 
} from 'lucide-react';
import { QuoteHubSpotModal } from './components/QuoteHubSpotModal';
import { GitHubHelpModal } from './components/GitHubHelpModal';
import { CoilCuttingView } from './components/CoilCuttingView';

const INITIAL_PROJECT: Project = {
  name: "PROJET HELIOS EXPERT",
  levels: [
    { id: 0, name: "Rez-de-chaussée", rooms: [], planOpacity: 0.5, planScale: 1, planOffset: { x: 0, y: 0 }, zoom: 0, viewOffset: { x: 0, y: 0 } },
    { id: 1, name: "Étage 1", rooms: [], planOpacity: 0.5, planScale: 1, planOffset: { x: 0, y: 0 }, zoom: 0, viewOffset: { x: 0, y: 0 } }
  ],
  vents: [],
  plenums: [],
  dimensions: [],
  isoConnections: [],
  obstacles: [],
  unit: null, 
  externalHoods: [],
  shafts: [],
  houseType: 'T4',
  pixelsPerMeter: 60,
  preferences: {
    preferredType: 'Automatique',
    exchangerType: 'Tous',
    passiveHouseOnly: false,
    flowMarginPercent: 15
  }
};

const App: React.FC = () => {
  const [project, setProjectState] = useState<Project>(INITIAL_PROJECT);
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [activeLevel, setActiveLevel] = useState<number>(0);
  const [mode, setMode] = useState<'DESIGN' | 'REPORT'>('DESIGN');
  const [tool, setTool] = useState<any>('SELECT');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentConnectionPath, setCurrentConnectionPath] = useState<Point[]>([]);
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [pendingVent, setPendingVent] = useState<{ pos: Point, type: VentType } | null>(null);
  
  // New Modals and Feedback Toast
  const [showQuoteHubSpot, setShowQuoteHubSpot] = useState(false);
  const [showGitHubHelp, setShowGitHubHelp] = useState(false);
  const [showCoilCuttingModal, setShowCoilCuttingModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  // Set project with Undo history tracking
  const setProject: React.Dispatch<React.SetStateAction<Project>> = useCallback((action) => {
    setProjectState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (next !== prev) {
        setUndoStack(u => [...u.slice(-30), prev]);
        setRedoStack([]);
      }
      return next;
    });
  }, []);

  // Undo Handler (Ctrl+Z)
  const handleUndo = useCallback(() => {
    setUndoStack(prevUndo => {
      if (prevUndo.length === 0) return prevUndo;
      const previous = prevUndo[prevUndo.length - 1];
      const newUndo = prevUndo.slice(0, -1);
      setProjectState(current => {
        setRedoStack(r => [...r, current]);
        return previous;
      });
      setToastMessage("Action annulée (Ctrl+Z)");
      setTimeout(() => setToastMessage(null), 2500);
      return newUndo;
    });
  }, []);

  // Redo Handler (Ctrl+Y / Ctrl+Shift+Z)
  const handleRedo = useCallback(() => {
    setRedoStack(prevRedo => {
      if (prevRedo.length === 0) return prevRedo;
      const next = prevRedo[prevRedo.length - 1];
      const newRedo = prevRedo.slice(0, -1);
      setProjectState(current => {
        setUndoStack(u => [...u, current]);
        return next;
      });
      setToastMessage("Action rétablie (Ctrl+Y)");
      setTimeout(() => setToastMessage(null), 2500);
      return newRedo;
    });
  }, []);

  // Export Project to Local .helios JSON File
  const handleExportProjectFile = useCallback(() => {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const sanitizedName = (project.name || 'Projet_Helios').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateSlug = new Date().toISOString().slice(0, 10);
    const fileName = `${sanitizedName}_${dateSlug}.helios`;
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMessage(`Projet sauvegardé avec succès (${fileName})`);
    setTimeout(() => setToastMessage(null), 4000);
  }, [project]);

  // Import Project from Local .helios File
  const handleImportProjectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.levels || !Array.isArray(parsed.levels)) {
          throw new Error("Format invalide. Le fichier doit contenir les niveaux et réseaux du projet.");
        }
        setUndoStack(u => [...u, project]);
        setRedoStack([]);
        setProjectState(parsed);
        setToastMessage(`Projet "${parsed.name || file.name}" chargé avec succès`);
        setTimeout(() => setToastMessage(null), 4000);
      } catch (err: any) {
        alert("Erreur lors de la lecture du fichier .helios : " + (err.message || 'Format JSON invalide'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [project]);

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleExportProjectFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleExportProjectFile]);

  const autoSizeUnit = useCallback((currentProject: Project) => {
    const aero = calculateAerodynamics(currentProject);
    return aero.recommendedUnit ? aero.recommendedUnit.model : null;
  }, []);

  useEffect(() => {
    const newModel = autoSizeUnit(project);
    if (newModel && project.unit && project.unit.model !== newModel) {
      setProjectState(prev => ({
        ...prev,
        unit: prev.unit ? { ...prev.unit, model: newModel } : null
      }));
    }
  }, [project.vents, project.preferences, autoSizeUnit]);

  const handlePlanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setProject(prev => ({
          ...prev,
          levels: prev.levels.map(l => l.id === activeLevel ? { 
            ...l, 
            backgroundImage: dataUrl,
            planWidth: img.width,
            planHeight: img.height,
            zoom: 0
          } : l)
        }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const deleteElement = (type: string | null, id: string) => {
    setProject(prev => {
      let newState = { ...prev };
      const isIso = prev.isoConnections.some(c => c.id === id);
      const isHood = prev.externalHoods.some(h => h.id === id);
      const isVent = prev.vents.some(v => v.id === id);
      const isPlenum = prev.plenums.some(p => p.id === id);
      const isShaft = prev.shafts?.some(s => s.id === id);
      const isUnit = prev.unit?.id === id;

      // Check if it's a connection ID or ventId in a plenum
      let connVentId: string | null = null;
      let isConn = false;
      for (const p of prev.plenums) {
        const found = p.connections.find(c => c.id === id || c.ventId === id);
        if (found) {
          isConn = true;
          connVentId = found.ventId;
          break;
        }
      }

      if (isConn && connVentId) {
        newState.plenums = prev.plenums.map(p => ({
          ...p,
          connections: p.connections.filter(c => c.id !== id && c.ventId !== id)
        }));
        // If no other plenum connects to this vent, set connected = false
        const stillConnected = newState.plenums.some(p => p.connections.some(c => c.ventId === connVentId));
        if (!stillConnected) {
          newState.vents = prev.vents.map(v => v.id === connVentId ? { ...v, connected: false } : v);
        }
      } else if (isShaft) {
        newState.shafts = (prev.shafts || []).filter(s => s.id !== id);
        // Unlink connections passing through this shaft
        newState.plenums = prev.plenums.map(p => ({
          ...p,
          connections: p.connections.map(c => c.shaftId === id ? { ...c, shaftId: undefined, targetLevelPath: undefined } : c)
        }));
      } else if (isIso) {
        newState.isoConnections = prev.isoConnections.filter(c => c.id !== id);
      } else if (isHood) {
        newState.externalHoods = prev.externalHoods.filter(h => h.id !== id);
      } else if (isVent) {
        newState.vents = prev.vents.filter(v => v.id !== id);
        newState.plenums = prev.plenums.map(p => ({ ...p, connections: p.connections.filter(c => c.ventId !== id) }));
      } else if (isPlenum) {
        newState.plenums = prev.plenums.filter(p => p.id !== id);
        newState.isoConnections = prev.isoConnections.filter(c => c.fromId !== id && c.toId !== id);
        newState.vents = prev.vents.map(v => {
           const isLinked = prev.plenums.find(p => p.id === id)?.connections.some(c => c.ventId === v.id);
           return isLinked ? { ...v, connected: false } : v;
        });
      } else if (isUnit) {
        newState.unit = null;
      }
      return newState;
    });
    setSelectedId(null);
  };

  const moveElement = (id: string, newPos: Point) => {
    setProject(prev => {
      const isVent = prev.vents.some(v => v.id === id);
      const isPlenum = prev.plenums.some(p => p.id === id);
      const isHood = prev.externalHoods.some(h => h.id === id);
      const isShaft = prev.shafts?.some(s => s.id === id);
      const isUnit = prev.unit?.id === id;
      let newState = { ...prev };
      const scale = prev.pixelsPerMeter || 60;
      if (isVent) {
        newState.vents = prev.vents.map(v => v.id === id ? { ...v, pos: newPos } : v);
        newState.plenums = prev.plenums.map(p => ({
          ...p,
          connections: p.connections.map(c => {
            if (c.ventId !== id) return c;
            // If connection spans floors and targetLevelPath exists, update targetLevelPath
            if (c.targetLevelPath && c.targetLevelPath.length > 0) {
              const updatedTargetPath = [...c.targetLevelPath.slice(0, -1), newPos];
              let px1 = 0;
              for (let i = 1; i < c.path.length; i++) px1 += Math.hypot(c.path[i].x - c.path[i-1].x, c.path[i].y - c.path[i-1].y);
              let px2 = 0;
              for (let i = 1; i < updatedTargetPath.length; i++) px2 += Math.hypot(updatedTargetPath[i].x - updatedTargetPath[i-1].x, updatedTargetPath[i].y - updatedTargetPath[i-1].y);
              const newLen = Math.max(1, Math.round(((px1 + px2) / scale + 2.7) * 10) / 10);
              return { ...c, targetLevelPath: updatedTargetPath, length: newLen };
            } else {
              const updatedPath = [...c.path.slice(0, -1), newPos];
              let px = 0;
              for (let i = 1; i < updatedPath.length; i++) px += Math.hypot(updatedPath[i].x - updatedPath[i-1].x, updatedPath[i].y - updatedPath[i-1].y);
              const newLen = Math.max(0.5, Math.round((px / scale) * 10) / 10);
              return { ...c, path: updatedPath, length: newLen };
            }
          })
        }));
      } else if (isShaft) {
        newState.shafts = (prev.shafts || []).map(s => s.id === id ? { ...s, pos: newPos } : s);
        newState.plenums = prev.plenums.map(p => ({
          ...p,
          connections: p.connections.map(c => {
            if (c.shaftId !== id) return c;
            const updatedPath = [...c.path.slice(0, -1), newPos];
            const updatedTargetPath = c.targetLevelPath && c.targetLevelPath.length > 0 
              ? [newPos, ...c.targetLevelPath.slice(1)] 
              : c.targetLevelPath;
            let px1 = 0;
            for (let i = 1; i < updatedPath.length; i++) px1 += Math.hypot(updatedPath[i].x - updatedPath[i-1].x, updatedPath[i].y - updatedPath[i-1].y);
            let px2 = 0;
            if (updatedTargetPath) {
              for (let i = 1; i < updatedTargetPath.length; i++) px2 += Math.hypot(updatedTargetPath[i].x - updatedTargetPath[i-1].x, updatedTargetPath[i].y - updatedTargetPath[i-1].y);
            }
            const newLen = Math.max(1, Math.round(((px1 + px2) / scale + 2.7) * 10) / 10);
            return {
              ...c,
              path: updatedPath,
              targetLevelPath: updatedTargetPath,
              length: newLen
            };
          })
        }));
      } else if (isPlenum) {
        newState.plenums = prev.plenums.map(p => p.id === id ? { ...p, pos: newPos } : p);
        newState.isoConnections = prev.isoConnections.map(c => {
           if (c.fromId === id) return { ...c, path: [newPos, ...c.path.slice(1)] };
           if (c.toId === id) return { ...c, path: [...c.path.slice(0, -1), newPos] };
           return c;
        });
        newState.plenums = newState.plenums.map(p => p.id === id ? {
          ...p,
          connections: p.connections.map(c => ({ ...c, path: [newPos, ...c.path.slice(1)] }))
        } : p);
      } else if (isHood) {
        newState.externalHoods = prev.externalHoods.map(h => h.id === id ? { ...h, pos: newPos } : h);
        newState.isoConnections = prev.isoConnections.map(c => {
           if (c.fromId === id) return { ...c, path: [newPos, ...c.path.slice(1)] };
           if (c.toId === id) return { ...c, path: [...c.path.slice(0, -1), newPos] };
           return c;
        });
      } else if (isUnit) {
        newState.unit = { ...prev.unit!, pos: newPos };
        newState.isoConnections = prev.isoConnections.map(c => {
           if (c.fromId === id) return { ...c, path: [newPos, ...c.path.slice(1)] };
           if (c.toId === id) return { ...c, path: [...c.path.slice(0, -1), newPos] };
           return c;
        });
      }
      return newState;
    });
  };

  const projectFlow = Math.max(
    project.vents.filter(v => v.type === VentType.SOUFFLAGE).reduce((acc, v) => acc + v.flowRate, 0),
    project.vents.filter(v => v.type === VentType.REPRISE).reduce((acc, v) => acc + v.flowRate, 0)
  );

  const saveViewSettings = (levelId: number, zoom: number, offset: Point) => {
    setProject(prev => ({
      ...prev,
      levels: prev.levels.map(l => l.id === levelId ? { ...l, zoom, viewOffset: offset } : l)
    }));
  };

  const handleAutoRoute = (targetVentId?: string) => {
    const result = autoRouteVents(project, targetVentId);
    setProject(result.project);
    return result;
  };

  const togglePlenumType = (plenumId: string) => {
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => {
        if (p.id !== plenumId) return p;
        const newType = p.type === VentType.REPRISE ? VentType.SOUFFLAGE : VentType.REPRISE;
        return {
          ...p,
          type: newType,
          model: newType === VentType.REPRISE ? 'FRS-VK 10-75 (Reprise)' : 'FRS-VK 10-75 (Soufflage)'
        };
      })
    }));
  };

  const updateConnectionPath = (connId: string, newPath: Point[], isTargetFloor = false) => {
    setProject(prev => {
      return {
        ...prev,
        plenums: prev.plenums.map(p => ({
          ...p,
          connections: p.connections.map(c => {
            if (c.id !== connId && c.ventId !== connId) return c;
            const updatedPath = isTargetFloor ? c.path : newPath;
            const updatedTargetPath = isTargetFloor ? newPath : c.targetLevelPath;
            
            let totalPx = 0;
            for (let i = 1; i < updatedPath.length; i++) {
              totalPx += Math.hypot(updatedPath[i].x - updatedPath[i-1].x, updatedPath[i].y - updatedPath[i-1].y);
            }
            if (updatedTargetPath && updatedTargetPath.length > 1) {
              for (let i = 1; i < updatedTargetPath.length; i++) {
                totalPx += Math.hypot(updatedTargetPath[i].x - updatedTargetPath[i-1].x, updatedTargetPath[i].y - updatedTargetPath[i-1].y);
              }
              totalPx += 2.7 * prev.pixelsPerMeter;
            }
            const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

            return {
              ...c,
              path: updatedPath,
              targetLevelPath: updatedTargetPath,
              length: lengthMeters
            };
          })
        }))
      };
    });
  };

  return (
    <div className="flex h-screen bg-[#fafafa] text-slate-900 overflow-hidden font-medium">
      {mode === 'DESIGN' ? (
        <>
          <Sidebar 
            project={project} 
            setProject={setProject} 
            tool={tool} 
            setTool={setTool} 
            setMode={setMode} 
            onPlanUpload={handlePlanUpload} 
            onOpenUnitSelector={() => setShowUnitSelector(true)}
            onAutoRoute={() => handleAutoRoute()}
            onOpenQuoteHubSpot={() => setShowQuoteHubSpot(true)}
            onOpenCutting={() => setShowCoilCuttingModal(true)}
            onOpenGitHub={() => setShowGitHubHelp(true)}
            onExportProjectFile={handleExportProjectFile}
          />
          <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Top Quick Actions Bar */}
            <div className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between z-30 shrink-0 shadow-sm">
              {/* Left: Project title & Undo / Redo & File Save/Open */}
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={project.name} 
                  onChange={(e) => setProject(p => ({ ...p, name: e.target.value }))}
                  className="bg-transparent font-black text-xs uppercase tracking-tight text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-red-600 focus:outline-none transition-all px-1 py-0.5 max-w-[200px]"
                  title="Cliquer pour renommer le projet"
                />

                <div className="h-4 w-px bg-slate-200 mx-1" />

                {/* Undo Button */}
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95"
                  title="Annuler (Ctrl+Z)"
                >
                  <Undo2 size={14} className="text-slate-600" />
                  <span>Annuler</span>
                  {undoStack.length > 0 && <span className="text-[8px] bg-slate-200 px-1.5 py-0.2 rounded-full font-bold">{undoStack.length}</span>}
                </button>

                {/* Redo Button */}
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95"
                  title="Rétablir (Ctrl+Y)"
                >
                  <Redo2 size={14} className="text-slate-600" />
                  <span>Rétablir</span>
                  {redoStack.length > 0 && <span className="text-[8px] bg-slate-200 px-1.5 py-0.2 rounded-full font-bold">{redoStack.length}</span>}
                </button>

                <div className="h-4 w-px bg-slate-200 mx-1" />

                {/* Save .helios */}
                <button
                  onClick={handleExportProjectFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 transition-all active:scale-95 border border-slate-200"
                  title="Sauvegarder le projet en fichier local .helios (Ctrl+S)"
                >
                  <Save size={14} className="text-blue-600" />
                  <span>Sauvegarder (.helios)</span>
                </button>

                {/* Load .helios */}
                <button
                  onClick={() => fileImportRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-700 hover:bg-slate-100 transition-all active:scale-95 border border-slate-200"
                  title="Ouvrir un fichier projet .helios ou .json sauvegardé"
                >
                  <FolderOpen size={14} className="text-amber-600" />
                  <span>Ouvrir</span>
                </button>
                <input 
                  type="file" 
                  ref={fileImportRef} 
                  onChange={handleImportProjectFile} 
                  accept=".helios,.json" 
                  className="hidden" 
                />
              </div>

              {/* Right: Devis & HubSpot CRM + Calpinage + GitHub + Dossier */}
              <div className="flex items-center gap-2.5">
                {/* Devis & HubSpot */}
                <button
                  onClick={() => setShowQuoteHubSpot(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white rounded-xl text-[10px] font-black uppercase shadow-md shadow-red-500/20 active:scale-95 transition-all"
                  title="Consulter le chiffrage détaillé et synchroniser directement le devis avec l'API HubSpot CRM"
                >
                  <DollarSign size={14} />
                  <span>Devis & HubSpot CRM</span>
                </button>

                {/* Plan de Pose / Calpinage 50m */}
                <button
                  onClick={() => setShowCoilCuttingModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase shadow-md active:scale-95 transition-all"
                  title="Visualiser le calpinage et le plan de coupe optimisé des couronnes de 50 m"
                >
                  <Scissors size={14} className="text-amber-400" />
                  <span>Calpinage (50m)</span>
                </button>

                {/* GitHub Guide Modal */}
                <button
                  onClick={() => setShowGitHubHelp(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all"
                  title="Guide d'exportation vers votre compte GitHub et sauvegarde"
                >
                  <Github size={14} />
                  <span>GitHub</span>
                </button>

                {/* Switch to Report View */}
                <button
                  onClick={() => setMode('REPORT')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all"
                >
                  <Sparkles size={14} />
                  <span>Dossier Technique</span>
                </button>
              </div>
            </div>

            <PlanCanvas 
              project={project} 
              activeLevel={activeLevel} 
              setActiveLevel={setActiveLevel}
              tool={tool} 
              setTool={setTool} 
              addVent={(pos, type) => setPendingVent({ pos, type })} 
              addPlenum={(pos, type) => {
                const determinedType = type || (project.plenums.some(p => p.type === VentType.SOUFFLAGE) ? VentType.REPRISE : VentType.SOUFFLAGE);
                setProject(p => ({
                  ...p,
                  plenums: [
                    ...p.plenums,
                    {
                      id: 'plenum_' + Math.random().toString(36).substr(2, 9),
                      type: determinedType,
                      pos,
                      level: activeLevel,
                      connections: [],
                      model: determinedType === VentType.REPRISE ? 'FRS-VK 10-75 (Reprise)' : 'FRS-VK 10-75 (Soufflage)'
                    }
                  ]
                }));
              }}
              onAutoRoute={handleAutoRoute}
              togglePlenumType={togglePlenumType}
              updateConnectionPath={updateConnectionPath}
              addShaft={(pos) => setProject(p => ({
                ...p, 
                shafts: [...(p.shafts || []), {
                  id: 'shaft_' + Math.random().toString(36).substr(2, 9),
                  name: `Trémie T${(p.shafts?.length || 0) + 1}`,
                  pos,
                  width: 0.45,
                  height: 0.45,
                  fromLevel: 0,
                  toLevel: 1
                }]
              }))}
              connectVentToPlenum={(plId, vId, path, targetLevelPath, shaftId, fromLevel, toLevel) => {
                setProject(prev => {
                  const vent = prev.vents.find(v => v.id === vId);
                  if (!vent) return prev;
                  const ducts = Math.ceil(vent.flowRate / 30);
                  let calculatedLength = 0;
                  for (let i = 1; i < path.length; i++) {
                    calculatedLength += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
                  }
                  if (targetLevelPath && targetLevelPath.length > 1) {
                    for (let i = 1; i < targetLevelPath.length; i++) {
                      calculatedLength += Math.hypot(targetLevelPath[i].x - targetLevelPath[i-1].x, targetLevelPath[i].y - targetLevelPath[i-1].y);
                    }
                    calculatedLength += 2.7 * prev.pixelsPerMeter; // Traversée verticale dalle/trémie (2.7m)
                  }
                  const lengthMeters = Math.max(1, Math.round((calculatedLength / prev.pixelsPerMeter) * 10) / 10);
                  const connFrom = fromLevel !== undefined ? fromLevel : activeLevel;
                  const connTo = toLevel !== undefined ? toLevel : (vent.level !== undefined ? vent.level : activeLevel);
                  const newConn = { 
                    id: 'conn_' + Math.random().toString(36).substr(2, 9),
                    ventId: vId, 
                    path, 
                    targetLevelPath,
                    shaftId,
                    length: lengthMeters, 
                    fromLevel: connFrom, 
                    toLevel: connTo, 
                    ductsCount: ducts 
                  };
                  return { 
                    ...prev, 
                    vents: prev.vents.map(v => v.id === vId ? {...v, connected: true} : v), 
                    plenums: prev.plenums.map(p => p.id === plId ? {...p, connections: [...p.connections, newConn]} : p)
                  };
                });
              }} 
              addExternalHood={(pos, type) => setProject(p => ({...p, externalHoods: [...p.externalHoods, {id: Math.random().toString(36).substr(2,9), pos, level: activeLevel, type}]}))}
              addIsoConnection={(fromId, toId, path, type) => setProject(prev => {
                let calculatedLength = 0;
                for (let i = 1; i < path.length; i++) {
                  calculatedLength += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
                }
                const lengthMeters = Math.max(0.5, Math.round((calculatedLength / prev.pixelsPerMeter) * 10) / 10);
                return {
                  ...prev, 
                  isoConnections: [...prev.isoConnections, {
                    id: Math.random().toString(36).substr(2,9), 
                    fromId, 
                    toId, 
                    path, 
                    length: lengthMeters, 
                    diameter: 160, 
                    type, 
                    pressureLoss: Math.round(lengthMeters * 1.5 * 10) / 10
                  }]
                };
              })}
              moveElement={moveElement}
              setUnit={(pos) => {
                const autoModel = autoSizeUnit(project) || 'Helios KWL 300 W';
                setProject(p => ({...p, unit: p.unit ? {...p.unit, pos, level: activeLevel} : { id:'unit', model: autoModel, pos, level: activeLevel }}))
              }} 
              setProject={setProject} 
              deleteElement={deleteElement} 
              selectedId={selectedId} 
              setSelectedId={setSelectedId} 
              connectionSource={null} 
              setConnectionSource={() => {}}
              currentPath={currentConnectionPath}
              setCurrentPath={setCurrentConnectionPath}
              onOpenUnitSelector={() => setShowUnitSelector(true)}
              onPlanUpload={handlePlanUpload}
              onViewChange={(zoom, offset) => saveViewSettings(activeLevel, zoom, offset)}
            />
            {pendingVent && (
              <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-300">
                  <div className="bg-slate-950 p-8 flex items-center justify-between text-white border-b border-white/10">
                    <div className="flex items-center gap-5">
                      <div className={`p-4 rounded-2xl shadow-lg ${pendingVent.type === VentType.REPRISE ? 'bg-red-600 shadow-red-500/20' : 'bg-blue-600 shadow-blue-500/20'}`}><Wind size={24} /></div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Configuration Bouche</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Sélection du type de pièce</p>
                      </div>
                    </div>
                    <button onClick={() => setPendingVent(null)} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-all"><CloseIcon size={20}/></button>
                  </div>
                  <div className="p-10 grid grid-cols-2 gap-4">
                    {(pendingVent.type === VentType.REPRISE ? ROOM_CATEGORIES.EXTRACT : ROOM_CATEGORIES.SUPPLY).map(room => (
                      <button key={room} onClick={() => {
                        const flow = DTU_FLOW_RATES[project.houseType][room] || 30;
                        setProject(prev => ({...prev, vents: [...prev.vents, {id: Math.random().toString(36).substr(2,9), type: pendingVent.type, roomId: room, pos: pendingVent.pos, level: activeLevel, flowRate: flow, ductsCount: Math.ceil(flow/30), connected: false}]}));
                        setPendingVent(null);
                        setTool('SELECT');
                      }} className="group flex flex-col items-start p-6 rounded-3xl border-2 border-slate-100 bg-slate-50 hover:border-red-600 hover:bg-white transition-all">
                        <span className="text-sm font-black uppercase tracking-tight text-slate-900 group-hover:text-red-600">{room}</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-1">Débit standard: {DTU_FLOW_RATES[project.houseType][room] || 30} m³/h</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <RightSidebar 
            project={project} 
            updateVentFlow={(id, flow) => setProject(prev => ({...prev, vents: prev.vents.map(v => v.id === id ? {...v, flowRate: flow, ductsCount: Math.ceil(flow/30)} : v)}))} 
            deleteVent={(id) => deleteElement('VENT', id)}
            deleteElement={deleteElement}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onAutoRoute={handleAutoRoute}
          />
          {showUnitSelector && (
            <UnitSelector 
              project={project} 
              setProject={setProject} 
              selectedModel={project.unit?.model || ''} 
              onSelect={(model) => { 
                setProject(p => ({
                  ...p, 
                  unit: p.unit ? { ...p.unit, model } : { id: 'unit', model, pos: { x: 500, y: 500 }, level: activeLevel } 
                })); 
                setShowUnitSelector(false); 
              }} 
              onClose={() => setShowUnitSelector(false)} 
            />
          )}
        </>
      ) : (
        <Report project={project} onBack={() => setMode('DESIGN')} />
      )}

      {/* Quote & HubSpot CRM Modal */}
      {showQuoteHubSpot && (
        <QuoteHubSpotModal 
          project={project} 
          onClose={() => setShowQuoteHubSpot(false)} 
        />
      )}

      {/* GitHub Help & Export Modal */}
      {showGitHubHelp && (
        <GitHubHelpModal 
          project={project} 
          onClose={() => setShowGitHubHelp(false)} 
          onExportLocalProject={handleExportProjectFile} 
        />
      )}

      {/* Coil Cutting On-Site Modal */}
      {showCoilCuttingModal && (
        <div className="fixed inset-0 z-[160] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="bg-slate-950 p-6 flex items-center justify-between text-white border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-600 rounded-2xl text-white shadow-lg shadow-red-600/30">
                  <Scissors size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Fiche de Pose Chantier & Calpinage Gaines (50 m)</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Découpe sans chutes des gaines FlexPipe 75 & Bagues d'équilibrage FRS-DR 75
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowCoilCuttingModal(false)} 
                className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              <CoilCuttingView project={project} />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold text-slate-400">Également intégré en Page 8 de votre Dossier Technique A4</span>
              <button 
                onClick={() => setShowCoilCuttingModal(false)} 
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-all active:scale-95 shadow"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action / Undo / Save Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-950 text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 z-[200] animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-black uppercase tracking-wider">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default App;
