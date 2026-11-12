"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronsUpDown, Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createOvertimeRequest, fetchOvertimeClientOptions } from "@/lib/api/overtime";
import { calculateOvertimePeriod, createOvertimeSchema } from "@/lib/overtime/validation";
import type { User } from "@/types";
import type { CreateOvertimePayload, OvertimeClientOption, OvertimeRequest } from "@/types/overtime";
import { DateField, dateLabel, durationLabel, overtimeError, wibDateTime } from "./shared";

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function OvertimeForm({ user, onClose, onCreated }: {
  user: User; onClose: () => void; onCreated: (row: OvertimeRequest) => void;
}) {
  const [form, setForm] = useState<CreateOvertimePayload>({ clientId: "", overtimeDate: todayWib(), startTime: "18:00", endTime: "20:00", endsNextDay: false, description: "" });
  const [clients, setClients] = useState<OvertimeClientOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const period = calculateOvertimePeriod(form);
  const validTimes = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) && /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(form.endTime);
  const validDuration = validTimes && Number.isFinite(period.endsAt.getTime()) && period.durationMinutes > 0 && period.durationMinutes <= 1440;
  const selectedClient = clients.find(client => client.id === form.clientId);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true); setOptionsError("");
    fetchOvertimeClientOptions().then(rows => { if (active) setClients(rows); })
      .catch(reason => { if (active) setOptionsError(overtimeError(reason)); })
      .finally(() => { if (active) setOptionsLoading(false); });
    return () => { active = false; };
  }, [retry]);

  function update<K extends keyof CreateOvertimePayload>(key: K, value: CreateOvertimePayload[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: "" }));
    setError("");
  }

  function validate(event: FormEvent) {
    event.preventDefault();
    const parsed = createOvertimeSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.path[0] === "clientId" ? "Pilih client terlebih dahulu" : issue.message;
      setFieldErrors(errors); return;
    }
    setFieldErrors({}); setConfirming(true);
  }

  async function submit() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try { onCreated(await createOvertimeRequest(form)); }
    catch (reason) { setError(overtimeError(reason)); setConfirming(false); }
    finally { savingRef.current = false; setSaving(false); }
  }

  const fieldError = (key: string) => fieldErrors[key] ? <p id={`overtime-${key}-error`} role="alert" className="text-xs text-destructive">{fieldErrors[key]}</p> : null;
  return <Dialog open onOpenChange={open => { if (!open && !savingRef.current) onClose(); }}>
    <DialogContent className="sm:max-w-[640px] p-6" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>{confirming ? "Konfirmasi pengajuan Overtime" : "Ajukan Overtime"}</DialogTitle>
        <DialogDescription>{confirming ? "Periksa kembali sebelum dikirim. Pengajuan tidak dapat diedit setelah dikirim." : "Satu pengajuan untuk satu sesi Overtime dan satu client. Semua waktu menggunakan WIB."}</DialogDescription>
      </DialogHeader>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {confirming ? <div className="space-y-5">
        <dl className="grid gap-4 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Pengaju</dt><dd className="mt-1 font-medium">{user.employee?.fullName || user.name}</dd></div>
          <div><dt className="text-muted-foreground">Client</dt><dd className="mt-1 break-words font-medium">{selectedClient?.name}</dd></div>
          <div><dt className="text-muted-foreground">Tanggal Overtime</dt><dd className="mt-1">{dateLabel(form.overtimeDate)}</dd></div>
          <div><dt className="text-muted-foreground">Waktu & durasi</dt><dd className="mt-1">{form.startTime}–{form.endTime} WIB{period.endsNextDay ? " (+1 hari)" : ""}<br />{durationLabel(period.durationMinutes)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Keterangan</dt><dd className="mt-1 whitespace-pre-wrap break-words">{form.description.trim()}</dd></div>
        </dl>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirming(false)}>Kembali ke form</Button>
          <Button type="button" disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Mengirim..." : "Ya, Kirim Pengajuan"}</Button>
        </div>
      </div> : <form onSubmit={validate} className="space-y-5" noValidate>
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm"><span className="text-muted-foreground">Pengaju</span><p className="mt-1 font-medium">{user.employee?.fullName || user.name}{user.employee?.employeeCode ? ` · ${user.employee.employeeCode}` : ""}</p></div>
        <div className="space-y-2">
          <Label>Client <span aria-hidden>*</span></Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
            <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="Client" aria-expanded={pickerOpen} aria-invalid={!!fieldErrors.clientId} aria-describedby={fieldErrors.clientId ? "overtime-clientId-error" : undefined} disabled={optionsLoading || !!optionsError || !clients.length} className="h-auto min-h-10 w-full justify-between whitespace-normal text-left font-normal"><span className="break-words">{selectedClient?.name || (optionsLoading ? "Memuat client..." : "Pilih client")}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder="Cari nama atau kode client..." /><CommandList><CommandEmpty>Client tidak ditemukan.</CommandEmpty><CommandGroup>{clients.map(client => <CommandItem key={client.id} value={`${client.name} ${client.code} ${client.id}`} onSelect={() => { update("clientId", client.id); setPickerOpen(false); }}><Check className={`mr-2 h-4 w-4 shrink-0 ${form.clientId === client.id ? "opacity-100" : "opacity-0"}`} /><span>{client.name}<span className="ml-2 text-xs text-muted-foreground">{client.code}</span></span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
          </Popover>
          {fieldError("clientId")}
          {optionsError ? <div role="alert" className="text-sm text-destructive">{optionsError} <Button type="button" variant="link" className="h-auto p-0" onClick={() => setRetry(value => value + 1)}>Coba lagi</Button></div> : <p className="text-xs text-muted-foreground">{!optionsLoading && !clients.length ? "Belum ada client aktif dengan kontrak aktif. Hubungi Admin." : "Client dengan kontrak aktif, diurutkan dari kontrak terbaru."}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Tanggal Overtime *</Label><DateField value={form.overtimeDate} onChange={value => update("overtimeDate", value)} label="Tanggal Overtime" />{fieldError("overtimeDate")}</div>
          <div className="space-y-2"><Label htmlFor="overtime-startTime">Jam mulai (WIB) *</Label><Input id="overtime-startTime" type="time" step="60" required value={form.startTime} aria-invalid={!!fieldErrors.startTime} aria-describedby={fieldErrors.startTime ? "overtime-startTime-error" : undefined} onChange={event => update("startTime", event.target.value)} />{fieldError("startTime")}</div>
          <div className="space-y-2"><Label htmlFor="overtime-endTime">Jam selesai (WIB) *</Label><div className="flex gap-2"><Input id="overtime-endTime" type={form.endTime === "24:00" ? "text" : "time"} readOnly={form.endTime === "24:00"} step="60" value={form.endTime} aria-invalid={!!fieldErrors.endTime} aria-describedby="overtime-endTime-error overtime-midnight-hint" onChange={event => update("endTime", event.target.value)} /><Button type="button" variant={form.endTime === "24:00" ? "secondary" : "outline"} aria-pressed={form.endTime === "24:00"} onClick={() => update("endTime", form.endTime === "24:00" ? "00:00" : "24:00")}>24:00</Button></div>{fieldError("endTime")}<p id="overtime-midnight-hint" className="text-xs text-muted-foreground">Tombol 24:00 untuk tepat tengah malam.</p></div>
        </div>
        <div className="flex items-center gap-2"><Checkbox id="overtime-next-day" checked={form.endsNextDay || form.endTime === "24:00"} disabled={form.endTime === "24:00"} onCheckedChange={checked => update("endsNextDay", checked === true)} /><Label htmlFor="overtime-next-day" className="font-normal">Selesai pada hari berikutnya (+1 hari)</Label></div>
        <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${validDuration ? "bg-primary/5" : "bg-muted/40"}`} aria-live="polite"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">{validDuration ? `Durasi: ${durationLabel(period.durationMinutes)}` : "Durasi belum valid"}</p><p className="mt-1 text-xs text-muted-foreground">{validDuration && Number.isFinite(period.endsAt.getTime()) ? `Selesai ${wibDateTime(period.endsAt)}. ` : ""}Maksimal 24 jam. Untuk melewati tengah malam, centang hari berikutnya.</p></div></div>
        <div className="space-y-2"><Label htmlFor="overtime-description">Keterangan Overtime *</Label><Textarea id="overtime-description" rows={4} maxLength={5000} placeholder="Jelaskan pekerjaan yang dilakukan saat Overtime..." value={form.description} aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? "overtime-description-error" : undefined} onChange={event => update("description", event.target.value)} />{fieldError("description")}<p className="text-right text-xs text-muted-foreground">{form.description.length}/5.000</p></div>
        <p className="text-xs text-muted-foreground">Pengajuan langsung masuk persetujuan Level 1. Jika ada kesalahan, batalkan saat masih menunggu dan ajukan ulang.</p>
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={optionsLoading || !!optionsError || !clients.length}>Periksa & Kirim</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
