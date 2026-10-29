import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { 
  calculateProjectQuote, 
  buildHubSpotDealPayload, 
  sendDealToHubSpot, 
  exportQuoteToCSV, 
  ProjectQuote 
} from '../utils/quotePricing';
import { 
  Building2, DollarSign, Send, Download, Copy, Check, ExternalLink, 
  AlertCircle, CheckCircle2, ShieldCheck, Percent, Layers, Sliders, Loader2, Sparkles, Key
} from 'lucide-react';

interface QuoteHubSpotModalProps {
  project: Project;
  onClose: () => void;
}

export const QuoteHubSpotModal: React.FC<QuoteHubSpotModalProps> = ({ project, onClose }) => {
  const [discountPercent, setDiscountPercent] = useState<number>(25);
  const [tvaRate, setTvaRate] = useState<number>(20);
  const [includeLabor, setIncludeLabor] = useState<boolean>(true);
  
  // HubSpot API credentials & config
  const [hubspotToken, setHubspotToken] = useState<string>(() => {
    return localStorage.getItem('helios_hubspot_token') || '';
  });
  const [dealName, setDealName] = useState<string>(`Devis VMC KWL - ${project.name}`);
  const [dealStage, setDealStage] = useState<string>('appointmentscheduled');
  const [pipeline, setPipeline] = useState<string>('default');
  
  // Status states
  const [isSending, setIsSending] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; dealId?: string; error?: string } | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [showJsonPayload, setShowJsonPayload] = useState(false);

  // Recalculate quote dynamically
  const quote: ProjectQuote = calculateProjectQuote(project, discountPercent, tvaRate, includeLabor);
  const hubspotPayload = buildHubSpotDealPayload(project, quote, dealName, dealStage, pipeline);

  // Save token in localStorage
  useEffect(() => {
    if (hubspotToken) {
      localStorage.setItem('helios_hubspot_token', hubspotToken);
    }
  }, [hubspotToken]);

  const handleSendToHubSpot = async () => {
    setIsSending(true);
    setSyncResult(null);

    const result = await sendDealToHubSpot(hubspotToken, hubspotPayload);
    setIsSending(false);
    setSyncResult(result);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(hubspotPayload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2500);
  };

  const handleDownloadCSV = () => {
    const csvContent = exportQuoteToCSV(quote);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Devis_Helios_KWL_${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-950 p-6 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600 rounded-2xl text-white shadow-lg shadow-red-600/30">
              <DollarSign size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight">Chiffrage Helios & API HubSpot CRM</h3>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md text-[9px] font-black uppercase">
                  HubSpot Deals API
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Calcul des tarifs publics officiels Helios & Synchronisation automatique CRM
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Controls Bar (Remise, TVA, Main d'oeuvre) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-3 gap-4 text-xs font-bold">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1.5 flex items-center gap-1.5">
                <Percent size={12} className="text-blue-600" /> Remise Fournisseur / Installateur
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  step="5" 
                  value={discountPercent} 
                  onChange={e => setDiscountPercent(Number(e.target.value))} 
                  className="w-full accent-red-600 cursor-pointer"
                />
                <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-black text-slate-900 shrink-0 text-xs">
                  {discountPercent} %
                </span>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1.5 flex items-center gap-1.5">
                <Sliders size={12} className="text-emerald-600" /> Taux de TVA Appliqué
              </label>
              <div className="flex gap-1.5">
                {[
                  { label: '5.5% (Réno)', val: 5.5 },
                  { label: '10% (Interm.)', val: 10 },
                  { label: '20% (Standard)', val: 20 }
                ].map(t => (
                  <button
                    key={t.val}
                    onClick={() => setTvaRate(t.val)}
                    className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-black transition-all ${
                      tvaRate === t.val 
                        ? 'bg-slate-900 text-white shadow-sm' 
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 w-full cursor-pointer hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={includeLabor} 
                  onChange={e => setIncludeLabor(e.target.checked)} 
                  className="rounded text-red-600 w-4 h-4"
                />
                <span className="text-[10px] font-black uppercase text-slate-700">
                  Inclure Forfait Pose & Mise en service (1 850 € HT)
                </span>
              </label>
            </div>
          </div>

          {/* Itemized Quote Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
                Détail Chiffré des Fournitures Helios & Prestations
              </span>
              <button 
                onClick={handleDownloadCSV}
                className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-600 bg-white hover:bg-blue-50 px-3 py-1 rounded-lg border border-blue-200 transition-all shadow-sm"
              >
                <Download size={12} /> Exporter Devis (CSV / Excel)
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[8.5px] font-black uppercase text-slate-500 bg-slate-50/50">
                    <th className="py-2 px-3">Réf.</th>
                    <th className="py-2 px-3">Désignation</th>
                    <th className="py-2 px-3 text-right">P.U. HT</th>
                    <th className="py-2 px-3 text-center">Qté</th>
                    <th className="py-2 px-3 text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-1.5 px-3 font-mono font-bold text-slate-500 text-[10px]">{it.reference}</td>
                      <td className="py-1.5 px-3 font-bold text-slate-900 text-[11px] truncate max-w-[280px]">{it.designation}</td>
                      <td className="py-1.5 px-3 text-right font-medium text-slate-600">{it.unitPriceHT.toLocaleString('fr-FR')} €</td>
                      <td className="py-1.5 px-3 text-center font-black text-slate-900">{it.quantity}</td>
                      <td className="py-1.5 px-3 text-right font-black text-slate-900">{it.totalHT.toLocaleString('fr-FR')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Footer Box */}
            <div className="bg-slate-900 text-white p-4 grid grid-cols-4 gap-4 text-xs font-bold border-t border-slate-800">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Matériel Brut HT</span>
                <span className="text-sm font-black text-white">{quote.subtotalEquipmentHT.toLocaleString('fr-FR')} €</span>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Remise (-{quote.installerDiscountPercent}%)</span>
                <span className="text-sm font-black text-amber-400">-{quote.discountAmountHT.toLocaleString('fr-FR')} €</span>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase block">Total Net HT</span>
                <span className="text-base font-black text-white">{quote.totalHT.toLocaleString('fr-FR')} €</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black text-slate-400 uppercase block">Total TTC ({quote.tvaRatePercent}%)</span>
                <span className="text-xl font-black text-emerald-400">{quote.totalTTC.toLocaleString('fr-FR')} €</span>
              </div>
            </div>
          </div>

          {/* HubSpot CRM API Section */}
          <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-orange-600/30">
                  HS
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                    <span>Synchronisation Directe HubSpot CRM Deals</span>
                  </h4>
                  <p className="text-[9.5px] text-slate-400 font-bold">
                    Injecte automatiquement cette opportunité chiffrée dans votre pipeline commercial HubSpot
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowJsonPayload(prev => !prev)}
                className="text-[9px] font-black uppercase text-slate-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg transition-all"
              >
                {showJsonPayload ? 'Masquer JSON' : 'Inspecter Payload JSON'}
              </button>
            </div>

            {/* HubSpot Configuration Form */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 flex items-center gap-1">
                  <Key size={11} className="text-orange-400" /> Jeton Privé HubSpot (Private App Token)
                </label>
                <input 
                  type="password"
                  placeholder="pat-na1-xxxxxxxx-xxxx..."
                  value={hubspotToken}
                  onChange={e => setHubspotToken(e.target.value)}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-white placeholder-slate-500 text-xs font-mono outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                  Nom du Deal / Transaction
                </label>
                <input 
                  type="text"
                  value={dealName}
                  onChange={e => setDealName(e.target.value)}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                  Étape du Pipeline (Stage)
                </label>
                <select 
                  value={dealStage}
                  onChange={e => setDealStage(e.target.value)}
                  className="w-full bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:border-orange-500"
                >
                  <option value="appointmentscheduled">Rendez-vous planifié (Appointment Scheduled)</option>
                  <option value="qualifiedtobuy">Qualifié à l'achat (Qualified to Buy)</option>
                  <option value="presentationscheduled">Présentation devis (Presentation Scheduled)</option>
                  <option value="decisionmakerboughtin">Validation décideur (Decision Maker)</option>
                  <option value="contractsent">Devis / Contrat envoyé (Contract Sent)</option>
                  <option value="closedwon">Gagné / Signé (Closed Won)</option>
                </select>
              </div>
            </div>

            {/* Live Payload Viewer if toggled */}
            {showJsonPayload && (
              <div className="relative bg-slate-950 p-3.5 rounded-2xl border border-white/10 text-[10px] font-mono text-emerald-400 overflow-x-auto">
                <button
                  onClick={handleCopyJson}
                  className="absolute top-2.5 right-2.5 bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 transition-all"
                >
                  {copiedPayload ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copiedPayload ? 'Copié !' : 'Copier JSON'}</span>
                </button>
                <pre>{JSON.stringify(hubspotPayload, null, 2)}</pre>
              </div>
            )}

            {/* Sync Feedback Message */}
            {syncResult && (
              <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
                syncResult.success 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200' 
                  : 'bg-red-500/15 border-red-500/30 text-red-200'
              }`}>
                {syncResult.success ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" /> : <AlertCircle size={20} className="text-red-400 shrink-0" />}
                <div className="flex-1">
                  <div className="font-black uppercase tracking-wider text-[10px]">
                    {syncResult.success ? 'Opportunité HubSpot Créée avec Succès !' : 'Échec de la Synchronisation'}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5">
                    {syncResult.success ? `Deal ID : ${syncResult.dealId} • Montant : ${quote.totalHT} € HT` : syncResult.error}
                  </div>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-slate-400 font-bold">
                API Endpoint: <code>POST https://api.hubapi.com/crm/v3/objects/deals</code>
              </span>

              <button
                onClick={handleSendToHubSpot}
                disabled={isSending}
                className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-tight flex items-center gap-2 shadow-lg shadow-orange-600/30 active:scale-95 transition-all"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{isSending ? 'Envoi en cours...' : 'Envoyer le Devis vers HubSpot'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-bold text-slate-500">
            Tarifs indicatifs officiels Helios Ventilateurs France 2026
          </span>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-black uppercase transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
