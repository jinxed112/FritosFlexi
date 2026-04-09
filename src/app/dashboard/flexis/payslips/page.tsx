'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle,
  Trash2, Download, Eye, Clock, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { deletePayslipUpload } from '@/lib/actions/payslips';

interface PayslipUpload {
  id: string;
  original_filename: string;
  period_label: string | null;
  total_payslips: number;
  matched: number;
  unmatched: number;
  unmatched_details: Array<{
    name: string | null;
    niss: string | null;
    reason: string;
    pageStart: number;
  }>;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface PayslipDetail {
  id: string;
  worker_id: string;
  period_start: string;
  period_end: string;
  net_salary: number | null;
  gross_salary: number | null;
  employer_onss: number | null;
  hours_worked: string | null;
  establishment: string | null;
  viewed_at: string | null;
  flexi_workers: {
    first_name: string;
    last_name: string;
    niss: string;
    status: string;
  };
}

export default function AdminPayslipsPage() {
  const [uploads, setUploads] = useState<PayslipUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expandedUpload, setExpandedUpload] = useState<string | null>(null);
  const [uploadDetails, setUploadDetails] = useState<Record<string, PayslipDetail[]>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const fetchUploads = useCallback(async () => {
    const { data, error } = await supabase
      .from('payslip_uploads')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setUploads(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUploads(); }, [fetchUploads]);

  const handleUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Seuls les fichiers PDF sont acceptés');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 10 MB)');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await fetch('/api/payslips/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadResult({ error: result.error || 'Erreur inconnue' });
      } else {
        setUploadResult(result);
        fetchUploads();
      }
    } catch (err: any) {
      setUploadResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDelete = async (uploadId: string) => {
    if (!confirm('Supprimer cet upload et toutes les fiches associées ?')) return;
    setDeleting(uploadId);
    try {
      const result = await deletePayslipUpload(uploadId);
      if (result.error) {
        alert(`Erreur: ${result.error}`);
      } else {
        fetchUploads();
      }
    } catch {
      fetchUploads();
    }
    setDeleting(null);
  };

  const toggleExpand = async (upload: PayslipUpload) => {
    if (expandedUpload === upload.id) {
      setExpandedUpload(null);
      return;
    }
    setExpandedUpload(upload.id);

    // Load details if not cached
    if (!uploadDetails[upload.id] && upload.status === 'completed') {
      // Get payslips for this upload's period
      const { data } = await supabase
        .from('payslips')
        .select(`
          id, worker_id, period_start, period_end, net_salary, gross_salary,
          employer_onss, hours_worked, establishment, viewed_at,
          flexi_workers!inner(first_name, last_name, niss, status)
        `)
        .eq('upload_id', upload.id)
        .order('created_at', { ascending: true });

      if (data) {
        setUploadDetails(prev => ({ ...prev, [upload.id]: data as any }));
      }
    }
  };

  const handleDownload = async (payslipId: string, workerName: string, period: string) => {
    try {
      const res = await fetch(`/api/payslips/download?id=${payslipId}`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        alert(data.error || 'Erreur téléchargement');
      }
    } catch {
      alert('Erreur réseau');
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleDateString('fr-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const formatMoney = (n: number | null) =>
    n !== null ? `${n.toFixed(2)} €` : '—';

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fiches de paie</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uploadez le PDF Partena consolidé pour distribuer les fiches individuelles
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors mb-6 ${
          dragActive
            ? 'border-orange-400 bg-orange-50'
            : uploading
              ? 'border-gray-300 bg-gray-50'
              : 'border-gray-300 hover:border-orange-300 hover:bg-orange-50/50 cursor-pointer'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="text-orange-500 animate-spin" />
            <p className="text-sm font-medium text-gray-600">
              Traitement en cours... Extraction et découpe du PDF
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
              <Upload size={24} className="text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">
                Glissez le PDF Partena ici
              </p>
              <p className="text-sm text-gray-500 mt-1">
                ou cliquez pour sélectionner (PDF consolidé, max 10 MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div className={`rounded-xl p-4 mb-6 ${
          uploadResult.error
            ? 'bg-red-50 border border-red-200'
            : 'bg-green-50 border border-green-200'
        }`}>
          {uploadResult.error ? (
            <div className="flex items-start gap-3">
              <XCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Erreur</p>
                <p className="text-sm text-red-600 mt-1">{uploadResult.error}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800">
                  Upload réussi — {uploadResult.period}
                </p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-green-700">
                    ✅ {uploadResult.matched} fiche{uploadResult.matched > 1 ? 's' : ''} distribuée{uploadResult.matched > 1 ? 's' : ''}
                  </span>
                  {uploadResult.unmatched > 0 && (
                    <span className="text-amber-700">
                      ⚠️ {uploadResult.unmatched} non matchée{uploadResult.unmatched > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Matched details */}
                {uploadResult.details?.matched?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {uploadResult.details.matched.map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle size={14} />
                        <span className="font-medium">{m.workerName}</span>
                        <span className="text-green-600">— {formatMoney(m.netSalary)} net</span>
                        {m.establishment && (
                          <span className="text-green-500 text-xs">({m.establishment})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Unmatched details */}
                {uploadResult.details?.unmatched?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {uploadResult.details.unmatched.map((u: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-amber-700">
                        <AlertTriangle size={14} />
                        <span className="font-medium">{u.name || 'Inconnu'}</span>
                        {u.niss && <span className="text-xs text-amber-500">({u.niss})</span>}
                        <span className="text-amber-600">— {u.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload history */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Historique des uploads</h2>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Chargement...
        </div>
      ) : uploads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun upload pour l'instant</p>
          <p className="text-sm text-gray-400 mt-1">
            Uploadez votre premier PDF Partena ci-dessus
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {uploads.map((upload) => (
            <div key={upload.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Upload header */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(upload)}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  upload.status === 'completed' ? 'bg-green-100' :
                  upload.status === 'error' ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  {upload.status === 'completed' ? (
                    <CheckCircle size={20} className="text-green-600" />
                  ) : upload.status === 'error' ? (
                    <XCircle size={20} className="text-red-600" />
                  ) : (
                    <Clock size={20} className="text-amber-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">
                      {upload.period_label || upload.original_filename}
                    </p>
                    {upload.status === 'completed' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {upload.matched}/{upload.total_payslips}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(upload.created_at)}
                    {upload.period_label && (
                      <span className="ml-2 text-gray-400">• {upload.original_filename}</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {upload.unmatched > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      ⚠ {upload.unmatched}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(upload.id);
                    }}
                    disabled={deleting === upload.id}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Supprimer"
                  >
                    {deleting === upload.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                  {expandedUpload === upload.id ? (
                    <ChevronUp size={18} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedUpload === upload.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  {upload.status === 'error' && upload.error_message && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                      {upload.error_message}
                    </div>
                  )}

                  {/* Unmatched workers */}
                  {upload.unmatched_details && upload.unmatched_details.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
                        Non matchés ({upload.unmatched_details.length})
                      </p>
                      <div className="space-y-1">
                        {upload.unmatched_details.map((u, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm p-2 bg-amber-50 rounded-lg">
                            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                            <span className="font-medium text-amber-800">{u.name || 'Inconnu'}</span>
                            {u.niss && <span className="text-xs text-amber-500">NISS: {u.niss}</span>}
                            <span className="text-amber-600 text-xs">— {u.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched payslips table */}
                  {uploadDetails[upload.id] && uploadDetails[upload.id].length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Fiches distribuées ({uploadDetails[upload.id].length})
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                              <th className="pb-2 pr-3">Employé</th>
                              <th className="pb-2 pr-3">Lieu</th>
                              <th className="pb-2 pr-3 text-right">Brut</th>
                              <th className="pb-2 pr-3 text-right">Net</th>
                              <th className="pb-2 pr-3 text-right">ONSS empl.</th>
                              <th className="pb-2 pr-3 text-center">Consulté</th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadDetails[upload.id].map((p) => (
                              <tr key={p.id} className="border-b border-gray-50 last:border-0">
                                <td className="py-2 pr-3">
                                  <span className="font-medium text-gray-900">
                                    {(p.flexi_workers as any).first_name} {(p.flexi_workers as any).last_name}
                                  </span>
                                  <span className="text-xs text-gray-400 ml-1">
                                    ({(p.flexi_workers as any).status === 'student' ? 'ETU' : 'FLX'})
                                  </span>
                                </td>
                                <td className="py-2 pr-3 text-gray-600">
                                  {p.establishment || '—'}
                                </td>
                                <td className="py-2 pr-3 text-right text-gray-600">
                                  {formatMoney(p.gross_salary)}
                                </td>
                                <td className="py-2 pr-3 text-right font-medium text-gray-900">
                                  {formatMoney(p.net_salary)}
                                </td>
                                <td className="py-2 pr-3 text-right text-gray-500">
                                  {formatMoney(p.employer_onss)}
                                </td>
                                <td className="py-2 pr-3 text-center">
                                  {p.viewed_at ? (
                                    <Eye size={14} className="text-green-500 inline" />
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 text-right">
                                  <button
                                    onClick={() => handleDownload(
                                      p.id,
                                      `${(p.flexi_workers as any).first_name} ${(p.flexi_workers as any).last_name}`,
                                      p.period_start
                                    )}
                                    className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors"
                                    title="Télécharger le PDF"
                                  >
                                    <Download size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {/* Totals row */}
                          <tfoot>
                            <tr className="border-t border-gray-200 font-semibold text-gray-900">
                              <td className="pt-2 pr-3">Total</td>
                              <td className="pt-2 pr-3"></td>
                              <td className="pt-2 pr-3 text-right">
                                {formatMoney(
                                  uploadDetails[upload.id].reduce((s, p) => s + (p.gross_salary || 0), 0)
                                )}
                              </td>
                              <td className="pt-2 pr-3 text-right">
                                {formatMoney(
                                  uploadDetails[upload.id].reduce((s, p) => s + (p.net_salary || 0), 0)
                                )}
                              </td>
                              <td className="pt-2 pr-3 text-right">
                                {formatMoney(
                                  uploadDetails[upload.id].reduce((s, p) => s + (p.employer_onss || 0), 0)
                                )}
                              </td>
                              <td></td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}