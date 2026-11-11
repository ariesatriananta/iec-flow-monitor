"use client";

import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatCurrency } from "@/lib/numbering";
import { calculateOpeTotals, MAX_OPE_AMOUNT, opeInputSchema } from "@/lib/ope/validation";
import type { Employee } from "@/types";
import type { OpeClientOption, OpeDocument, OpeInput, OpeType } from "@/types/ope";

type Option = { id: string; label: string };
type Row = {
  key: string;
  employeeId: string;
  clientId: string;
  expenseDate: string;
  description: string;
  days: string;
  rate: string;
  amount: string;
};

const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
const newRow = (): Row => ({
  key: crypto.randomUUID(), employeeId: "", clientId: "", expenseDate: dateKey(new Date()),
  description: "", days: "1", rate: "", amount: "",
});

function SearchSelect({ value, options, onChange, label }: {
  value: string; options: Option[]; onChange: (value: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open}
          className="h-auto min-h-10 w-full justify-between text-left font-normal">
          <span className="min-w-0 break-words">{options.find((option) => option.id === value)?.label || `Pilih ${label.toLowerCase()}`}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Cari ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>Tidak ada pilihan.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.id} value={`${option.label} ${option.id}`} onSelect={() => { onChange(option.id); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${value === option.id ? "opacity-100" : "opacity-0"}`} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DatePicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={label} className="w-full justify-start font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "dd/MM/yyyy") : "Pilih tanggal"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} defaultMonth={selected} initialFocus onSelect={(date) => {
          if (date) { onChange(dateKey(date)); setOpen(false); }
        }} />
      </PopoverContent>
    </Popover>
  );
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <Input aria-label={label} inputMode="numeric" placeholder="0"
    value={value ? Number(value).toLocaleString("id-ID") : ""}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 15))} />;
}

export function OpeTotals({ subtotal, ppnAmount, pph23Amount, total, ppnRate, pph23Rate }: {
  subtotal: number; ppnAmount: number; pph23Amount: number; total: number; ppnRate: number; pph23Rate: number;
}) {
  return (
    <dl className="ml-auto w-full space-y-2 rounded-lg bg-muted/50 p-4 sm:max-w-sm">
      <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{formatCurrency(subtotal)}</dd></div>
      {ppnRate > 0 && <div className="flex justify-between gap-4"><dt>PPN ({ppnRate}%)</dt><dd>{formatCurrency(ppnAmount)}</dd></div>}
      {pph23Rate > 0 && <div className="flex justify-between gap-4"><dt>PPh 23 ({pph23Rate}%)</dt><dd>({formatCurrency(pph23Amount)})</dd></div>}
      <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><dt>Total</dt><dd>{formatCurrency(total)}</dd></div>
    </dl>
  );
}

export function OpeForm({ type, document, clients, employees, saving, onSave, onCancel }: {
  type: OpeType;
  document: OpeDocument | null;
  clients: OpeClientOption[];
  employees: Employee[];
  saving: boolean;
  onSave: (payload: OpeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [documentDate, setDocumentDate] = useState(document ? dateKey(document.documentDate) : dateKey(new Date()));
  const [clientId, setClientId] = useState(document?.clientId ?? "");
  const [subject, setSubject] = useState(document?.subject ?? "");
  const [notes, setNotes] = useState(document?.notes ?? "");
  const [usePpn, setUsePpn] = useState((document?.ppnRate ?? 0) > 0);
  const [usePph23, setUsePph23] = useState((document?.pph23Rate ?? 0) > 0);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>(() => document?.items?.map((item) => ({
    key: item.id, employeeId: item.employeeId ?? "", clientId: item.clientId ?? "",
    expenseDate: item.expenseDate ? dateKey(item.expenseDate) : dateKey(new Date()),
    description: item.description, days: String(item.days ?? 1), rate: item.rate === null ? "" : String(item.rate), amount: String(item.amount),
  })) ?? [newRow()]);

  const clientOptions: Option[] = clients.map((client) => ({ id: client.id, label: `${client.name} (${client.code})` }));
  const addClient = (id: string | null | undefined, name: string | undefined) => {
    if (id && !clientOptions.some((option) => option.id === id)) clientOptions.push({ id, label: `${name || id} (tersimpan)` });
  };
  addClient(document?.clientId, document?.clientSnapshot?.name);
  document?.items?.forEach((item) => addClient(item.clientId, item.clientSnapshot?.name));
  const employeeOptions: Option[] = employees.filter((employee) => employee.isActive).map((employee) => ({
    id: employee.id, label: `${employee.fullName || employee.employeeCode} (${employee.employeeCode})`,
  }));
  document?.items?.forEach((item) => {
    if (item.employeeId && !employeeOptions.some((option) => option.id === item.employeeId)) {
      employeeOptions.push({ id: item.employeeId, label: `${item.employeeName || item.employeeId} (tersimpan)` });
    }
  });

  const updateRow = (key: string, field: keyof Row, value: string) =>
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const amounts = rows.map((row) => type === "BUSINESS_TRIP" ? Number(row.days) * Number(row.rate) : Number(row.amount));
  let totals = { subtotal: 0, ppnAmount: 0, pph23Amount: 0, total: 0, ppnRate: usePpn ? 11 : 0, pph23Rate: usePph23 ? 2 : 0 };
  let calculationError = "";
  try {
    const filledAmounts = amounts.filter((amount) => amount !== 0);
    if (filledAmounts.length) {
      const computed = calculateOpeTotals(filledAmounts, usePpn, usePph23);
      totals = Object.fromEntries(Object.entries(computed).map(([key, value]) => [key, Number(value)])) as typeof totals;
    }
  } catch { calculationError = "Nominal atau total melebihi batas yang diizinkan."; }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    const header = { documentDate, subject, notes, usePpn, usePph23 };
    const payload: OpeInput = type === "BUSINESS_TRIP"
      ? { ...header, type, clientId, items: rows.map((row) => ({ employeeId: row.employeeId, days: Number(row.days), rate: Number(row.rate), description: row.description || undefined })) }
      : { ...header, type, items: rows.map((row) => ({ expenseDate: row.expenseDate, clientId: row.clientId, description: row.description, amount: Number(row.amount) })) };
    const parsed = opeInputSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const rowIndex = issue.path[0] === "items" && typeof issue.path[1] === "number" ? issue.path[1] : null;
      const labels: Record<string, string> = { documentDate: "Tanggal dokumen", subject: "Perihal", clientId: "Client", employeeId: "Karyawan", days: "Hari", rate: "Tarif", expenseDate: "Tanggal item", description: "Deskripsi", amount: "Nominal", items: "Detail item" };
      setError(`${rowIndex !== null ? `Baris ${rowIndex + 1}: ` : ""}${labels[String(issue.path.at(-1))] || "Data"} wajib diisi dengan nilai yang valid. Hari dan nominal harus bilangan bulat positif.`);
      return;
    }
    if (calculationError) { setError(calculationError); return; }
    await onSave(payload);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Nomor dokumen</Label><Input value={document?.documentNumber ?? "Otomatis saat disimpan"} readOnly />{!document && <p className="text-xs text-muted-foreground">Format I.042/ARM/XI/2026, satu urutan bersama Invoice, Business Trip, dan Meals.</p>}</div>
          <div className="space-y-2"><Label>Tanggal dokumen *</Label><DatePicker label="Tanggal dokumen" value={documentDate} onChange={setDocumentDate} /></div>
          {type === "BUSINESS_TRIP" && <div className="space-y-2 sm:col-span-2"><Label>Client *</Label><SearchSelect label="Client" value={clientId} options={clientOptions} onChange={setClientId} /></div>}
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="ope-subject">Perihal *</Label><Input id="ope-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={1000} required /></div>
        </div>
        <p className="text-xs text-muted-foreground">Pilihan client berdasarkan kontrak aktif terbaru. {type === "MEALS" && "Satu dokumen dapat memuat beberapa client."}</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Detail item</h3><Button type="button" size="sm" variant="outline" disabled={rows.length >= 500} onClick={() => setRows((current) => [...current, newRow()])}><Plus className="mr-1 h-4 w-4" />Tambah item</Button></div>
          {rows.map((row, index) => (
            <div key={row.key} className="space-y-3 rounded-lg border p-3 sm:p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">Item {index + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={`Hapus item ${index + 1}`} disabled={rows.length <= 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
              {type === "BUSINESS_TRIP" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2"><Label>Karyawan *</Label><SearchSelect label={`Karyawan item ${index + 1}`} value={row.employeeId} options={employeeOptions} onChange={(value) => updateRow(row.key, "employeeId", value)} /></div>
                  <div className="space-y-2"><Label>Hari *</Label><Input aria-label={`Hari item ${index + 1}`} inputMode="numeric" value={row.days} onChange={(event) => updateRow(row.key, "days", event.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
                  <div className="space-y-2"><Label>Tarif per hari (Rp) *</Label><MoneyInput label={`Tarif item ${index + 1}`} value={row.rate} onChange={(value) => updateRow(row.key, "rate", value)} /></div>
                  <div className="space-y-2"><Label>Jumlah</Label><Input aria-label={`Jumlah item ${index + 1}`} readOnly value={Number.isSafeInteger(amounts[index]) && amounts[index] <= MAX_OPE_AMOUNT ? formatCurrency(amounts[index]) : "Melebihi batas"} /></div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Tanggal *</Label><DatePicker label={`Tanggal item ${index + 1}`} value={row.expenseDate} onChange={(value) => updateRow(row.key, "expenseDate", value)} /></div>
                  <div className="space-y-2"><Label>Client *</Label><SearchSelect label={`Client item ${index + 1}`} value={row.clientId} options={clientOptions} onChange={(value) => updateRow(row.key, "clientId", value)} /></div>
                  <div className="space-y-2"><Label htmlFor={`description-${row.key}`}>Deskripsi *</Label><Input id={`description-${row.key}`} value={row.description} maxLength={1000} required onChange={(event) => updateRow(row.key, "description", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Nominal (Rp) *</Label><MoneyInput label={`Nominal item ${index + 1}`} value={row.amount} onChange={(value) => updateRow(row.key, "amount", value)} /></div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2"><Switch id="ope-ppn" checked={usePpn} onCheckedChange={setUsePpn} /><Label htmlFor="ope-ppn">PPN 11%</Label></div>
          <div className="flex items-center gap-2"><Switch id="ope-pph" checked={usePph23} onCheckedChange={setUsePph23} /><Label htmlFor="ope-pph">PPh 23 2%</Label></div>
        </div>
        <OpeTotals {...totals} />
        <div className="space-y-2"><Label htmlFor="ope-notes">Catatan</Label><Textarea id="ope-notes" value={notes} maxLength={10000} onChange={(event) => setNotes(event.target.value)} rows={3} /></div>
      </fieldset>
      {(error || calculationError) && <p role="alert" className="text-sm text-destructive">{error || calculationError}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Batal</Button><Button type="submit" disabled={saving || !!calculationError}>{saving ? "Menyimpan..." : "Simpan Draft"}</Button></div>
    </form>
  );
}
