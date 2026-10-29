import React, { useState } from 'react';
import { Project } from '../types';
import { 
  Github, Download, Copy, Check, Terminal, ExternalLink, 
  HelpCircle, AlertTriangle, ArrowRight, ShieldCheck, FileCode, CheckCircle2 
} from 'lucide-react';

interface GitHubHelpModalProps {
  project: Project;
  onClose: () => void;
  onExportLocalProject: () => void;
}

export const GitHubHelpModal: React.FC<GitHubHelpModalProps> = ({ 
  project, 
  onClose, 
  onExportLocalProject 
}) => {
  const [copiedCommands, setCopiedCommands] = useState(false);
  const [repoName, setRepoName] = useState('helios-vmc-habitat');

  const gitBashScript = `# 1. Initialiser le dépôt local (si ce n'est pas déjà fait)
git init
git add .
git commit -m "feat: Helios KWL VentiPro application & project ${project.name}"

# 2. Lier à votre dépôt GitHub distant
# Remplacez VOTRE_NOM_UTILISATEUR par votre pseudo GitHub :
git remote add origin https://github.com/VOTRE_NOM_UTILISATEUR/${repoName}.git
git branch -M main

# 3. Pousser le code sur votre GitHub
git push -u origin main`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(gitBashScript);
    setCopiedCommands(true);
    setTimeout(() => setCopiedCommands(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[170] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-950 p-6 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-800 rounded-2xl text-white shadow-lg border border-white/10">
              <Github size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Charger votre projet sur GitHub</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Guide d'exportation de code & Sauvegarde de projet
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-all text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 text-slate-700">
          
          {/* Explanation Box */}
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs flex items-start gap-3 text-amber-900">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-black uppercase tracking-tight block">Pourquoi le chargement direct GitHub ne se lance pas automatiquement ?</span>
              <p className="mt-1 text-amber-800 text-[11px] leading-relaxed">
                L'environnement Google AI Studio s'exécute dans un bac à sable sécurisé isolé. Pour des raisons strictes de sécurité et de confidentialité, vos identifiants ou tokens personnels GitHub ne sont pas accessibles par le navigateur.
              </p>
            </div>
          </div>

          {/* Option 1: Fast Git Push via Terminal */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Terminal size={16} className="text-blue-600" />
                <span>Méthode 1 : Commandes Git prêtes à l'emploi (Recommandée)</span>
              </span>
              <button
                onClick={handleCopyScript}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 shadow"
              >
                {copiedCommands ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedCommands ? 'Copié !' : 'Copier les commandes'}</span>
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800 space-y-1">
              <pre className="text-emerald-400 font-semibold">{gitBashScript}</pre>
            </div>

            <p className="text-[10px] text-slate-500">
              💡 <strong>Astuce :</strong> Créez au préalable un nouveau dépôt vide sur votre compte <a href="https://github.com/new" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">github.com/new</a> sans fichier README initial, puis collez ces commandes.
            </p>
          </div>

          {/* Option 2: Local Project File (.helios) */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <FileCode size={16} className="text-red-600" />
              <span>Méthode 2 : Télécharger le fichier source de projet (.helios)</span>
            </span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Vous pouvez sauvegarder l'intégralité de votre plan, gaines, débits, bilans acoustiques et réglages sous la forme d'un fichier autonome <code>.helios</code> pour le versionner vous-même dans Git ou l'échanger avec un collègue.
            </p>

            <button
              onClick={() => {
                onExportLocalProject();
                onClose();
              }}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-red-500/20 active:scale-95 transition-all"
            >
              <Download size={16} />
              <span>Télécharger le fichier de sauvegarde (.helios)</span>
            </button>
          </div>

          {/* Option 3: AI Studio Direct Download / Fork */}
          <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 text-[11px] text-blue-900 space-y-1.5">
            <div className="flex items-center gap-2 font-black uppercase text-xs text-blue-950">
              <ShieldCheck size={16} className="text-blue-600" />
              <span>Téléchargement ZIP depuis AI Studio</span>
            </div>
            <p className="text-blue-800">
              Vous pouvez également utiliser le menu de l'interface Google AI Studio en haut à droite (bouton <strong>Share / Export</strong> ou <strong>Download Code</strong>) pour obtenir une archive complète <code>.zip</code> de l'application avec tout le code TypeScript et les dépendances.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-bold text-slate-400">
            Helios KWL Habitat • Compatible Git, GitHub, GitLab & Bitbucket
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-slate-800 transition-all active:scale-95 shadow"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
