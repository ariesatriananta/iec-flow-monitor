"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { decideOvertimeRequest, fetchOvertimeRequest } from "@/lib/api/overtime";
import type { OvertimeAction, OvertimeEvent, OvertimeRequest } from "@/types/overtime";
import { StatusBadge, dateLabel, durationLabel, overtimeError, wibDateTime } from "./shared";

function eventLabel(event: OvertimeEvent) {
  const level = event.level ? ` Level ${event.level}` : "";
  return event.action === "SUBMIT" ? "Pengajuan dikirim" : event.action === "APPROVE" ? `Disetujui${level}`
    : event.action === "REJECT" ? `Ditolak${level}` : event.action === "CANCEL" ? "Pengajuan dibatalkan" : event.action;
}

export function OvertimeDetail({ id, canAct, onClose, onChanged }: {
  id: string; canAct: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [row, setRow] = useState<OvertimeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<OvertimeAction | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    fetchOvertimeRequest(id).then(result => { if (active) setRow(result); })
      .catch(reason => { if (active) setError(overtimeError(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reload]);

  async function decide() {
    if (!action || busyRef.current) return;
    if (action === "REJECT" && !note.trim()) { setActionError("Alasan penolakan wajib diisi."); return; }
    busyRef.current = true; setBusy(true); setActionError("");
    try {
      const updated = await decideOvertimeRequest(id, { action, ...(note.trim() ? { note: note.trim() } : {}) });
      setRow(updated); setAction(null); setNote(""); setReload(value => value + 1); onChanged();
    } catch (reason) { setActionError(overtimeError(reason)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function startAction(next: OvertimeAction) { setAction(next); setNote(""); setActionError(""); }
  const titles: Record<OvertimeAction, string> = { APPROVE: "Setujui pengajuan lembur?", REJECT: "Tolak pengajuan lembur?", CANCEL: "Batalkan pengajuan lembur?" };
  const actionLabels: Record<OvertimeAction, string> = { APPROVE: "Ya, Setujui", REJECT: "Ya, Tolak", CANCEL: "Ya, Batalkan Pengajuan" };
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current && !action) onClose(); }}>
    <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[680px] max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden" onInteractOutside={event => { if (busy || action) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy || action) event.preventDefault(); }}>
      <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5"><DialogTitle>Detail Pengajuan Lembur</DialogTitle><DialogDescription>Rincian sesi dan riwayat persetujuan dua level.</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      {error && <div role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}<Button variant="link" className="ml-2 h-auto p-0" onClick={() => setReload(value => value + 1)}>Coba lagi</Button></div>}
      {loading ? <div className="space-y-4" aria-label="Memuat detail lembur" aria-busy="true"><Skeleton className="h-8 w-44" /><Skeleton className="h-44 w-full" /><Skeleton className="h-28 w-full" /></div> : row && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge status={row.status} /><span className="text-xs text-muted-foreground">Diajukan {wibDateTime(row.createdAt)}</span></div>
        <dl className="grid gap-4 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Pengaju</dt><dd className="mt-1 break-words font-medium">{row.employeeName}</dd><dd className="text-xs text-muted-foreground">{row.employeeCode}</dd></div>
          <div><dt className="text-muted-foreground">Client</dt><dd className="mt-1 break-words font-medium">{row.clientName}</dd></div>
          <div><dt className="text-muted-foreground">Tanggal & jam lembur</dt><dd className="mt-1">{dateLabel(row.overtimeDate)}<br />{row.startTime}–{row.endTime} WIB{row.endsNextDay ? " (+1 hari)" : ""}</dd></div>
          <div><dt className="text-muted-foreground">Durasi</dt><dd className="mt-1 flex items-center gap-2 font-medium"><Clock3 className="h-4 w-4" />{durationLabel(row.durationMinutes)}</dd><dd className="mt-1 text-xs text-muted-foreground">Selesai {wibDateTime(row.endsAt)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Keterangan lembur</dt><dd className="mt-1 whitespace-pre-wrap break-words">{row.description}</dd></div>
        </dl>
        <section aria-label="Alur persetujuan"><h3 className="mb-3 text-sm font-semibold">Alur Persetujuan</h3><div className="grid gap-3 sm:grid-cols-2">{[{ level: 1, name: row.approverLevel1Name }, { level: 2, name: row.approverLevel2Name }].map(item => {
          const events = row.workflowEvents ?? [];
          const approved = events.some(event => event.action === "APPROVE" && event.level === item.level);
          const rejected = events.some(event => event.action === "REJECT" && event.level === item.level);
          const waiting = (item.level === 1 && row.status === "SUBMITTED") || (item.level === 2 && row.status === "WAITING_LEVEL_2");
          return <div key={item.level} className={`rounded-lg border p-3 ${waiting ? "border-primary/40 bg-primary/5" : ""}`}><p className="text-xs text-muted-foreground">Level {item.level}</p><p className="mt-1 break-words text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{rejected ? "Ditolak" : approved ? "Disetujui" : waiting ? "Menunggu persetujuan" : ["REJECTED", "CANCELLED"].includes(row.status) ? "Tidak dilanjutkan" : "Menunggu level sebelumnya"}</p></div>;
        })}</div><p className="mt-2 text-xs text-muted-foreground">Approver mengikuti pengaturan saat pengajuan dikirim.</p></section>
        <section aria-label="Riwayat pengajuan"><h3 className="mb-3 text-sm font-semibold">Riwayat Pengajuan</h3>{row.workflowEvents?.length ? <ol className="ml-2 space-y-4 border-l pl-5">{row.workflowEvents.map(event => <li key={event.id} className="relative text-sm"><span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background ${event.action === "REJECT" ? "bg-destructive" : event.action === "APPROVE" ? "bg-success" : "bg-primary"}`} /><p className="font-medium">{eventLabel(event)}</p><p className="mt-1 text-xs text-muted-foreground">{event.actorName || "Pengguna"} · {wibDateTime(event.createdAt)}</p>{event.note && <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3">{event.note}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Belum ada riwayat yang dapat ditampilkan.</p>}</section>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button variant="outline" disabled={busy} onClick={onClose}>Tutup</Button><div className="flex flex-col gap-2 sm:flex-row">
            {!error && row.permissions.canCancel && <Button variant="outline" disabled={busy} onClick={() => startAction("CANCEL")}>Batalkan Pengajuan</Button>}
            {!error && canAct && row.permissions.canApprove && <><Button variant="destructive" disabled={busy} onClick={() => startAction("REJECT")}><XCircle className="mr-2 h-4 w-4" />Tolak</Button><Button disabled={busy} onClick={() => startAction("APPROVE")}><CheckCircle2 className="mr-2 h-4 w-4" />Setujui Level {row.status === "SUBMITTED" ? 1 : 2}</Button></>}
          </div>
        </div>
      </div>}
      </div>
      <AlertDialog open={!!action} onOpenChange={open => { if (!open && !busyRef.current) setAction(null); }}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[500px]">
          <AlertDialogHeader><AlertDialogTitle>{action ? titles[action] : "Konfirmasi"}</AlertDialogTitle><AlertDialogDescription>{action === "APPROVE" ? row?.status === "SUBMITTED" ? "Pengajuan akan diteruskan ke approver Level 2." : "Persetujuan Level 2 akan menyelesaikan proses pengajuan ini." : action === "REJECT" ? "Penolakan mengakhiri proses pengajuan. Sampaikan alasan yang jelas kepada pengaju." : "Pengajuan yang dibatalkan tidak bisa diaktifkan kembali. Anda dapat membuat pengajuan baru."}</AlertDialogDescription></AlertDialogHeader>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <div className="space-y-2"><Label htmlFor="overtime-action-note">{action === "REJECT" ? "Alasan penolakan *" : "Catatan (opsional)"}</Label><Textarea id="overtime-action-note" value={note} onChange={event => { setNote(event.target.value); setActionError(""); }} maxLength={2000} rows={3} disabled={busy} aria-required={action === "REJECT"} placeholder={action === "REJECT" ? "Tuliskan alasan penolakan..." : "Tambahkan catatan jika diperlukan..."} /></div>
          <AlertDialogFooter className="gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>Kembali</Button><Button type="button" variant={action === "APPROVE" ? "default" : "destructive"} disabled={busy || (action === "REJECT" && !note.trim())} onClick={() => void decide()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Memproses..." : action ? actionLabels[action] : "Lanjutkan"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}
