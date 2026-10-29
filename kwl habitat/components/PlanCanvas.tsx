
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Project, Point, VentType, IsoConnection, Shaft } from '../types';
import { ISOPIPE_STYLES } from '../constants';
import { 
  Target, Image as ImageIcon, Ruler, Trash2, ZoomIn, ZoomOut, Maximize, Plus, 
  Grid, Home, Navigation, MousePointer2, UploadCloud, Crosshair, Settings, 
  Move, Hand, Magnet, Sparkles, CornerDownRight, Check, Layers, ArrowUpDown, ChevronRight, Zap
} from 'lucide-react';
import { 
  getOrthoPoint, createOrthoSegment, simplifyCollinearPoints, 
  orthogonalizeFullPath, snapPointToGrid, snapValue,
  getMultiDuctOffsets, generateParallelOffsetPath
} from '../utils/ortho';

interface PlanCanvasProps {
  project: Project;
  activeLevel: number;
  setActiveLevel: (id: number) => void;
  tool: string;
  setTool: (t: any) => void;
  addVent: (pos: Point, type: VentType) => void;
  addPlenum: (pos: Point, type?: VentType) => void;
  addShaft?: (pos: Point) => void;
  addExternalHood: (pos: Point, type: string) => void;
  addIsoConnection: (fromId: string, toId: string, path: Point[], type: string) => void;
  connectVentToPlenum: (plenumId: string, ventId: string, path: Point[], targetLevelPath?: Point[], shaftId?: string, fromLevel?: number, toLevel?: number) => void;
  moveElement: (id: string, newPos: Point) => void;
  setUnit: (pos: Point) => void;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  deleteElement: (type: any, id: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  connectionSource: any;
  setConnectionSource: (src: any) => void;
  currentPath: Point[];
  setCurrentPath: (path: Point[]) => void;
  onOpenUnitSelector: () => void;
  onPlanUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewChange?: (zoom: number, offset: Point) => void;
  onAutoRoute?: (targetVentId?: string) => any;
  togglePlenumType?: (plenumId: string) => void;
  updateConnectionPath?: (connId: string, newPath: Point[], isTargetFloor?: boolean) => void;
}

export const getSmoothPath = (path: Point[], pixelsPerMeter: number, radiusMeters = 0.35) => {
  if (path.length < 2) return "";
  if (path.length === 2) return `M ${path[0].x} ${path[0].y} L ${path[1].x} ${path[1].y}`;
  const radius = radiusMeters * pixelsPerMeter;
  let d = `M ${path[0].x} ${path[0].y}`;
  for (let i = 1; i < path.length - 1; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    const p2 = path[i + 1];
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const cp1 = { x: p1.x - (v1.x / len1) * r, y: p1.y - (v1.y / len1) * r };
    const cp2 = { x: p1.x + (v2.x / len2) * r, y: p1.y + (v2.y / len2) * r }; 
    d += ` L ${cp1.x} ${cp1.y} Q ${p1.x} ${p1.y} ${cp2.x} ${cp2.y}`;
  }
  d += ` L ${path[path.length - 1].x} ${path[path.length - 1].y}`;
  return d;
};

export interface PlanBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * Computes the auto-fit bounding box encompassing all architectural and MEP elements on a level
 */
export const getLevelPlanBounds = (project: Project, levelId: number): PlanBounds => {
  const level = project.levels.find(l => l.id === levelId);
  const scale = project.pixelsPerMeter || 60;
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePoint = (x: number, y: number, margin = 30) => {
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return;
    if (x - margin < minX) minX = x - margin;
    if (y - margin < minY) minY = y - margin;
    if (x + margin > maxX) maxX = x + margin;
    if (y + margin > maxY) maxY = y + margin;
  };

  // 1. Plan background image if present
  if (level?.backgroundImage) {
    const w = level.planWidth || 1600;
    const h = level.planHeight || 1200;
    includePoint(0, 0, 0);
    includePoint(w, h, 0);
  }

  // 2. Vents on this level
  project.vents.filter(v => v.level === levelId).forEach(v => {
    includePoint(v.pos.x, v.pos.y, 0.45 * scale + 40);
  });

  // 3. Plenums on this level
  project.plenums.filter(p => p.level === levelId).forEach(p => {
    includePoint(p.pos.x, p.pos.y, 0.45 * scale + 25);
  });

  // 4. KWL Unit if on this level
  if (project.unit && project.unit.level === levelId) {
    includePoint(project.unit.pos.x, project.unit.pos.y, 0.65 * scale + 30);
  }

  // 5. Shafts (Trémies)
  (project.shafts || []).forEach(s => {
    const minL = Math.min(s.fromLevel, s.toLevel);
    const maxL = Math.max(s.fromLevel, s.toLevel);
    if (levelId >= minL && levelId <= maxL) {
      includePoint(s.pos.x, s.pos.y, 0.5 * scale + 40);
    }
  });

  // 6. External hoods
  project.externalHoods.filter(h => h.level === levelId).forEach(h => {
    includePoint(h.pos.x, h.pos.y, 0.45 * scale + 25);
  });

  // 7. Flexpipe duct paths on this level
  project.plenums.forEach(p => {
    p.connections.forEach(c => {
      let pathPts: Point[] | null = null;
      if (c.shaftId) {
        if (c.fromLevel === levelId && c.path && c.path.length > 0) pathPts = c.path;
        else if (c.toLevel === levelId && c.targetLevelPath && c.targetLevelPath.length > 0) pathPts = c.targetLevelPath;
      } else {
        if (c.fromLevel === levelId || (c.fromLevel === undefined && p.level === levelId)) {
          pathPts = c.path;
        }
      }
      if (pathPts) {
        pathPts.forEach(pt => includePoint(pt.x, pt.y, 20));
      }
    });
  });

  // 8. Isopipe connections
  project.isoConnections.forEach(c => {
    if (c.path && c.path.length > 0) {
      c.path.forEach(pt => includePoint(pt.x, pt.y, 30));
    }
  });

  // Fallback if completely empty
  if (minX === Infinity || maxX === -Infinity) {
    minX = 0;
    minY = 0;
    maxX = 1200;
    maxY = 800;
  }

  // Padding
  const rawW = Math.max(maxX - minX, 400);
  const rawH = Math.max(maxY - minY, 280);
  const padX = Math.max(rawW * 0.05, 30);
  const padY = Math.max(rawH * 0.05, 30);

  return {
    minX: Math.round(minX - padX),
    minY: Math.round(minY - padY),
    width: Math.round(rawW + 2 * padX),
    height: Math.round(rawH + 2 * padY)
  };
};

export const renderPlanSVG = (
  project: Project, 
  levelId: number, 
  zoom: number, 
  offset: Point, 
  isPrinting = false, 
  selectedId: string | null = null,
  onSelectElement?: (id: string) => void
) => {
  const scale = project.pixelsPerMeter;
  const level = project.levels.find(l => l.id === levelId);
  if (!level) return null;

  const imageWidth = level.planWidth || 1600;
  const imageHeight = level.planHeight || 1200;

  return (
    <g transform={isPrinting ? (offset.x !== 0 || offset.y !== 0 ? `translate(${offset.x}, ${offset.y})` : undefined) : `translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
      <defs>
        {!isPrinting && (
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="1" dy="1" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      {level.backgroundImage && (
        <image 
          href={level.backgroundImage} 
          xlinkHref={level.backgroundImage}
          x="0" 
          y="0" 
          width={imageWidth} 
          height={imageHeight} 
          opacity={isPrinting ? 1 : 0.6}
          preserveAspectRatio="none"
        />
      )}
      
      {/* ISOPIPE MAIN DUCTS */}
      {project.isoConnections.map(c => (
        <g key={c.id}>
          <path 
            d={getSmoothPath(c.path, scale, 0.45)} 
            fill="none" 
            stroke={ISOPIPE_STYLES[c.type]?.color} 
            strokeWidth={(c.diameter/1000)*scale} 
            strokeLinecap="round"
            opacity="0.95" 
          />
        </g>
      ))}

      {/* TRÉMIES / GAINES TECHNIQUES (Spanning floors) */}
      {(project.shafts || []).map(shaft => {
        const minL = Math.min(shaft.fromLevel, shaft.toLevel);
        const maxL = Math.max(shaft.fromLevel, shaft.toLevel);
        if (levelId < minL || levelId > maxL) return null;
        const isSelected = selectedId === shaft.id;
        const w = (shaft.width || 0.45) * scale;
        const h = (shaft.height || 0.45) * scale;

        // Conduits passing through this shaft
        const ductsInShaft = project.plenums.flatMap(p => 
          p.connections.filter(c => c.shaftId === shaft.id).map(c => {
            const vent = project.vents.find(v => v.id === c.ventId);
            const isReprise = vent?.type === VentType.REPRISE || p.type === VentType.REPRISE;
            return {
              conn: c,
              vent,
              isReprise,
              count: c.ductsCount || 1,
              room: vent?.roomId || 'Bouche'
            };
          })
        );
        const supplyTubes = ductsInShaft.filter(d => !d.isReprise).reduce((acc, d) => acc + d.count, 0);
        const extractTubes = ductsInShaft.filter(d => d.isReprise).reduce((acc, d) => acc + d.count, 0);
        const totalTubes = supplyTubes + extractTubes;
        
        return (
          <g 
            key={shaft.id} 
            transform={`translate(${shaft.pos.x}, ${shaft.pos.y})`}
            className="cursor-pointer pointer-events-auto select-none"
            onClick={(e) => { e.stopPropagation(); onSelectElement?.(shaft.id); }}
          >
            {/* Selection Halo */}
            {isSelected && (
              <rect 
                x={-w/2 - 6/zoom} 
                y={-h/2 - 6/zoom} 
                width={w + 12/zoom} 
                height={h + 12/zoom} 
                rx={6/zoom}
                fill="rgba(245, 158, 11, 0.15)"
                stroke="#f59e0b"
                strokeWidth={2/zoom}
                strokeDasharray="4,4"
              />
            )}
            {/* Shaft Base Box */}
            <rect 
              x={-w/2} 
              y={-h/2} 
              width={w} 
              height={h} 
              rx={4/zoom}
              fill="#0f172a" 
              stroke={isSelected ? '#f59e0b' : '#475569'} 
              strokeWidth={2.5/zoom}
            />
            {/* Architectural Cross Hatch (X) */}
            <line x1={-w/2} y1={-h/2} x2={w/2} y2={h/2} stroke="#334155" strokeWidth={1.5/zoom} />
            <line x1={-w/2} y1={h/2} x2={w/2} y2={-h/2} stroke="#334155" strokeWidth={1.5/zoom} />

            {/* Individual Penetration Ducts Rendered Inside the Shaft (MEP Cross-Section) */}
            {totalTubes > 0 ? (
              <g>
                {(() => {
                  const tubeRadius = Math.min(w, h) * 0.14;
                  // Grid arrangement inside the shaft
                  const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(totalTubes))));
                  const tubeElements: React.ReactNode[] = [];
                  let currentIdx = 0;

                  // First Supply tubes (Blue)
                  for (let s = 0; s < supplyTubes; s++) {
                    const row = Math.floor(currentIdx / cols);
                    const col = currentIdx % cols;
                    const totalRows = Math.ceil(totalTubes / cols);
                    const cx = (col - (cols - 1) / 2) * (tubeRadius * 2.3);
                    const cy = (row - (totalRows - 1) / 2) * (tubeRadius * 2.3);
                    tubeElements.push(
                      <g key={`shaft-tube-s-${s}`}>
                        <circle cx={cx} cy={cy} r={tubeRadius} fill="#1e3a8a" stroke="#60a5fa" strokeWidth={1.5/zoom} />
                        <circle cx={cx} cy={cy} r={tubeRadius * 0.45} fill="#93c5fd" />
                      </g>
                    );
                    currentIdx++;
                  }

                  // Then Extract tubes (Red)
                  for (let r = 0; r < extractTubes; r++) {
                    const row = Math.floor(currentIdx / cols);
                    const col = currentIdx % cols;
                    const totalRows = Math.ceil(totalTubes / cols);
                    const cx = (col - (cols - 1) / 2) * (tubeRadius * 2.3);
                    const cy = (row - (totalRows - 1) / 2) * (tubeRadius * 2.3);
                    tubeElements.push(
                      <g key={`shaft-tube-r-${r}`}>
                        <circle cx={cx} cy={cy} r={tubeRadius} fill="#7f1d1d" stroke="#f87171" strokeWidth={1.5/zoom} />
                        <circle cx={cx} cy={cy} r={tubeRadius * 0.45} fill="#fca5a5" />
                      </g>
                    );
                    currentIdx++;
                  }

                  return tubeElements;
                })()}
              </g>
            ) : (
              /* Center Shaft Emblem if no ducts yet */
              <>
                <circle cx={0} cy={0} r={w * 0.22} fill="#1e293b" stroke="#f59e0b" strokeWidth={1.5/zoom} />
                <text 
                  y={2.5/zoom} 
                  textAnchor="middle" 
                  style={{ fontSize: `${7.5/zoom}px`, fill: '#f59e0b', fontWeight: 900 }}
                >
                  T
                </text>
              </>
            )}

            {/* Shaft Header Badge */}
            <g transform={`translate(0, ${-h/2 - 9/zoom})`}>
              <rect 
                x={-42/zoom} 
                y={-7/zoom} 
                width={84/zoom} 
                height={14/zoom} 
                rx={3/zoom}
                fill="rgba(15, 23, 42, 0.95)"
                stroke={isSelected ? '#f59e0b' : '#334155'}
                strokeWidth={1/zoom}
              />
              <text 
                y={3/zoom} 
                textAnchor="middle" 
                style={{ fontSize: `${7.5/zoom}px`, fill: '#f8fafc', fontWeight: 900 }}
              >
                {shaft.name.toUpperCase()} (RDC ⇄ R+1)
              </text>
            </g>

            {/* Sub-badge: Duct Penetration Count */}
            {totalTubes > 0 && (
              <g transform={`translate(0, ${h/2 + 9/zoom})`}>
                <rect 
                  x={-50/zoom} 
                  y={-6/zoom} 
                  width={100/zoom} 
                  height={12/zoom} 
                  rx={3/zoom}
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke={isSelected ? '#f59e0b' : '#475569'}
                  strokeWidth={0.8/zoom}
                />
                <text 
                  y={2.5/zoom} 
                  textAnchor="middle" 
                  style={{ fontSize: `${6.5/zoom}px`, fill: '#fcd34d', fontWeight: 900 }}
                >
                  {totalTubes} tubes ({supplyTubes} Souf. / {extractTubes} Rep.)
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* FLEXPIPE CORRUGATED DUCTS (Side-by-Side Parallel Offset - No Superposition) */}
      {project.plenums.flatMap(p => 
        p.connections.map((c, i) => {
          const vent = project.vents.find(v => v.id === c.ventId);
          // Red for Reprise, Blue for Soufflage
          const isReprise = vent?.type === VentType.REPRISE || p.type === VentType.REPRISE;
          const connId = c.id || c.ventId;
          const isSelected = selectedId === connId || selectedId === c.ventId;

          // Determine segment for current level
          let currentFloorPath: Point[] | null = null;
          let isShaftRiser = false;
          let riserDirection: 'UP' | 'DOWN' | null = null;
          let riserPos: Point | null = null;

          if (c.shaftId) {
            // Multi-floor connection
            if (c.fromLevel === levelId && c.path && c.path.length > 1) {
              currentFloorPath = c.path;
              isShaftRiser = true;
              riserDirection = (c.toLevel || 1) > c.fromLevel ? 'UP' : 'DOWN';
              riserPos = c.path[c.path.length - 1];
            } else if (c.toLevel === levelId && c.targetLevelPath && c.targetLevelPath.length > 1) {
              currentFloorPath = c.targetLevelPath;
              isShaftRiser = true;
              riserDirection = (c.fromLevel || 0) < c.toLevel ? 'DOWN' : 'UP';
              riserPos = c.targetLevelPath[0];
            }
          } else {
            // Single-floor connection
            if (c.fromLevel === levelId || (c.fromLevel === undefined && p.level === levelId)) {
              currentFloorPath = c.path;
            }
          }

          if (!currentFloorPath || currentFloorPath.length < 2) return null;

          // Color schemes
          const mainColor = isReprise ? '#dc2626' : '#2563eb';
          const ribColor = isReprise ? '#fca5a5' : '#93c5fd';
          const casingColor = isReprise ? '#7f1d1d' : '#1e3a8a';

          const ductsCount = Math.max(1, c.ductsCount || 1);
          // Helios FRS 75 tube width
          const singleDuctRadius = Math.max(0.038 * scale, 3.8 / zoom);
          const ductWidth = singleDuctRadius * 2;
          const spacing = Math.max(ductWidth * 1.35, 11 / zoom);
          const offsets = getMultiDuctOffsets(ductsCount, spacing);

          return (
            <g 
              key={`conn-${p.id}-${c.id || i}`}
              className="cursor-pointer pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); onSelectElement?.(connId); }}
            >
              {/* Wide invisible hit area for easy selection */}
              <path 
                d={getSmoothPath(currentFloorPath, scale, 0.35)}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(spacing * ductsCount + 18 / zoom, 26 / zoom)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Selection Halo */}
              {isSelected && (
                <path 
                  d={getSmoothPath(currentFloorPath, scale, 0.35)}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={spacing * ductsCount + 8 / zoom}
                  strokeLinecap="round"
                  strokeDasharray="8,6"
                  opacity="0.8"
                />
              )}

              {/* Individual Multi-duct Tubes Side-by-Side (Anti-Superposition) */}
              {offsets.map((offsetVal, ductIdx) => {
                const ductPathPts = generateParallelOffsetPath(currentFloorPath!, offsetVal);
                const ductSvgD = getSmoothPath(ductPathPts, scale, 0.35);

                return (
                  <g key={ductIdx}>
                    {/* Outer Casing / Drop Shadow */}
                    <path 
                      d={ductSvgD}
                      fill="none"
                      stroke={casingColor}
                      strokeWidth={ductWidth + 2.2 / zoom}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.9"
                    />

                    {/* Base Solid Colored Duct */}
                    <path 
                      d={ductSvgD}
                      fill="none"
                      stroke={mainColor}
                      strokeWidth={ductWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.95"
                    />

                    {/* Helios Corrugated Ribs (Cannelures annelées FRS 75) */}
                    <path 
                      d={ductSvgD}
                      fill="none"
                      stroke={ribColor}
                      strokeWidth={ductWidth * 0.72}
                      strokeDasharray={`${3.5 / zoom},${3.5 / zoom}`}
                      strokeLinecap="butt"
                      opacity="0.85"
                    />

                    {/* Inner highlight core stripe */}
                    <path 
                      d={ductSvgD}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={1.5 / zoom}
                      opacity="0.35"
                    />
                  </g>
                );
              })}

              {/* Vertical Shaft Riser/Descent Indicator Badge */}
              {isShaftRiser && riserPos && (
                <g transform={`translate(${riserPos.x}, ${riserPos.y - 12 / zoom})`} className="select-none pointer-events-none">
                  <rect 
                    x={-35 / zoom} 
                    y={-8 / zoom} 
                    width={70 / zoom} 
                    height={16 / zoom} 
                    rx={4 / zoom}
                    fill="#0f172a"
                    stroke={mainColor}
                    strokeWidth={1.5 / zoom}
                  />
                  <text 
                    y={3 / zoom} 
                    textAnchor="middle" 
                    style={{ fontSize: `${7.5 / zoom}px`, fill: '#ffffff', fontWeight: 900 }}
                  >
                    {riserDirection === 'UP' ? '▲ Vers Étage 1' : '▼ Depuis RDC'}
                  </text>
                </g>
              )}
            </g>
          );
        })
      )}
      
      {/* PLENUMS */}
      {project.plenums.filter(p => p.level === levelId).map(p => {
        const isPlenumSelected = selectedId === p.id;
        const isReprisePlenum = p.type === VentType.REPRISE || p.connections.some(c => {
          const v = project.vents.find(vent => vent.id === c.ventId);
          return v?.type === VentType.REPRISE;
        });
        const plenumColor = isReprisePlenum ? '#dc2626' : '#2563eb';

        return (
          <g key={p.id} transform={`translate(${p.pos.x}, ${p.pos.y})`} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); onSelectElement?.(p.id); }}>
            {isPlenumSelected && <circle r={0.4*scale} fill={`${plenumColor}22`} stroke={plenumColor} strokeWidth="2" strokeDasharray="4,4" />}
            <rect x={-0.22*scale} y={-0.22*scale} width={0.44*scale} height={0.44*scale} rx="4" fill="#0f172a" stroke={isPlenumSelected ? plenumColor : '#fff'} strokeWidth="2.5" />
            <text y={3/zoom} textAnchor="middle" style={{ fontSize: `${7/zoom}px`, fill: '#ffffff', fontWeight: 900 }}>FRS</text>
          </g>
        );
      })}
      
      {project.externalHoods.map(h => (
        <g key={h.id} transform={`translate(${h.pos.x}, ${h.pos.y})`}>
          {selectedId === h.id && <circle r={0.3*scale} fill="rgba(227,6,19,0.15)" stroke="rgba(227,6,19,0.5)" strokeWidth="2" strokeDasharray="4,4" />}
          {h.type === 'IP-FKB' ? (
            <g>
               <rect x={-0.15*scale} y={-0.15*scale} width={0.3*scale} height={0.3*scale} fill="#fff" stroke={selectedId === h.id ? '#e30613' : '#0f172a'} strokeWidth="2" />
               <line x1={-0.15*scale} y1={-0.15*scale} x2={0.15*scale} y2={0.15*scale} stroke="#0f172a" strokeWidth="1" />
               <line x1={-0.15*scale} y1={0.15*scale} x2={0.15*scale} y2={-0.15*scale} stroke="#0f172a" strokeWidth="1" />
            </g>
          ) : (
            <g>
               <circle r={0.15*scale} fill="#fff" stroke={selectedId === h.id ? '#e30613' : '#0f172a'} strokeWidth="2" />
               <path d={`M ${-0.1*scale} ${0.05*scale} L 0 ${-0.12*scale} L ${0.1*scale} ${0.05*scale}`} fill="none" stroke="#0f172a" strokeWidth="2" />
            </g>
          )}
        </g>
      ))}
      
      {project.unit && project.unit.level === levelId && (
        <g transform={`translate(${project.unit.pos.x}, ${project.unit.pos.y})`}>
          {selectedId === project.unit.id && <rect x={-0.55*scale} y={-0.55*scale} width={1.1*scale} height={1.1*scale} rx="12" fill="rgba(227,6,19,0.1)" stroke="rgba(227,6,19,0.4)" strokeWidth="2" strokeDasharray="4,4" />}
          <rect x={-0.45*scale} y={-0.45*scale} width={0.9*scale} height={0.9*scale} rx="6" fill="#0f172a" stroke={selectedId === project.unit.id ? '#fff' : '#e30613'} strokeWidth="4" />
          <path d={`M ${-0.3*scale} ${-0.45*scale} L ${-0.3*scale} ${-0.55*scale} M ${0.3*scale} ${-0.45*scale} L ${0.3*scale} ${-0.55*scale}`} stroke="#0f172a" strokeWidth="12" strokeLinecap="round" />
        </g>
      )}
      
      {project.vents.filter(v => v.level === levelId).map(v => {
        const isSelected = selectedId === v.id;
        const color = v.type === VentType.SOUFFLAGE ? '#2563eb' : '#e30613';
        const isSoufflage = v.type === VentType.SOUFFLAGE;
        const ventRadius = 0.14 * scale;
        const roomText = (v.roomId || 'Bouche').toUpperCase();
        const flowText = `${v.flowRate} m³/h`;
        const badgeWidth = Math.max(roomText.length * 6.5 + 24, flowText.length * 6.5 + 24, 70) / zoom;
        const badgeHeight = 26 / zoom;
        const badgeY = ventRadius + 7 / zoom;
        
        return (
          <g key={v.id} transform={`translate(${v.pos.x}, ${v.pos.y})`} className="cursor-pointer pointer-events-auto select-none">
            {/* Selection Halo */}
            {isSelected && (
              <circle 
                r={ventRadius + 8 / zoom} 
                fill={`${color}18`} 
                stroke={color} 
                strokeWidth={2 / zoom} 
                strokeDasharray="4,4" 
              />
            )}
            
            {/* Vent Outer Flange / Collar */}
            <circle 
              r={ventRadius} 
              fill="white" 
              stroke={color} 
              strokeWidth={isSelected ? 4 / zoom : 2.5 / zoom} 
              filter={isPrinting ? undefined : "url(#shadow)"} 
            />
            
            {/* Vent Inner Aeration Ring */}
            <circle 
              r={ventRadius * 0.65} 
              fill={isSoufflage ? '#eff6ff' : '#fef2f2'} 
              stroke={color} 
              strokeWidth={1.5 / zoom} 
            />
            
            {/* Vent Center Aeration Symbol */}
            {isSoufflage ? (
              <g stroke={color} strokeWidth={2 / zoom} strokeLinecap="round">
                <line x1={-ventRadius * 0.42} y1={0} x2={ventRadius * 0.42} y2={0} />
                <line x1={0} y1={-ventRadius * 0.42} x2={0} y2={ventRadius * 0.42} />
                <circle cx={0} cy={0} r={1.5 / zoom} fill={color} />
              </g>
            ) : (
              <g stroke={color} strokeWidth={1.8 / zoom} strokeLinecap="round">
                <line x1={-ventRadius * 0.38} y1={-ventRadius * 0.24} x2={ventRadius * 0.38} y2={-ventRadius * 0.24} />
                <line x1={-ventRadius * 0.42} y1={0} x2={ventRadius * 0.42} y2={0} />
                <line x1={-ventRadius * 0.38} y1={ventRadius * 0.24} x2={ventRadius * 0.38} y2={ventRadius * 0.24} />
              </g>
            )}

            {/* Technical Callout Badge: Room Name & Flow Rate */}
            <g transform={`translate(0, ${badgeY})`}>
              <rect 
                x={-badgeWidth / 2} 
                y={0} 
                width={badgeWidth} 
                height={badgeHeight} 
                rx={6 / zoom} 
                fill="rgba(255, 255, 255, 0.96)" 
                stroke={isSelected ? color : '#cbd5e1'} 
                strokeWidth={(isSelected ? 2 : 1) / zoom} 
                filter="url(#shadow)"
              />
              
              <circle 
                cx={-badgeWidth / 2 + 8 / zoom} 
                cy={badgeHeight / 2} 
                r={3 / zoom} 
                fill={color} 
              />

              <text 
                x={4 / zoom}
                y={11 / zoom} 
                textAnchor="middle" 
                className="font-black tracking-tight"
                style={{ fontSize: `${8.5 / zoom}px`, fill: '#0f172a' }}
              >
                {roomText}
              </text>
              
              <text 
                x={4 / zoom}
                y={21.5 / zoom} 
                textAnchor="middle" 
                className="font-bold"
                style={{ fontSize: `${8 / zoom}px`, fill: color }}
              >
                {flowText}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
};

const PlanCanvas: React.FC<PlanCanvasProps> = ({ 
  project, activeLevel, setActiveLevel, tool, setTool, addVent, addPlenum, addShaft, addExternalHood, 
  addIsoConnection, connectVentToPlenum, moveElement, setUnit, setProject, deleteElement, 
  selectedId, setSelectedId, currentPath, setCurrentPath, onOpenUnitSelector, onPlanUpload, onViewChange,
  onAutoRoute, togglePlenumType, updateConnectionPath
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const level = project.levels[activeLevel];
  const [zoom, setZoom] = useState(level.zoom || 1);
  const [offset, setOffset] = useState<Point>(level.viewOffset || { x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [calibrationStart, setCalibrationStart] = useState<Point | null>(null);
  const [calibrationEnd, setCalibrationEnd] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [calibValue, setCalibValue] = useState("1.00");
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isOrthoLocked, setIsOrthoLocked] = useState(true);
  const [gridSnapSize, setGridSnapSize] = useState<number>(0.25); // in meters (0.10, 0.25, 0.50, 0 = off)
  const [showVisualGrid, setShowVisualGrid] = useState(true);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [justAligned, setJustAligned] = useState(false);

  // Editable Waypoints for selected FlexPipe connection
  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    connId: string;
    pointIndex: number;
    isTargetFloor: boolean;
  } | null>(null);

  // Auto-route notification banner
  const [autoRouteToast, setAutoRouteToast] = useState<string | null>(null);

  const unconnectedVentsCount = useMemo(() => {
    return project.vents.filter(v => !v.connected).length;
  }, [project.vents]);

  const handleRunAutoRoute = (targetVentId?: string) => {
    if (onAutoRoute) {
      const res = onAutoRoute(targetVentId);
      if (res?.summaryText) {
        setAutoRouteToast(res.summaryText);
        setTimeout(() => setAutoRouteToast(null), 4500);
      }
    }
  };

  // Multi-floor routing states (Trémie)
  const [pendingShaftModal, setPendingShaftModal] = useState<{
    plenumId: string;
    shaft: Shaft;
    pathFromPlenum: Point[];
    fromLevel: number;
    toLevel: number;
  } | null>(null);

  const [pendingFloorSwitch, setPendingFloorSwitch] = useState<{
    plenumId: string;
    shaftId: string;
    pathL0: Point[];
    fromLevel: number;
    toLevel: number;
  } | null>(null);

  // Helper to calculate distance from a point to a line segment
  const distToSegment = (p: Point, a: Point, b: Point): number => {
    const l2 = Math.hypot(b.x - a.x, b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  };
  
  const scale = project.pixelsPerMeter;
  const gridPixels = gridSnapSize > 0 ? gridSnapSize * scale : 0;

  const cycleGridSize = useCallback(() => {
    setGridSnapSize(prev => {
      if (prev === 0.25) return 0.50;
      if (prev === 0.50) return 0.10;
      if (prev === 0.10) return 0;
      return 0.25;
    });
  }, []);

  const handleAlignAllDucts90 = useCallback(() => {
    const snapPx = gridSnapSize > 0 ? gridSnapSize * scale : 0.25 * scale;
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => ({
        ...p,
        connections: p.connections.map(c => ({
          ...c,
          path: orthogonalizeFullPath(c.path, snapPx)
        }))
      })),
      isoConnections: prev.isoConnections.map(c => ({
        ...c,
        path: orthogonalizeFullPath(c.path, snapPx)
      }))
    }));
    setJustAligned(true);
    setTimeout(() => setJustAligned(false), 2000);
  }, [gridSnapSize, scale, setProject]);

  // Sync state when level changes
  useEffect(() => {
    setZoom(level.zoom || 1);
    setOffset(level.viewOffset || { x: 0, y: 0 });
  }, [activeLevel, level.zoom, level.viewOffset]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current || !level.backgroundImage) return;
    const imgWidth = level.planWidth || 1000;
    const imgHeight = level.planHeight || 1000;
    
    const padding = 120;
    const rect = containerRef.current.getBoundingClientRect();
    const newZoom = Math.min((rect.width - padding) / imgWidth, (rect.height - padding) / imgHeight);
    
    setZoom(newZoom);
    setOffset({ 
      x: (rect.width - imgWidth * newZoom) / 2, 
      y: (rect.height - imgHeight * newZoom) / 2 
    });
  }, [level.backgroundImage, level.planWidth, level.planHeight]);

  useEffect(() => {
    if (level.backgroundImage && level.zoom === 0) {
      fitToScreen();
    }
  }, [level.backgroundImage, level.zoom, fitToScreen]);

  const handleZoom = (factor: number, centerX?: number, centerY?: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = centerX ?? rect.width / 2;
    const cy = centerY ?? rect.height / 2;

    const newZoom = Math.min(Math.max(zoom * factor, 0.05), 8);
    const dx = (cx - offset.x) / zoom;
    const dy = (cy - offset.y) / zoom;

    setOffset({ x: cx - dx * newZoom, y: cy - dy * newZoom });
    setZoom(newZoom);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'Shift') {
        setIsShiftPressed(true);
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setIsOrthoLocked(prev => !prev);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        cycleGridSize();
      } else if (e.key === 'Escape') {
        setCurrentPath([]);
        setTool('SELECT');
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoom(1.15);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoom(0.85);
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitToScreen();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          deleteElement(null, selectedId);
          setSelectedId(null);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        setIsPanMode(prev => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      } else if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [zoom, offset, fitToScreen, cycleGridSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onViewChange?.(zoom, offset);
    }, 500);
    return () => clearTimeout(timer);
  }, [zoom, offset, onViewChange]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - offset.x) / zoom, y: (clientY - rect.top - offset.y) / zoom };
  };

  const getSnappedPos = (clientX: number, clientY: number) => {
    const coords = getCanvasCoords(clientX, clientY);
    if (tool === 'CALIBRATE') {
      return { x: Math.round(coords.x), y: Math.round(coords.y) };
    }
    const snapUnit = gridPixels > 0 ? gridPixels : 0.05 * scale; 
    return { x: Math.round(coords.x / snapUnit) * snapUnit, y: Math.round(coords.y / snapUnit) * snapUnit };
  };

  const isConnecting = ['CONNECT', 'AIR_NEUF', 'AIR_REJETE', 'SOUFFLAGE_PPAL', 'REPRISE_PPAL'].includes(tool) && currentPath.length > 0;
  const isOrthoActive = isOrthoLocked !== isShiftPressed;

  const activeDrawingPos = useMemo(() => {
    if (!isConnecting || currentPath.length === 0) return mousePos;
    const lastPoint = currentPath[currentPath.length - 1];
    if (isOrthoActive) {
      return getOrthoPoint(lastPoint, mousePos, gridPixels);
    }
    return mousePos;
  }, [isConnecting, currentPath, isOrthoActive, mousePos, gridPixels]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getSnappedPos(e.clientX, e.clientY);
    setMousePos(pos);
    if (isPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingWaypoint) {
      const { connId, pointIndex, isTargetFloor } = draggingWaypoint;
      setProject(prev => {
        return {
          ...prev,
          plenums: prev.plenums.map(p => ({
            ...p,
            connections: p.connections.map(c => {
              if (c.id !== connId && c.ventId !== connId) return c;
              const currentFloorPath = isTargetFloor ? (c.targetLevelPath ? [...c.targetLevelPath] : []) : [...c.path];
              if (pointIndex <= 0 || pointIndex >= currentFloorPath.length - 1) return c;

              let newPt = pos;
              if (isOrthoActive) {
                const prevPt = currentFloorPath[pointIndex - 1];
                const dx = Math.abs(pos.x - prevPt.x);
                const dy = Math.abs(pos.y - prevPt.y);
                if (dx >= dy) {
                  newPt = { x: pos.x, y: prevPt.y };
                } else {
                  newPt = { x: prevPt.x, y: pos.y };
                }
              }

              currentFloorPath[pointIndex] = newPt;

              let totalPx = 0;
              const floor1 = isTargetFloor ? c.path : currentFloorPath;
              const floor2 = isTargetFloor ? currentFloorPath : c.targetLevelPath;
              for (let i = 1; i < floor1.length; i++) {
                totalPx += Math.hypot(floor1[i].x - floor1[i - 1].x, floor1[i].y - floor1[i - 1].y);
              }
              if (floor2 && floor2.length > 1) {
                for (let i = 1; i < floor2.length; i++) {
                  totalPx += Math.hypot(floor2[i].x - floor2[i - 1].x, floor2[i].y - floor2[i - 1].y);
                }
                totalPx += 2.7 * prev.pixelsPerMeter;
              }
              const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

              return {
                ...c,
                path: isTargetFloor ? c.path : currentFloorPath,
                targetLevelPath: isTargetFloor ? currentFloorPath : c.targetLevelPath,
                length: lengthMeters
              };
            })
          }))
        };
      });
    } else if (isDragging && selectedId) {
      moveElement(selectedId, pos);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging || isPanning || isSpacePressed || isPanMode || e.button !== 0) return;
    const pos = getSnappedPos(e.clientX, e.clientY);
    
    if (tool === 'CALIBRATE') {
      if (!calibrationStart) setCalibrationStart(pos);
      else if (!calibrationEnd) setCalibrationEnd(pos);
      return;
    }

    if (tool === 'VENT_EXTR') addVent(pos, VentType.REPRISE);
    if (tool === 'VENT_SOUF') addVent(pos, VentType.SOUFFLAGE);
    if (tool === 'PLENUM') { addPlenum(pos); setTool('SELECT'); }
    if (tool === 'PLENUM_SOUF') { addPlenum(pos, VentType.SOUFFLAGE); setTool('SELECT'); }
    if (tool === 'PLENUM_REPR') { addPlenum(pos, VentType.REPRISE); setTool('SELECT'); }
    if (tool === 'UNIT') { setUnit(pos); setTool('SELECT'); }
    if (tool === 'IP-FKB') addExternalHood(pos, 'IP-FKB');
    if (tool === 'IP-DHS') addExternalHood(pos, 'IP-DHS');

    if (['AIR_NEUF', 'AIR_REJETE', 'SOUFFLAGE_PPAL', 'REPRISE_PPAL'].includes(tool)) {
      const threshold = 40 / zoom;
      const plenum = project.plenums.find(p => Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < threshold);
      const hood = project.externalHoods.find(h => Math.hypot(h.pos.x - pos.x, h.pos.y - pos.y) < threshold);
      const isUnit = project.unit && Math.hypot(project.unit.pos.x - pos.x, project.unit.pos.y - pos.y) < threshold;
      const target = plenum || hood || (isUnit ? project.unit : null);

      if (currentPath.length === 0) {
        setCurrentPath([target?.pos || pos]);
      } else if (target && currentPath.length > 0) {
        const lastPoint = currentPath[currentPath.length - 1];
        let fullPath: Point[];
        if (isOrthoActive) {
          const preferH = Math.abs(target.pos.x - lastPoint.x) >= Math.abs(target.pos.y - lastPoint.y);
          const seg = createOrthoSegment(lastPoint, target.pos, preferH, gridPixels);
          fullPath = simplifyCollinearPoints([...currentPath.slice(0, -1), ...seg]);
        } else {
          fullPath = [...currentPath, target.pos];
        }
        addIsoConnection(currentPath[0] === pos ? 'start' : 'node', target.id, fullPath, tool as any);
        setCurrentPath([]);
      } else if (currentPath.length > 0) {
        const lastPoint = currentPath[currentPath.length - 1];
        const nextPt = isOrthoActive ? getOrthoPoint(lastPoint, pos, gridPixels) : pos;
        setCurrentPath(simplifyCollinearPoints([...currentPath, nextPt]));
      }
      return;
    }

    if (tool === 'TREMIE') {
      addShaft?.(pos);
      setTool('SELECT');
      return;
    }

    if (tool === 'CONNECT') {
      const threshold = 35 / zoom;
      const vent = project.vents.find(v => v.level === activeLevel && Math.hypot(v.pos.x - pos.x, v.pos.y - pos.y) < threshold);
      const plenum = project.plenums.find(p => p.level === activeLevel && Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < threshold + 10);
      const shaft = (project.shafts || []).find(s => 
        activeLevel >= Math.min(s.fromLevel, s.toLevel) && 
        activeLevel <= Math.max(s.fromLevel, s.toLevel) && 
        Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y) < threshold + 10
      );

      // Starting path: click on plenum or start at tremie if continuing floor
      if (currentPath.length === 0) {
        if (plenum) {
          setCurrentPath([plenum.pos]);
        } else if (shaft && pendingFloorSwitch) {
          setCurrentPath([shaft.pos]);
        }
        return;
      }

      const lastPoint = currentPath[currentPath.length - 1];

      // Case A: User clicked on a Trémie while routing from a Plenum
      if (shaft && !pendingFloorSwitch) {
        const pl = project.plenums.find(p => p.level === activeLevel && Math.hypot(p.pos.x - currentPath[0].x, p.pos.y - currentPath[0].y) < 25);
        if (pl) {
          let fullPath: Point[];
          if (isOrthoActive) {
            const preferH = Math.abs(shaft.pos.x - lastPoint.x) >= Math.abs(shaft.pos.y - lastPoint.y);
            const seg = createOrthoSegment(lastPoint, shaft.pos, preferH, gridPixels);
            fullPath = simplifyCollinearPoints([...currentPath.slice(0, -1), ...seg]);
          } else {
            fullPath = [...currentPath, shaft.pos];
          }
          const targetLvl = activeLevel === 0 ? 1 : 0;
          setPendingShaftModal({
            plenumId: pl.id,
            shaft,
            pathFromPlenum: fullPath,
            fromLevel: activeLevel,
            toLevel: targetLvl
          });
          setCurrentPath([]);
          return;
        }
      }

      // Case B: User clicked on a Vent
      if (vent) {
        let segToVent: Point[];
        if (isOrthoActive) {
          const preferH = Math.abs(vent.pos.x - lastPoint.x) >= Math.abs(vent.pos.y - lastPoint.y);
          const seg = createOrthoSegment(lastPoint, vent.pos, preferH, gridPixels);
          segToVent = simplifyCollinearPoints([...currentPath.slice(0, -1), ...seg]);
        } else {
          segToVent = [...currentPath, vent.pos];
        }

        if (pendingFloorSwitch) {
          // Finalize multi-floor connection via shaft
          connectVentToPlenum(
            pendingFloorSwitch.plenumId,
            vent.id,
            pendingFloorSwitch.pathL0,
            segToVent,
            pendingFloorSwitch.shaftId,
            pendingFloorSwitch.fromLevel,
            activeLevel
          );
          setPendingFloorSwitch(null);
        } else {
          // Standard single-floor connection
          const pl = project.plenums.find(p => p.level === activeLevel && Math.hypot(p.pos.x - currentPath[0].x, p.pos.y - currentPath[0].y) < 25);
          if (pl) {
            connectVentToPlenum(pl.id, vent.id, segToVent);
          }
        }
        setCurrentPath([]);
        return;
      }

      // Case C: Intermediate waypoint
      const nextPt = isOrthoActive ? getOrthoPoint(lastPoint, pos, gridPixels) : pos;
      setCurrentPath(simplifyCollinearPoints([...currentPath, nextPt]));
      return;
    }

    if (tool === 'SELECT') {
      const threshold = 30 / zoom;
      const foundVent = project.vents.find(v => v.level === activeLevel && Math.hypot(v.pos.x - pos.x, v.pos.y - pos.y) < threshold);
      const foundPlenum = project.plenums.find(p => p.level === activeLevel && Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < threshold);
      const foundShaft = (project.shafts || []).find(s => 
        activeLevel >= Math.min(s.fromLevel, s.toLevel) && 
        activeLevel <= Math.max(s.fromLevel, s.toLevel) && 
        Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y) < threshold
      );
      const foundHood = project.externalHoods.find(h => h.level === activeLevel && Math.hypot(h.pos.x - pos.x, h.pos.y - pos.y) < threshold);
      const foundUnit = (project.unit && project.unit.level === activeLevel && Math.hypot(project.unit.pos.x - pos.x, project.unit.pos.y - pos.y) < threshold ? project.unit : null);

      // Check if user clicked on any Flexpipe connection path on this floor
      let foundConnId: string | null = null;
      if (!foundVent && !foundPlenum && !foundShaft && !foundHood && !foundUnit) {
        for (const p of project.plenums) {
          for (const c of p.connections) {
            const floorPath = c.shaftId 
              ? (c.fromLevel === activeLevel ? c.path : (c.toLevel === activeLevel ? c.targetLevelPath : null)) 
              : (c.fromLevel === activeLevel || (c.fromLevel === undefined && p.level === activeLevel) ? c.path : null);
            if (!floorPath || floorPath.length < 2) continue;
            for (let i = 0; i < floorPath.length - 1; i++) {
              if (distToSegment(pos, floorPath[i], floorPath[i + 1]) < (24 / zoom)) {
                foundConnId = c.id || c.ventId;
                break;
              }
            }
            if (foundConnId) break;
          }
          if (foundConnId) break;
        }
      }

      const targetId = foundVent?.id || foundPlenum?.id || foundShaft?.id || foundHood?.id || foundUnit?.id || foundConnId || null;
      setSelectedId(targetId);
    }
  };

  const applyCalibration = () => {
    if (calibrationStart && calibrationEnd) {
      const px = Math.hypot(calibrationEnd.x - calibrationStart.x, calibrationEnd.y - calibrationStart.y);
      const m = parseFloat(calibValue);
      if (m > 0) setProject(p => ({ ...p, pixelsPerMeter: px / m }));
    }
    setCalibrationStart(null); setCalibrationEnd(null); setTool('SELECT');
  };

  // Find info if a FlexPipe connection is selected
  const selectedConnectionInfo = useMemo(() => {
    if (!selectedId) return null;
    for (const p of project.plenums) {
      const conn = p.connections.find(c => c.id === selectedId || c.ventId === selectedId);
      if (conn) {
        const vent = project.vents.find(v => v.id === conn.ventId);
        const isReprise = vent?.type === VentType.REPRISE || p.type === VentType.REPRISE;
        const isTargetFloor = conn.shaftId ? conn.toLevel === activeLevel : false;
        const floorPath = conn.shaftId 
          ? (conn.fromLevel === activeLevel ? conn.path : (conn.toLevel === activeLevel && conn.targetLevelPath ? conn.targetLevelPath : null))
          : (conn.fromLevel === activeLevel || (conn.fromLevel === undefined && p.level === activeLevel) ? conn.path : null);
        const pathPts = floorPath || conn.path;
        const midPt = pathPts && pathPts.length > 0 ? pathPts[Math.floor(pathPts.length / 2)] : { x: 0, y: 0 };
        return {
          conn,
          plenum: p,
          vent,
          isReprise,
          midPt,
          activeFloorPath: pathPts,
          isTargetFloor,
          connId: conn.id || conn.ventId
        };
      }
    }
    return null;
  }, [selectedId, project, activeLevel]);

  const selectedPlenum = useMemo(() => {
    if (!selectedId) return null;
    return project.plenums.find(p => p.id === selectedId) || null;
  }, [selectedId, project.plenums]);

  const selectedShaft = useMemo(() => {
    if (!selectedId) return null;
    return (project.shafts || []).find(s => s.id === selectedId) || null;
  }, [selectedId, project.shafts]);

  const selectedElementPos = useMemo(() => {
    if (!selectedId) return null;
    const el = project.vents.find(v => v.id === selectedId) ||
               project.plenums.find(p => p.id === selectedId) ||
               (project.shafts || []).find(s => s.id === selectedId) ||
               project.externalHoods.find(h => h.id === selectedId) ||
               (project.unit?.id === selectedId ? project.unit : null);
    if (!el) return null;
    return { x: el.pos.x * zoom + offset.x, y: el.pos.y * zoom + offset.y };
  }, [selectedId, project, zoom, offset]);

  // Waypoint manipulation helpers
  const handleInsertWaypoint = (connId: string, segmentIndex: number, isTarget: boolean, midPt: Point) => {
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => ({
        ...p,
        connections: p.connections.map(c => {
          if (c.id !== connId && c.ventId !== connId) return c;
          const currentFloorPath = isTarget ? (c.targetLevelPath ? [...c.targetLevelPath] : []) : [...c.path];
          if (segmentIndex < 0 || segmentIndex >= currentFloorPath.length - 1) return c;

          const p1 = currentFloorPath[segmentIndex];
          const p2 = currentFloorPath[segmentIndex + 1];
          const isH = Math.abs(p1.y - p2.y) < 1;
          const stepOffset = 30;
          let newPoints: Point[];
          if (isH) {
            newPoints = [
              { x: midPt.x, y: p1.y },
              { x: midPt.x, y: p1.y + stepOffset },
              { x: midPt.x + 1, y: p1.y + stepOffset }
            ];
          } else {
            newPoints = [
              { x: p1.x, y: midPt.y },
              { x: p1.x + stepOffset, y: midPt.y },
              { x: p1.x + stepOffset, y: midPt.y + 1 }
            ];
          }

          const updatedPath = [
            ...currentFloorPath.slice(0, segmentIndex + 1),
            ...newPoints,
            ...currentFloorPath.slice(segmentIndex + 1)
          ];
          const simplified = simplifyCollinearPoints(updatedPath);

          let totalPx = 0;
          const floor1 = isTarget ? c.path : simplified;
          const floor2 = isTarget ? simplified : c.targetLevelPath;
          for (let i = 1; i < floor1.length; i++) {
            totalPx += Math.hypot(floor1[i].x - floor1[i - 1].x, floor1[i].y - floor1[i - 1].y);
          }
          if (floor2 && floor2.length > 1) {
            for (let i = 1; i < floor2.length; i++) {
              totalPx += Math.hypot(floor2[i].x - floor2[i - 1].x, floor2[i].y - floor2[i - 1].y);
            }
            totalPx += 2.7 * prev.pixelsPerMeter;
          }
          const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

          return {
            ...c,
            path: isTarget ? c.path : simplified,
            targetLevelPath: isTarget ? simplified : c.targetLevelPath,
            length: lengthMeters
          };
        })
      }))
    }));
  };

  const handleDeleteWaypoint = (connId: string, pointIndex: number, isTarget: boolean) => {
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => ({
        ...p,
        connections: p.connections.map(c => {
          if (c.id !== connId && c.ventId !== connId) return c;
          const currentFloorPath = isTarget ? (c.targetLevelPath ? [...c.targetLevelPath] : []) : [...c.path];
          if (currentFloorPath.length <= 2 || pointIndex <= 0 || pointIndex >= currentFloorPath.length - 1) return c;

          const updatedPath = currentFloorPath.filter((_, idx) => idx !== pointIndex);
          const orthoPath = orthogonalizeFullPath(updatedPath);

          let totalPx = 0;
          const floor1 = isTarget ? c.path : orthoPath;
          const floor2 = isTarget ? orthoPath : c.targetLevelPath;
          for (let i = 1; i < floor1.length; i++) {
            totalPx += Math.hypot(floor1[i].x - floor1[i - 1].x, floor1[i].y - floor1[i - 1].y);
          }
          if (floor2 && floor2.length > 1) {
            for (let i = 1; i < floor2.length; i++) {
              totalPx += Math.hypot(floor2[i].x - floor2[i - 1].x, floor2[i].y - floor2[i - 1].y);
            }
            totalPx += 2.7 * prev.pixelsPerMeter;
          }
          const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

          return {
            ...c,
            path: isTarget ? c.path : orthoPath,
            targetLevelPath: isTarget ? orthoPath : c.targetLevelPath,
            length: lengthMeters
          };
        })
      }))
    }));
  };

  const handleInvertElbow = (connId: string, isTarget: boolean) => {
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => ({
        ...p,
        connections: p.connections.map(c => {
          if (c.id !== connId && c.ventId !== connId) return c;
          const currentFloorPath = isTarget ? (c.targetLevelPath ? [...c.targetLevelPath] : []) : [...c.path];
          if (currentFloorPath.length < 2) return c;

          const pStart = currentFloorPath[0];
          const pEnd = currentFloorPath[currentFloorPath.length - 1];
          const firstSegWasH = currentFloorPath.length > 1 && Math.abs(currentFloorPath[1].y - pStart.y) < 1;
          const invertedSeg = createOrthoSegment(pStart, pEnd, !firstSegWasH);

          let totalPx = 0;
          const floor1 = isTarget ? c.path : invertedSeg;
          const floor2 = isTarget ? invertedSeg : c.targetLevelPath;
          for (let i = 1; i < floor1.length; i++) {
            totalPx += Math.hypot(floor1[i].x - floor1[i - 1].x, floor1[i].y - floor1[i - 1].y);
          }
          if (floor2 && floor2.length > 1) {
            for (let i = 1; i < floor2.length; i++) {
              totalPx += Math.hypot(floor2[i].x - floor2[i - 1].x, floor2[i].y - floor2[i - 1].y);
            }
            totalPx += 2.7 * prev.pixelsPerMeter;
          }
          const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

          return {
            ...c,
            path: isTarget ? c.path : invertedSeg,
            targetLevelPath: isTarget ? invertedSeg : c.targetLevelPath,
            length: lengthMeters
          };
        })
      }))
    }));
  };

  const handleAlignSingleConnection90 = (connId: string, isTarget: boolean) => {
    const snapPx = gridSnapSize > 0 ? gridSnapSize * scale : 0.25 * scale;
    setProject(prev => ({
      ...prev,
      plenums: prev.plenums.map(p => ({
        ...p,
        connections: p.connections.map(c => {
          if (c.id !== connId && c.ventId !== connId) return c;
          const currentFloorPath = isTarget ? (c.targetLevelPath ? [...c.targetLevelPath] : []) : [...c.path];
          const orthoPath = orthogonalizeFullPath(currentFloorPath, snapPx);

          let totalPx = 0;
          const floor1 = isTarget ? c.path : orthoPath;
          const floor2 = isTarget ? orthoPath : c.targetLevelPath;
          for (let i = 1; i < floor1.length; i++) {
            totalPx += Math.hypot(floor1[i].x - floor1[i - 1].x, floor1[i].y - floor1[i - 1].y);
          }
          if (floor2 && floor2.length > 1) {
            for (let i = 1; i < floor2.length; i++) {
              totalPx += Math.hypot(floor2[i].x - floor2[i - 1].x, floor2[i].y - floor2[i - 1].y);
            }
            totalPx += 2.7 * prev.pixelsPerMeter;
          }
          const lengthMeters = Math.max(0.5, Math.round((totalPx / prev.pixelsPerMeter) * 10) / 10);

          return {
            ...c,
            path: isTarget ? c.path : orthoPath,
            targetLevelPath: isTarget ? orthoPath : c.targetLevelPath,
            length: lengthMeters
          };
        })
      }))
    }));
  };

  return (
    <div 
      className={`flex-1 flex flex-col relative bg-slate-50 overflow-hidden ${
        isPanning ? 'cursor-grabbing' : (isSpacePressed || isPanMode) ? 'cursor-grab' : (tool === 'SELECT' ? 'cursor-default' : 'cursor-crosshair')
      }`} 
      onMouseMove={handleMouseMove}
      onMouseDown={(e) => { 
        if (e.button === 1 || isSpacePressed || isPanMode) { 
          setIsPanning(true); 
          setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); 
        } else if (selectedId) {
          setIsDragging(true); 
        }
      }}
      onMouseUp={() => { 
        setIsPanning(false); 
        setIsDragging(false); 
        setDraggingWaypoint(null);
      }}
      onWheel={(e) => {
        if (e.shiftKey) {
          setOffset(prev => ({ x: prev.x - e.deltaY, y: prev.y }));
          return;
        }
        const factor = e.deltaY > 0 ? 0.88 : 1.12;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          handleZoom(factor, e.clientX - rect.left, e.clientY - rect.top);
        }
      }}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); setCurrentPath([]); setTool('SELECT'); setCalibrationStart(null); setCalibrationEnd(null); }}
    >
      <input type="file" id="plan-input" ref={fileInputRef} className="hidden" onChange={onPlanUpload} accept="image/*" />
      
      {/* Floating Action Bar for Selected Item (Vent, Plenum, Hood, Unit, Shaft) */}
      {selectedElementPos && !selectedConnectionInfo && (
        <div className="absolute z-50 pointer-events-none" style={{ left: selectedElementPos.x, top: selectedElementPos.y - 60 }}>
          <div className="flex bg-slate-900 text-white p-1.5 rounded-2xl shadow-2xl pointer-events-auto -translate-x-1/2 items-center gap-1.5 animate-in slide-in-from-bottom-2 duration-200 border border-white/10">
             <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all" title="Désélectionner"><MousePointer2 size={16}/></button>
             <div className="w-px h-4 bg-white/10 mx-1" />
             {selectedPlenum && togglePlenumType && (
               <button 
                 onClick={() => togglePlenumType(selectedPlenum.id)} 
                 className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-[9px] font-black uppercase ${
                   selectedPlenum.type === VentType.REPRISE ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                 }`}
                 title="Basculer le type de plénum entre Soufflage (Bleu) et Reprise (Rouge)"
               >
                 <span className="w-2 h-2 rounded-full bg-white" />
                 <span>{selectedPlenum.type === VentType.REPRISE ? 'Passer en Soufflage' : 'Passer en Reprise'}</span>
               </button>
             )}
             {selectedShaft && (
               <div className="flex items-center gap-1.5 px-2">
                 <span className="w-2 h-2 rounded-full bg-amber-500" />
                 <span className="text-[10px] font-black uppercase text-amber-400">{selectedShaft.name} (RDC ⇄ R+1)</span>
               </div>
             )}
             {project.unit?.id === selectedId && (
               <button onClick={onOpenUnitSelector} className="p-2 hover:bg-white/10 rounded-xl transition-all flex items-center gap-2"><Settings size={16}/> <span className="text-[9px] font-black uppercase">Configuration</span></button>
             )}
             <button onClick={() => deleteElement(null, selectedId)} className="p-2 bg-red-600 hover:bg-red-700 rounded-xl transition-all flex items-center gap-2 shadow-lg active:scale-95"><Trash2 size={16}/> <span className="text-[9px] font-black uppercase">Supprimer</span></button>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Selected FlexPipe Connection */}
      {selectedConnectionInfo && (
        <div 
          className="absolute z-50 pointer-events-none" 
          style={{ 
            left: Math.min(Math.max(selectedConnectionInfo.midPt.x * zoom + offset.x, 260), (containerSize.width || 800) - 260), 
            top: Math.max(selectedConnectionInfo.midPt.y * zoom + offset.y - 65, 80) 
          }}
        >
          <div className="flex bg-slate-900 text-white p-2 rounded-2xl shadow-2xl pointer-events-auto -translate-x-1/2 items-center gap-2 animate-in slide-in-from-bottom-2 duration-200 border border-white/10">
            <span className={`w-3 h-3 rounded-full ${selectedConnectionInfo.isReprise ? 'bg-red-500 ring-2 ring-red-300' : 'bg-blue-500 ring-2 ring-blue-300'}`} />
            <div className="text-[10px] font-black uppercase pr-1">
              <span>{selectedConnectionInfo.isReprise ? 'Reprise' : 'Soufflage'} ({selectedConnectionInfo.vent?.roomId || 'Bouche'})</span>
              <span className="text-slate-400 font-bold ml-1.5">• {selectedConnectionInfo.conn.ductsCount}x DN75 ({selectedConnectionInfo.conn.length}m)</span>
            </div>

            <div className="w-px h-4 bg-white/20" />

            {/* Invert elbow corner preference */}
            <button
              onClick={() => handleInvertElbow(selectedConnectionInfo.connId, selectedConnectionInfo.isTargetFloor)}
              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all active:scale-95"
              title="Inverser le sens du coude (Horiz. / Vert. d'abord)"
            >
              <ArrowUpDown size={12} className="text-amber-400" />
              <span>Inverser coude</span>
            </button>

            {/* Align single connection 90° */}
            <button
              onClick={() => handleAlignSingleConnection90(selectedConnectionInfo.connId, selectedConnectionInfo.isTargetFloor)}
              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all active:scale-95"
              title="Aligner strictement ce tracé à 90°"
            >
              <CornerDownRight size={12} className="text-blue-400" />
              <span>Aligner 90°</span>
            </button>

            {/* Multi-floor switch button if this connection passes through a shaft */}
            {selectedConnectionInfo.conn.shaftId && (
              <button
                onClick={() => {
                  const targetLvl = activeLevel === (selectedConnectionInfo.conn.fromLevel ?? 0)
                    ? (selectedConnectionInfo.conn.toLevel ?? 1)
                    : (selectedConnectionInfo.conn.fromLevel ?? 0);
                  setActiveLevel(targetLvl);
                }}
                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-[9px] uppercase flex items-center gap-1.5 transition-all shadow active:scale-95"
                title="Bascule immédiate vers l'autre niveau pour voir la suite du conduit"
              >
                <ArrowUpDown size={12} className="text-slate-950" />
                <span>Voir {activeLevel === (selectedConnectionInfo.conn.fromLevel ?? 0) ? 'Étage 1' : 'RDC'}</span>
              </button>
            )}

            <div className="w-px h-4 bg-white/20" />

            <button 
              onClick={() => {
                deleteElement(null, selectedConnectionInfo.connId);
                setSelectedId(null);
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 transition-all shadow-md active:scale-95"
              title="Supprimer ce tracé FlexPipe"
            >
              <Trash2 size={13} />
              <span>Supprimer</span>
            </button>
            <button 
              onClick={() => setSelectedId(null)} 
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"
              title="Désélectionner"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Toast feedback after Auto-Routing */}
      {autoRouteToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-3">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
            <Check size={18} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Raccordement Automatique</div>
            <div className="text-[9px] font-bold text-slate-300 mt-0.5">{autoRouteToast}</div>
          </div>
          <button onClick={() => setAutoRouteToast(null)} className="ml-3 text-slate-400 hover:text-white text-xs font-black">✕</button>
        </div>
      )}

      <div className="absolute top-6 left-6 right-6 z-40 flex justify-between items-center pointer-events-none">
        <div className="flex bg-white/90 backdrop-blur-xl p-2 rounded-3xl shadow-2xl border border-slate-200 pointer-events-auto items-center gap-2">
          {project.levels.map(lvl => (
            <button key={lvl.id} onClick={() => setActiveLevel(lvl.id)} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeLevel === lvl.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
              {lvl.name}
            </button>
          ))}
          <div className="h-4 w-px bg-slate-200 mx-2" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Charger un plan">
            <ImageIcon size={18}/>
          </button>
        </div>

        {/* Center: Ortho 90° & Snap-to-Grid Controls */}
        <div className="flex bg-white/95 backdrop-blur-xl p-1.5 rounded-3xl shadow-2xl border border-slate-200 pointer-events-auto items-center gap-1.5">
          {/* Ortho 90° Toggle */}
          <button
            onClick={() => setIsOrthoLocked(prev => !prev)}
            className={`px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 transition-all ${
              isOrthoLocked 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/20' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Verrouillage 90° Orthogonal (Touche O ou Shift)"
          >
            <CornerDownRight size={14} className={isOrthoLocked ? 'text-white' : 'text-slate-400'} />
            <span>90° Ortho</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
              isOrthoLocked ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-400'
            }`}>
              {isOrthoLocked ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Grid Snap Size Toggle */}
          <button
            onClick={cycleGridSize}
            className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 transition-all ${
              gridSnapSize > 0 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Grille Magnétique (Touche G) - Cliquez pour changer le pas"
          >
            <Magnet size={14} className={gridSnapSize > 0 ? 'text-cyan-400' : 'text-slate-400'} />
            <span>Grille</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
              gridSnapSize > 0 ? 'bg-slate-800 text-cyan-300' : 'bg-slate-100 text-slate-400'
            }`}>
              {gridSnapSize > 0 ? `${gridSnapSize}m` : 'OFF'}
            </span>
          </button>

          {/* Visual Grid Toggle */}
          <button
            onClick={() => setShowVisualGrid(prev => !prev)}
            className={`p-2 rounded-2xl transition-all ${
              showVisualGrid && gridSnapSize > 0 
                ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-200' 
                : 'text-slate-400 hover:bg-slate-100'
            }`}
            title={showVisualGrid ? "Masquer la grille visuelle" : "Afficher la grille visuelle"}
          >
            <Grid size={15} />
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Auto-raccordement des Réseaux */}
          <button
            onClick={() => handleRunAutoRoute()}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 active:scale-95"
            title="Raccordement automatique de tous les plénums et bouches selon le débit (m³/h) et le flux"
          >
            <Sparkles size={14} className="text-amber-300 animate-pulse" />
            <span>Raccordement Auto</span>
            {unconnectedVentsCount > 0 && (
              <span className="bg-white/25 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full">
                {unconnectedVentsCount}
              </span>
            )}
          </button>

          {/* Align All Ducts to 90° */}
          <button
            onClick={handleAlignAllDucts90}
            className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5 transition-all ${
              justAligned 
                ? 'bg-emerald-600 text-white shadow-md' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Convertir toutes les liaisons existantes en angles droits parfaits à 90°"
          >
            {justAligned ? <Check size={14} /> : <Sparkles size={14} className="text-amber-500" />}
            <span>{justAligned ? 'Réseau Aligné !' : 'Aligner 90°'}</span>
          </button>
        </div>
        
        <div className="flex bg-white/90 backdrop-blur-xl p-2 rounded-3xl shadow-2xl border border-slate-200 pointer-events-auto items-center gap-1">
          <button 
            onClick={() => setIsPanMode(prev => !prev)} 
            className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 ${isPanMode ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
            title="Outil Déplacement / Main (H ou Espace)"
          >
            <Hand size={18}/>
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button onClick={() => handleZoom(0.85)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all text-slate-500" title="Zoom Arrière (-)"><ZoomOut size={18}/></button>
          <button 
            onClick={() => setZoom(1)} 
            className="px-3 py-1 text-[10px] font-black text-slate-900 min-w-[55px] text-center hover:bg-slate-100 rounded-lg transition-all" 
            title="Cliquer pour réinitialiser à 100% (touche 0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => handleZoom(1.15)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all text-slate-500" title="Zoom Avant (+)"><ZoomIn size={18}/></button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button onClick={fitToScreen} className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-red-600 transition-all flex items-center gap-2 shadow-lg" title="Ajuster le plan à l'écran (F)">
            <Maximize size={16}/> <span className="text-[9px] font-black uppercase">Focus Plan</span>
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden canvas-grid">
        {!level.backgroundImage ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-12 bg-slate-50/50 backdrop-blur-sm">
             <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative mx-auto w-32 h-32">
                   <div className="absolute inset-0 bg-red-600 rounded-[2.5rem] blur-2xl opacity-20 animate-pulse"></div>
                   <div className="relative bg-white border-2 border-slate-100 rounded-[2.5rem] w-full h-full flex items-center justify-center shadow-xl">
                      <UploadCloud size={48} className="text-red-600" />
                   </div>
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic">Prêt pour l'étude</h2>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Importez le plan de l'habitat pour commencer l'implantation</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative w-full bg-red-600 text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] overflow-hidden transition-all hover:bg-red-700 hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_-10px_rgba(227,6,19,0.3)]"
                >
                  <span className="relative z-10 flex items-center justify-center gap-4 uppercase font-black">
                    Charger le plan Helios <ImageIcon size={20}/>
                  </span>
                </button>
             </div>
          </div>
        ) : null}

        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {renderPlanSVG(project, activeLevel, zoom, offset, false, selectedId, (id) => setSelectedId(id))}
          
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
            {/* Visual CAD Engineering Dot Grid */}
            {showVisualGrid && gridSnapSize > 0 && (
              <g>
                <defs>
                  <pattern 
                    id="plan-tech-grid" 
                    width={gridPixels} 
                    height={gridPixels} 
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx={gridPixels / 2} cy={gridPixels / 2} r={1.2 / zoom} fill="#94a3b8" opacity="0.65" />
                  </pattern>
                </defs>
                <rect 
                  x={0} 
                  y={0} 
                  width={level.planWidth || 3000} 
                  height={level.planHeight || 2000} 
                  fill="url(#plan-tech-grid)" 
                  pointerEvents="none" 
                  opacity="0.55" 
                />
              </g>
            )}

            {calibrationStart && (
              <g>
                <line x1={calibrationStart.x} y1={calibrationStart.y} x2={calibrationEnd?.x || mousePos.x} y2={calibrationEnd?.y || mousePos.y} stroke="#f59e0b" strokeWidth={3/zoom} strokeDasharray="5,5" />
                <circle cx={calibrationStart.x} cy={calibrationStart.y} r={6/zoom} fill="#f59e0b" />
              </g>
            )}

            {/* In-progress Duct Connection Preview */}
            {currentPath.length > 0 && (
              <g>
                {(() => {
                  let previewColor = '#2563eb';
                  if (tool === 'VENT_EXTR' || tool === 'REPRISE_PPAL') {
                    previewColor = '#dc2626';
                  } else if (tool === 'CONNECT' && currentPath.length > 0) {
                    const pl = project.plenums.find(p => p.level === activeLevel && Math.hypot(p.pos.x - currentPath[0].x, p.pos.y - currentPath[0].y) < 25);
                    if (pl?.type === VentType.REPRISE) previewColor = '#dc2626';
                  }

                  return (
                    <>
                      {/* Already placed path segments */}
                      {currentPath.length > 1 && (
                        <path 
                          d={getSmoothPath(currentPath, scale, 0.35)} 
                          fill="none" 
                          stroke={previewColor} 
                          strokeWidth={(0.075 * scale) * 0.9} 
                          strokeDasharray="8,4" 
                          opacity="0.75" 
                        />
                      )}

                      {/* Waypoint circles */}
                      {currentPath.map((pt, idx) => (
                        <circle 
                          key={idx} 
                          cx={pt.x} 
                          cy={pt.y} 
                          r={4.5 / zoom} 
                          fill="#0f172a" 
                          stroke="white" 
                          strokeWidth={1.5 / zoom} 
                        />
                      ))}

                      {/* Orthogonal Guideline Axes projecting across canvas */}
                      {isOrthoActive && (
                        <g stroke="rgba(37, 99, 235, 0.4)" strokeWidth={1 / zoom} strokeDasharray="4,4">
                          <line x1={-5000} y1={activeDrawingPos.y} x2={5000} y2={activeDrawingPos.y} />
                          <line x1={activeDrawingPos.x} y1={-5000} x2={activeDrawingPos.x} y2={5000} />
                        </g>
                      )}

                      {/* Live orthogonal segment to active cursor */}
                      <line 
                        x1={currentPath[currentPath.length - 1].x} 
                        y1={currentPath[currentPath.length - 1].y} 
                        x2={activeDrawingPos.x} 
                        y2={activeDrawingPos.y} 
                        stroke={previewColor} 
                        strokeWidth={2.5 / zoom} 
                        strokeDasharray="6,4" 
                      />

                      {/* Active drawing point cursor ring */}
                      <circle 
                        cx={activeDrawingPos.x} 
                        cy={activeDrawingPos.y} 
                        r={5 / zoom} 
                        fill={previewColor} 
                        stroke="white" 
                        strokeWidth={2 / zoom} 
                      />

                      {/* Live Distance & 90° HUD Badge */}
                      {(() => {
                        const lastPt = currentPath[currentPath.length - 1];
                        const segDist = (Math.hypot(activeDrawingPos.x - lastPt.x, activeDrawingPos.y - lastPt.y) / scale).toFixed(2);
                        const midX = (lastPt.x + activeDrawingPos.x) / 2;
                        const midY = (lastPt.y + activeDrawingPos.y) / 2;
                        return (
                          <g transform={`translate(${midX}, ${midY - 14 / zoom})`} className="select-none pointer-events-none">
                            <rect 
                              x={-38 / zoom} 
                              y={-9 / zoom} 
                              width={76 / zoom} 
                              height={18 / zoom} 
                              rx={5 / zoom} 
                              fill="rgba(15, 23, 42, 0.95)" 
                              stroke={isOrthoActive ? '#3b82f6' : '#cbd5e1'} 
                              strokeWidth={1 / zoom} 
                            />
                            <text 
                              textAnchor="middle" 
                              y={3 / zoom} 
                              style={{ fontSize: `${8.5 / zoom}px`, fill: '#ffffff', fontWeight: 900 }}
                            >
                              {segDist} m {isOrthoActive ? '• 90°' : ''}
                            </text>
                          </g>
                        );
                      })()}
                    </>
                  );
                })()}
              </g>
            )}

            {/* Interactive Editable Waypoints and Segment Handles for Selected FlexPipe Connection */}
            {selectedConnectionInfo && selectedConnectionInfo.activeFloorPath && selectedConnectionInfo.activeFloorPath.length > 1 && (
              <g className="pointer-events-auto">
                {/* Segment guideline & Midpoint "+" handles to add intermediate 90° elbows */}
                {selectedConnectionInfo.activeFloorPath.slice(0, -1).map((p1, idx) => {
                  const p2 = selectedConnectionInfo.activeFloorPath[idx + 1];
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  const segLength = (Math.hypot(p2.x - p1.x, p2.y - p1.y) / scale).toFixed(2);

                  return (
                    <g key={`edit-seg-${idx}`}>
                      {/* Segment highlight */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#f59e0b"
                        strokeWidth={2.5 / zoom}
                        strokeDasharray="4,4"
                        opacity="0.85"
                      />

                      {/* Add Waypoint Button (+) on Segment Midpoint */}
                      <g 
                        transform={`translate(${midX}, ${midY})`}
                        className="cursor-pointer group"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInsertWaypoint(selectedConnectionInfo.connId, idx, selectedConnectionInfo.isTargetFloor, { x: midX, y: midY });
                        }}
                      >
                        <circle
                          r={7.5 / zoom}
                          fill="#0f172a"
                          stroke="#f59e0b"
                          strokeWidth={1.8 / zoom}
                          className="group-hover:scale-125 transition-transform"
                        />
                        <line x1={-3.5 / zoom} y1={0} x2={3.5 / zoom} y2={0} stroke="#ffffff" strokeWidth={1.5 / zoom} strokeLinecap="round" />
                        <line x1={0} y1={-3.5 / zoom} x2={0} y2={3.5 / zoom} stroke="#ffffff" strokeWidth={1.5 / zoom} strokeLinecap="round" />
                        
                        {/* Segment length badge above "+" */}
                        <g transform={`translate(0, ${-12 / zoom})`} className="pointer-events-none select-none">
                          <rect x={-20 / zoom} y={-6 / zoom} width={40 / zoom} height={12 / zoom} rx={3 / zoom} fill="rgba(15, 23, 42, 0.95)" />
                          <text y={2.5 / zoom} textAnchor="middle" style={{ fontSize: `${6.5 / zoom}px`, fill: '#fbbf24', fontWeight: 900 }}>
                            {segLength}m
                          </text>
                        </g>
                      </g>
                    </g>
                  );
                })}

                {/* Waypoint Vertex Handles (Draggable intermediate corners) */}
                {selectedConnectionInfo.activeFloorPath.map((pt, idx) => {
                  const isStart = idx === 0;
                  const isEnd = idx === selectedConnectionInfo.activeFloorPath.length - 1;
                  const isIntermediate = !isStart && !isEnd;
                  const isDraggingThis = draggingWaypoint?.pointIndex === idx;

                  return (
                    <g 
                      key={`edit-wp-${idx}`} 
                      transform={`translate(${pt.x}, ${pt.y})`}
                      className={isIntermediate ? 'cursor-move' : 'cursor-default'}
                      onMouseDown={(e) => {
                        if (isIntermediate && e.button === 0) {
                          e.stopPropagation();
                          setDraggingWaypoint({
                            connId: selectedConnectionInfo.connId,
                            pointIndex: idx,
                            isTargetFloor: selectedConnectionInfo.isTargetFloor
                          });
                        }
                      }}
                      onDoubleClick={(e) => {
                        if (isIntermediate) {
                          e.stopPropagation();
                          handleDeleteWaypoint(selectedConnectionInfo.connId, idx, selectedConnectionInfo.isTargetFloor);
                        }
                      }}
                    >
                      {/* Outer Ring / Halo */}
                      <circle
                        r={(isDraggingThis ? 11 : isIntermediate ? 8 : 6.5) / zoom}
                        fill={isDraggingThis ? 'rgba(245, 158, 11, 0.3)' : isIntermediate ? 'rgba(255, 255, 255, 0.95)' : '#0f172a'}
                        stroke={isDraggingThis ? '#f59e0b' : isIntermediate ? (selectedConnectionInfo.isReprise ? '#dc2626' : '#2563eb') : '#ffffff'}
                        strokeWidth={(isDraggingThis ? 2.5 : 2) / zoom}
                      />

                      {/* Inner Dot for Intermediate Waypoints */}
                      {isIntermediate && (
                        <circle
                          r={3.5 / zoom}
                          fill={selectedConnectionInfo.isReprise ? '#dc2626' : '#2563eb'}
                        />
                      )}

                      {/* Start/End Label Badges */}
                      {isStart && (
                        <g transform={`translate(0, ${-12 / zoom})`} className="pointer-events-none select-none">
                          <rect x={-24 / zoom} y={-5 / zoom} width={48 / zoom} height={10 / zoom} rx={2.5 / zoom} fill="#0f172a" />
                          <text y={2.5 / zoom} textAnchor="middle" style={{ fontSize: `${5.5 / zoom}px`, fill: '#ffffff', fontWeight: 900 }}>DÉPART</text>
                        </g>
                      )}
                      {isEnd && (
                        <g transform={`translate(0, ${-12 / zoom})`} className="pointer-events-none select-none">
                          <rect x={-24 / zoom} y={-5 / zoom} width={48 / zoom} height={10 / zoom} rx={2.5 / zoom} fill="#0f172a" />
                          <text y={2.5 / zoom} textAnchor="middle" style={{ fontSize: `${5.5 / zoom}px`, fill: '#ffffff', fontWeight: 900 }}>BOUCHE</text>
                        </g>
                      )}

                      {/* Tooltip on Intermediate Corner */}
                      {isIntermediate && (
                        <g transform={`translate(0, ${15 / zoom})`} className="pointer-events-none select-none opacity-85">
                          <rect x={-28 / zoom} y={-5.5 / zoom} width={56 / zoom} height={11 / zoom} rx={2.5 / zoom} fill="#0f172a" />
                          <text y={2.5 / zoom} textAnchor="middle" style={{ fontSize: `${5.5 / zoom}px`, fill: '#ffffff', fontWeight: 800 }}>
                            Coude {idx} (Glisser)
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        </svg>

        {/* Multi-floor transition guidance banner */}
        {pendingFloorSwitch && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 px-6 py-3 rounded-2xl shadow-2xl border-2 border-amber-300 flex items-center gap-3 z-50 pointer-events-auto animate-in fade-in slide-in-from-top-2">
            <div className="w-3 h-3 rounded-full bg-slate-950 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-wider">
              Traversée Trémie active • Cliquez sur la bouche de destination sur cet étage pour finaliser la liaison
            </span>
            <button 
              onClick={() => { setPendingFloorSwitch(null); setCurrentPath([]); }}
              className="ml-2 px-3 py-1 bg-slate-900 text-white text-[9px] font-black uppercase rounded-xl hover:bg-slate-800 transition-all shadow"
            >
              Annuler
            </button>
          </div>
        )}

        {/* Live Drawing Guidance Banner */}
        {currentPath.length > 0 && !pendingFloorSwitch && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 z-40 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              Mode 90° Ortho {isOrthoActive ? 'Actif' : 'Libre'} • Cliquez sur Trémie pour passer à l'étage • Clic sur bouche pour connecter (Échap pour annuler)
            </span>
          </div>
        )}

        {/* Trémie Inter-Floors Transition Modal */}
        {pendingShaftModal && (
          <div className="fixed inset-0 z-[150] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.4)] overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
              <div className="bg-slate-950 p-6 flex items-center justify-between text-white border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500 rounded-2xl text-slate-950">
                    <ArrowUpDown size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Traversée de Trémie Inter-Étages</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                      {pendingShaftModal.shaft.name} • {pendingShaftModal.fromLevel === 0 ? 'RDC' : 'Étage 1'} ⇄ {pendingShaftModal.toLevel === 0 ? 'RDC' : 'Étage 1'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setPendingShaftModal(null)} 
                  className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600 leading-relaxed">
                  Le réseau FlexPipe 75 issu du Plénum arrive à la trémie technique. Comment souhaitez-vous le raccorder à l'{pendingShaftModal.toLevel === 0 ? 'RDC' : 'Étage 1'} ?
                </div>

                {/* Option A: Manual Routing on Target Floor */}
                <button
                  onClick={() => {
                    setActiveLevel(pendingShaftModal.toLevel);
                    setPendingFloorSwitch({
                      plenumId: pendingShaftModal.plenumId,
                      shaftId: pendingShaftModal.shaft.id,
                      pathL0: pendingShaftModal.pathFromPlenum,
                      fromLevel: pendingShaftModal.fromLevel,
                      toLevel: pendingShaftModal.toLevel
                    });
                    setCurrentPath([pendingShaftModal.shaft.pos]);
                    setPendingShaftModal(null);
                  }}
                  className="w-full flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-tight hover:bg-blue-600 transition-all shadow-lg group active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <CornerDownRight size={18} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                    <div className="text-left">
                      <div>Continuer le tracé à l'{pendingShaftModal.toLevel === 0 ? 'RDC' : 'Étage 1'}</div>
                      <div className="text-[8px] opacity-60 font-medium lowercase">Bascule de niveau et tracé orthogonal 90° vers la bouche</div>
                    </div>
                  </div>
                  <ChevronRight size={18} />
                </button>

                {/* Option B: Direct Link to Unconnected Vents on Target Level */}
                {(() => {
                  const targetVents = project.vents.filter(v => v.level === pendingShaftModal.toLevel && !v.connected);
                  if (targetVents.length === 0) return null;
                  return (
                    <div className="space-y-3 pt-2">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Ou raccorder immédiatement une bouche de l'{pendingShaftModal.toLevel === 0 ? 'RDC' : 'Étage 1'} :
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {targetVents.map(vent => (
                          <button
                            key={vent.id}
                            onClick={() => {
                              const seg = createOrthoSegment(pendingShaftModal.shaft.pos, vent.pos, true, gridPixels);
                              connectVentToPlenum(
                                pendingShaftModal.plenumId,
                                vent.id,
                                pendingShaftModal.pathFromPlenum,
                                seg,
                                pendingShaftModal.shaft.id,
                                pendingShaftModal.fromLevel,
                                pendingShaftModal.toLevel
                              );
                              setPendingShaftModal(null);
                              setActiveLevel(pendingShaftModal.toLevel);
                            }}
                            className="p-3 text-left bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-300 rounded-xl transition-all group"
                          >
                            <div className="text-[10px] font-black uppercase text-slate-900 group-hover:text-blue-700 truncate">{vent.roomId}</div>
                            <div className="text-[8px] font-bold text-slate-400 mt-0.5">
                              {vent.flowRate} m³/h • {vent.type === VentType.REPRISE ? 'Reprise' : 'Soufflage'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setPendingShaftModal(null)}
                  className="px-5 py-2.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 transition-all"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {calibrationEnd && (
          <div className="fixed inset-0 z-[200] bg-slate-950/40 backdrop-blur-md flex items-center justify-center">
            <div className="bg-white p-10 rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] w-[400px] animate-in zoom-in-95 duration-300">
               <div className="bg-amber-100 w-16 h-16 rounded-[2rem] flex items-center justify-center text-amber-600 mb-8"><Target size={32} /></div>
               <h3 className="text-2xl font-black uppercase tracking-tight mb-2 italic">Mise à l'échelle</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Saisissez la distance réelle du segment tracé (m)</p>
               <input autoFocus type="number" step="0.01" value={calibValue} onChange={(e) => setCalibValue(e.target.value)} className="w-full bg-slate-50 border-4 border-slate-100 rounded-3xl px-8 py-6 text-3xl font-black mb-10 focus:border-red-600 transition-all outline-none" />
               <div className="flex gap-4">
                  <button onClick={() => { setCalibrationStart(null); setCalibrationEnd(null); }} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Annuler</button>
                  <button onClick={applyCalibration} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-red-200 hover:bg-red-700 transition-all">Valider</button>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-10 left-10 flex gap-4 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-xl px-6 py-4 rounded-3xl border border-slate-200 shadow-xl flex flex-col items-start transition-all">
           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Échelle Helios</p>
           <span className="text-xs font-black text-slate-950 italic">1m = {Math.round(scale)} pixels</span>
        </div>
        {level.backgroundImage && scale === 60 && (
          <div className="bg-amber-500 px-6 py-4 rounded-3xl shadow-xl flex items-center gap-3 border border-white/20 animate-bounce pointer-events-auto cursor-pointer" onClick={() => setTool('CALIBRATE')}>
             <Ruler size={16} className="text-white"/>
             <span className="text-[10px] font-black text-white uppercase tracking-tight italic">Étalonner l'échelle</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanCanvas;
