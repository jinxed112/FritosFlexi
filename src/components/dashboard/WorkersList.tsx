'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWorker, toggleWorkerActive, resetWorkerPassword, deleteWorker } from '@/lib/actions/workers';
import { createMultiShifts } from '@/lib/actions/shifts';
import { calculateHours, calculateCost, formatEuro } from '@/utils';
import { FLEXI_CONSTANTS } from '@/types';
import {
  Plus, X, UserPlus, Calendar, Clock, ChevronLeft, ChevronRight,
  Search, MoreHorizontal, KeyRound, Power, Trash2, User, Mail, Phone,
  CreditCard, MapPin, FileCheck, AlertTriangle
} from 'lucide-react';

const PRESETS = [
  { label: 'Ouverture', start: '17:00', end: '21:30' },
  { label: 'Classique', start: '18:00', end: '21:30' },
  { label: 'Midi', start: '11:00', end: '15:00' },
  { label: 'Journée', start: '11:00', end: '21:30' },
];

const DAY_NAMES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

interface Props {
  workers: any[];
  locations: any[];
}

export default function WorkersList({ workers, locations }: Props) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Search & filters
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Detail/Assign panel
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [panelTab, setPanelTab] = useState<'fiche' | 'assign'>('fiche');

  // Assignment state
  const [assignWeekStart, setAssignWeekStart] = useState(() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return mon.toISOString().split('T')[0];
  });
  const [assignLocation, setAssignLocation] = useState('');
  const [assignRole, setAssignRole] = useState('polyvalent');
  const [assignSelectedDays, setAssignSelectedDays] = useState<string[]>([]);
  const [assignSchedules, setAssignSchedules] = useState<Record<string, { start: string; end: string }>>({});
  const [assignSameSchedule, setAssignSameSchedule] = useState(true);

  // Filtered workers
  const filtered = workers.filter((w: any) => {
    const matchSearch = `${w.first_name} ${w.last_name} ${w.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchSearch) return false;
    if (activeTab === 'complete') return w.profile_complete && w.is_active;
    if (activeTab === 'incomplete') return !w.profile_complete;
    return true;
  });

  const countComplete = workers.filter((w: any) => w.profile_complete && w.is_active).length;
  const countIncomplete = workers.filter((w: any) => !w.profile_complete).length;

  // Open detail panel
  const openWorkerPanel = (worker: any) => {
    setSelectedWorker(worker);
    setPanelTab('fiche');
    setAssignLocation(locations[0]?.id || '');
    setAssignRole('polyvalent');
    setAssignSelectedDays([]);
    setAssignSchedules({});
    setAssignSameSchedule(true);
    // Reset week to current
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    setAssignWeekStart(mon.toISOString().split('T')[0]);
  };

  // CRUD
  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      const result = await createWorker({
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        email: formData.get('email') as string,
        hourly_rate: parseFloat(formData.get('hourly_rate') as string) || 12.53,
        status: formData.get('status') as any,
      });
      if (result.tempPassword) setTempPassword(result.tempPassword);
      else setShowCreateModal(false);
      router.refresh();
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    setOpenMenuId(null);
    startTransition(async () => { await toggleWorkerActive(id, active); router.refresh(); });
  };

  const handleReset = (id: string, name: string) => {
    setOpenMenuId(null);
    startTransition(async () => {
      const result = await resetWorkerPassword(id);
      if ('newPassword' in result && result.newPassword) setResetInfo({ name, password: result.newPassword });
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => { await deleteWorker(id); setDeleteConfirm(null); setSelectedWorker(null); router.refresh(); });
  };

  // Assignment logic
  const assignWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(assignWeekStart);
    d.setDate(d.getDate() + i);
    return { date: d, iso: d.toISOString().split('T')[0], dayName: DAY_NAMES[i], num: d.getDate(), month: MONTH_NAMES[d.getMonth()] };
  });

  const navigateAssignWeek = (dir: number) => {
    const d = new Date(assignWeekStart);
    d.setDate(d.getDate() + dir * 7);
    setAssignWeekStart(d.toISOString().split('T')[0]);
    setAssignSelectedDays([]);
    setAssignSchedules({});
  };

  const toggleAssignDay = (iso: string) => {
    setAssignSelectedDays((prev) => {
      if (prev.includes(iso)) return prev.filter((d) => d !== iso);
      setAssignSchedules((s) => ({ ...s, [iso]: { start: PRESETS[0].start, end: PRESETS[0].end } }));
      return [...prev, iso];
    });
  };

  const applyAssignPreset = (p: typeof PRESETS[0]) => {
    const upd: Record<string, { start: string; end: string }> = {};
    assignSelectedDays.forEach((d) => { upd[d] = { start: p.start, end: p.end }; });
    setAssignSchedules((prev) => ({ ...prev, ...upd }));
  };

  const updateAssignSchedule = (iso: string, field: 'start' | 'end', value: string) => {
    if (assignSameSchedule) {
      setAssignSchedules((prev) => {
        const upd = { ...prev };
        assignSelectedDays.forEach((d) => { upd[d] = { ...(upd[d] || { start: '17:00', end: '21:30' }), [field]: value }; });
        return upd;
      });
    } else {
      setAssignSchedules((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));
    }
  };

  const handleAssignCreate = () => {
    if (!selectedWorker || assignSelectedDays.length === 0) return;
    startTransition(async () => {
      await createMultiShifts({
        worker_id: selectedWorker.id,
        location_id: assignLocation,
        role: assignRole,
        days: assignSelectedDays.map((iso) => ({
          date: iso,
          start_time: assignSchedules[iso]?.start || '17:00',
          end_time: assignSchedules[iso]?.end || '21:30',
        })),
      });
      setSelectedWorker(null);
      router.refresh();
    });
  };

  const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
    student: { label: 'Étudiant', bg: 'bg-blue-100', text: 'text-blue-700' },
    pensioner: { label: 'Pensionné', bg: 'bg-purple-100', text: 'text-purple-700' },
    employee: { label: 'Salarié', bg: 'bg-indigo-100', text: 'text-indigo-700' },
    other: { label: 'Autre', bg: 'bg-gray-100', text: 'text-gray-600' },
  };

  const formatH = (h: number) => { const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60); return mins > 0 ? `${hrs}h${mins.toString().padStart(2, '0')}` : `${hrs}h`; };
  const todayISO = new Date().toISOString().split('T')[0];

  const assignTotalCost = assignSelectedDays.reduce((sum, iso) => {
    const sc = assignSchedules[iso] || { start: '17:00', end: '21:30' };
    const h = calculateHours(sc.start + ':00', sc.end + ':00');
    return sum + calculateCost(h, selectedWorker?.hourly_rate || 12.53).total_cost;
  }, 0);

  const canAssign = selectedWorker?.is_active && selectedWorker?.profile_complete;

  return (
    <>
      {/* ============ HEADER ============ */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mon Équipe</h1>
        <button onClick={() => { setShowCreateModal(true); setTempPassword(''); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
          <UserPlus size={16} /> <span className="hidden sm:inline">Nouveau flexi</span><span className="sm:hidden">Ajouter</span>
        </button>
      </div>

      {/* ============ LIST CARD ============ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="p-3 sm:p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Recherche de candidats"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:bg-white focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-3 sm:px-4 gap-1 overflow-x-auto">
          {([
            { key: 'all', label: 'Tous', count: workers.length },
            { key: 'complete', label: 'Prêt à travailler', count: countComplete },
            { key: 'incomplete', label: 'Infos manquantes', count: countIncomplete },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label} <span className="text-xs text-gray-400 ml-1">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Table header — desktop */}
        <div className="hidden sm:grid grid-cols-[1fr_100px_100px_120px_60px] px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50 bg-gray-50/50">
          <div>Candidat(e)</div>
          <div className="text-center">Statut</div>
          <div className="text-center">Taux</div>
          <div className="text-center">Gains 2026</div>
          <div />
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-gray-400">Aucun worker trouvé</div>
          )}
          {filtered.map((w: any) => {
            const st = statusLabels[w.status] || statusLabels.other;
            const pct = w.status !== 'pensioner' ? Math.min((w.ytd_earnings / 18000) * 100, 100) : 0;
            const isMenuOpen = openMenuId === w.id;

            return (
              <div key={w.id} className={`group relative ${!w.is_active ? 'opacity-40' : ''}`}>
                <div
                  onClick={() => openWorkerPanel(w)}
                  className="px-3 sm:px-4 py-3 sm:py-3.5 flex sm:grid sm:grid-cols-[1fr_100px_100px_120px_60px] items-center gap-3 sm:gap-2 cursor-pointer hover:bg-orange-50/40 active:bg-orange-50 transition-colors"
                >
                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0 ${w.profile_complete ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gray-300'}`}>
                      {w.first_name?.[0]}{w.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{w.first_name} {w.last_name}</div>
                      {/* Mobile badges */}
                      <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                        {!w.profile_complete && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-500">Incomplet</span>}
                      </div>
                    </div>
                  </div>

                  {/* Statut — desktop */}
                  <div className="hidden sm:flex justify-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                  </div>

                  {/* Taux — desktop */}
                  <div className="hidden sm:block text-center text-sm text-gray-600">{w.hourly_rate} €/h</div>

                  {/* Gains — desktop */}
                  <div className="hidden sm:block text-center">
                    {w.status !== 'pensioner' ? (
                      <div>
                        <div className="text-xs text-gray-500">{w.ytd_earnings.toLocaleString('fr-BE')} €</div>
                        <div className="h-1.5 w-16 mx-auto bg-gray-100 rounded-full overflow-hidden mt-1">
                          <div className={`h-full rounded-full ${pct > 94 ? 'bg-red-500' : pct > 83 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">illimité</span>
                    )}
                  </div>

                  {/* Menu button */}
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setOpenMenuId(isMenuOpen ? null : w.id)}
                      className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600">
                      <MoreHorizontal size={16} />
                    </button>
                    {isMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-4 top-12 z-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-48">
                          <button onClick={() => { setOpenMenuId(null); openWorkerPanel(w); setPanelTab('assign'); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                            <Calendar size={14} /> Assigner missions
                          </button>
                          <button onClick={() => handleReset(w.id, `${w.first_name} ${w.last_name}`)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <KeyRound size={14} /> Reset mot de passe
                          </button>
                          <button onClick={() => handleToggle(w.id, !w.is_active)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Power size={14} /> {w.is_active ? 'Désactiver' : 'Réactiver'}
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button onClick={() => { setOpenMenuId(null); setDeleteConfirm({ id: w.id, name: `${w.first_name} ${w.last_name}` }); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50">
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          {filtered.length} worker{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* ============================================================
          DETAIL / ASSIGN PANEL (always opens on row click)
          ============================================================ */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setSelectedWorker(null)} />
          <div className="w-full sm:w-[28rem] bg-white shadow-2xl flex flex-col h-full">
            {/* Panel header */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold ${selectedWorker.profile_complete ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gray-300'}`}>
                  {selectedWorker.first_name?.[0]}{selectedWorker.last_name?.[0]}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{selectedWorker.first_name} {selectedWorker.last_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusLabels[selectedWorker.status]?.bg} ${statusLabels[selectedWorker.status]?.text}`}>
                      {statusLabels[selectedWorker.status]?.label}
                    </span>
                    {!selectedWorker.profile_complete && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-500">Profil incomplet</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedWorker(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Panel tabs */}
            <div className="flex border-b border-gray-100 px-4 flex-shrink-0">
              <button onClick={() => setPanelTab('fiche')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${panelTab === 'fiche' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <User size={14} className="inline mr-1.5 -mt-0.5" />Fiche
              </button>
              <button onClick={() => setPanelTab('assign')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${panelTab === 'assign' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Calendar size={14} className="inline mr-1.5 -mt-0.5" />Assigner
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">

              {/* ===== FICHE TAB ===== */}
              {panelTab === 'fiche' && (
                <div className="p-4 space-y-4">
                  {/* Info rows */}
                  <div className="space-y-0.5">
                    <InfoRow icon={<Mail size={14} />} label="Email" value={selectedWorker.email} />
                    <InfoRow icon={<Phone size={14} />} label="Téléphone" value={selectedWorker.phone} />
                    <InfoRow icon={<User size={14} />} label="Date de naissance" value={selectedWorker.date_of_birth ? new Date(selectedWorker.date_of_birth).toLocaleDateString('fr-BE') : null} />
                    <InfoRow icon={<CreditCard size={14} />} label="NISS" value={selectedWorker.niss} />
                    <InfoRow icon={<CreditCard size={14} />} label="IBAN" value={selectedWorker.iban} />
                    <InfoRow icon={<MapPin size={14} />} label="Adresse" value={
                      selectedWorker.address_street
                        ? `${selectedWorker.address_street}, ${selectedWorker.address_zip || ''} ${selectedWorker.address_city || ''}`
                        : null
                    } />
                    <InfoRow icon={<FileCheck size={14} />} label="Contrat-cadre" value={
                      selectedWorker.framework_contract_date
                        ? `Signé le ${new Date(selectedWorker.framework_contract_date).toLocaleDateString('fr-BE')}`
                        : null
                    } missing="Non signé" />
                  </div>

                  {/* Gains section */}
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Gains 2026</span>
                      <span className="text-sm font-bold text-gray-900">
                        {selectedWorker.ytd_earnings?.toLocaleString('fr-BE') || '0'} €
                        {selectedWorker.status !== 'pensioner' ? ' / 18 000 €' : ' (illimité)'}
                      </span>
                    </div>
                    {selectedWorker.status !== 'pensioner' && (() => {
                      const pct = Math.min((selectedWorker.ytd_earnings / 18000) * 100, 100);
                      return (
                        <>
                          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct > 94 ? 'bg-red-500' : pct > 83 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          {pct > 83 && (
                            <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${pct > 94 ? 'text-red-600' : 'text-amber-600'}`}>
                              <AlertTriangle size={12} />
                              {pct > 94 ? 'Très proche du plafond fiscal !' : 'Approche du plafond fiscal'}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Taux horaire */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Taux horaire</span>
                    <span className="text-lg font-bold text-gray-900">{selectedWorker.hourly_rate} €/h</span>
                  </div>

                  {/* Profile completeness */}
                  {!selectedWorker.profile_complete && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-red-500" />
                        <span className="text-sm font-medium text-red-700">Profil incomplet</span>
                      </div>
                      <p className="text-xs text-red-600">
                        Ce worker doit compléter son profil (NISS, adresse, IBAN, contrat-cadre...) avant de pouvoir être assigné à des missions.
                      </p>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="space-y-2 pt-2">
                    <button onClick={() => handleReset(selectedWorker.id, `${selectedWorker.first_name} ${selectedWorker.last_name}`)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50 border border-gray-200 transition-colors">
                      <KeyRound size={14} className="text-gray-400" /> Réinitialiser le mot de passe
                    </button>
                    <button onClick={() => handleToggle(selectedWorker.id, !selectedWorker.is_active)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm border transition-colors ${selectedWorker.is_active
                          ? 'text-red-600 hover:bg-red-50 border-red-200'
                          : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                        }`}>
                      <Power size={14} /> {selectedWorker.is_active ? 'Désactiver ce worker' : 'Réactiver ce worker'}
                    </button>
                    <button onClick={() => setDeleteConfirm({ id: selectedWorker.id, name: `${selectedWorker.first_name} ${selectedWorker.last_name}` })}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 border border-red-100 transition-colors">
                      <Trash2 size={14} /> Supprimer définitivement
                    </button>
                  </div>
                </div>
              )}

              {/* ===== ASSIGN TAB ===== */}
              {panelTab === 'assign' && (
                <div className="p-4 space-y-5">
                  {!canAssign ? (
                    <div className="p-6 bg-gray-50 rounded-xl text-center">
                      <AlertTriangle size={24} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-600 mb-1">Assignation impossible</p>
                      <p className="text-xs text-gray-400">
                        {!selectedWorker.is_active
                          ? 'Ce worker est désactivé. Réactivez-le d\'abord.'
                          : 'Le profil est incomplet. Le worker doit compléter ses informations (NISS, adresse, IBAN...) depuis son portail.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Location */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
                        <select value={assignLocation} onChange={(e) => setAssignLocation(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100">
                          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>

                      {/* Role */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Rôle</label>
                        <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100">
                          <option value="polyvalent">Polyvalent</option>
                          <option value="cuisine">Cuisine</option>
                          <option value="caisse">Caisse</option>
                        </select>
                      </div>

                      {/* Week nav */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Sélectionner les jours</label>
                        <div className="flex items-center justify-between mb-3">
                          <button onClick={() => navigateAssignWeek(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={16} /></button>
                          <span className="text-sm font-medium text-gray-700">
                            {new Date(assignWeekStart).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} — {assignWeekDays[6].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <button onClick={() => navigateAssignWeek(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronRight size={16} /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1.5">
                          {assignWeekDays.map((d) => {
                            const sel = assignSelectedDays.includes(d.iso);
                            const isPast = d.iso < todayISO;
                            return (
                              <button key={d.iso} onClick={() => !isPast && toggleAssignDay(d.iso)} disabled={isPast}
                                className={`py-3 rounded-xl text-center transition-all ${isPast ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                    : sel ? 'bg-orange-500 text-white shadow-md shadow-orange-200 scale-[1.02]'
                                      : d.iso === todayISO ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                  }`}>
                                <div className="text-[10px] font-medium opacity-60 uppercase">{d.dayName}</div>
                                <div className="text-lg font-bold leading-tight">{d.num}</div>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2">{assignSelectedDays.length} jour(s) sélectionné(s)</p>
                      </div>

                      {/* Schedule */}
                      {assignSelectedDays.length > 0 && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Horaire type</label>
                            <div className="flex gap-2 flex-wrap">
                              {PRESETS.map((p) => {
                                const first = assignSchedules[assignSelectedDays[0]];
                                const isActive = first && first.start === p.start && first.end === p.end;
                                return (
                                  <button key={p.label} onClick={() => applyAssignPreset(p)}
                                    className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${isActive ? 'border-orange-400 bg-orange-50 text-orange-600 shadow-sm' : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50'}`}>
                                    <Clock size={11} className="inline mr-1 -mt-0.5" />{p.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-medium text-gray-500">Horaires</label>
                              {assignSelectedDays.length > 1 && (
                                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
                                  <input type="checkbox" checked={assignSameSchedule} onChange={(e) => setAssignSameSchedule(e.target.checked)}
                                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                                  Même horaire
                                </label>
                              )}
                            </div>
                            <div className="space-y-2">
                              {(assignSameSchedule ? [assignSelectedDays[0]] : [...assignSelectedDays].sort()).map((iso) => {
                                const d = assignWeekDays.find((wd) => wd.iso === iso);
                                const sc = assignSchedules[iso] || { start: '17:00', end: '21:30' };
                                const h = calculateHours(sc.start + ':00', sc.end + ':00');
                                return (
                                  <div key={iso} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                                    <div className="text-xs text-gray-500 w-14 flex-shrink-0 font-medium">{assignSameSchedule ? 'Tous' : `${d?.dayName} ${d?.num}`}</div>
                                    <input type="time" value={sc.start} onChange={(e) => updateAssignSchedule(iso, 'start', e.target.value)}
                                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-orange-300 focus:outline-none" />
                                    <span className="text-gray-300 text-xs">→</span>
                                    <input type="time" value={sc.end} onChange={(e) => updateAssignSchedule(iso, 'end', e.target.value)}
                                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-orange-300 focus:outline-none" />
                                    <span className="text-[11px] text-gray-400 font-medium w-10 text-right">{formatH(h)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Cost */}
                          <div className="p-3 bg-orange-50 rounded-xl flex items-center justify-between">
                            <div>
                              <div className="text-xs text-orange-600 font-medium">Coût total estimé</div>
                              <div className="text-[10px] text-orange-400">{assignSelectedDays.length} shift(s)</div>
                            </div>
                            <div className="text-lg font-bold text-orange-700">{formatEuro(assignTotalCost)}</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Panel footer — assign button */}
            {panelTab === 'assign' && canAssign && (
              <div className="p-4 border-t flex gap-3 flex-shrink-0">
                <button onClick={() => setSelectedWorker(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Annuler</button>
                <button onClick={handleAssignCreate} disabled={isPending || assignSelectedDays.length === 0}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                  {isPending ? 'Création...' : `Proposer ${assignSelectedDays.length} shift(s)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ CREATE WORKER MODAL ============ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{tempPassword ? 'Compte créé ✓' : 'Nouveau flexi'}</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {tempPassword ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-emerald-700 mb-2">Mot de passe temporaire :</p>
                  <p className="text-2xl font-mono font-bold text-emerald-800 select-all">{tempPassword}</p>
                </div>
                <p className="text-xs text-gray-500 text-center">Communiquez ce mot de passe au flexi.</p>
                <button onClick={() => setShowCreateModal(false)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Fermer</button>
              </div>
            ) : (
              <form action={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
                    <input type="text" name="first_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                    <input type="text" name="last_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></div>
                </div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" name="email" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Taux horaire (€)</label>
                    <input type="number" name="hourly_rate" defaultValue="12.53" step="0.01" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
                    <select name="status" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                      <option value="student">Étudiant</option><option value="pensioner">Pensionné</option>
                      <option value="employee">Salarié</option><option value="other">Autre</option>
                    </select></div>
                </div>
                <button type="submit" disabled={isPending}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                  {isPending ? 'Création...' : 'Créer le compte'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ============ RESET PASSWORD MODAL ============ */}
      {resetInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-3">Mot de passe réinitialisé ✓</h3>
            <p className="text-sm text-gray-600 mb-3">{resetInfo.name}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 mb-1">Nouveau mot de passe :</p>
              <p className="text-2xl font-mono font-bold text-blue-800 select-all">{resetInfo.password}</p>
            </div>
            <button onClick={() => setResetInfo(null)} className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Fermer</button>
          </div>
        </div>
      )}

      {/* ============ DELETE CONFIRMATION ============ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-2">Supprimer ce worker ?</h3>
            <p className="text-sm text-gray-600 mb-1">{deleteConfirm.name}</p>
            <p className="text-xs text-red-500 mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} disabled={isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Helper component ============ */
function InfoRow({ icon, label, value, missing }: { icon: React.ReactNode; label: string; value: string | null | undefined; missing?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1 border-b border-gray-50 last:border-0">
      <div className="text-gray-300 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-400 font-medium">{label}</div>
        {value ? (
          <div className="text-sm text-gray-800 truncate">{value}</div>
        ) : (
          <div className="text-sm text-red-400 italic">{missing || 'Non renseigné'}</div>
        )}
      </div>
    </div>
  );
}