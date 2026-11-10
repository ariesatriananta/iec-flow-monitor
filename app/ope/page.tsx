"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, MoreHorizontal, Pencil, Plus, Printer, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OpeForm, OpeTotals } from "@/components/ope/OpeForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createOpeDocument, fetchOpeClientOptions, fetchOpeDocument, fetchOpeDocuments, updateOpeDocument } from "@/lib/api/ope";
import { fetchEmployees } from "@/lib/api/employees";
import { fetchSettings } from "@/lib/api/settings";
import { buildOpeDocumentHtml } from "@/lib/ope/document";
import { formatCurrency, formatDate } from "@/lib/numbering";
import type { Employee } from "@/types";
import type { OpeClientOption, OpeDocument, OpeInput, OpeStatus, OpeType } from "@/types/ope";

const PAGE_SIZE = 25;
const TYPE_LABELS: Record<OpeType, string> = { BUSINESS_TRIP: "Business Trip", MEALS: "Meals" };
const STATUS_LABELS: Record<OpeStatus, string> = { DRAFT: "Draft", ISSUED: "Issued", PAID: "Paid", VOID: "Void" };

const errorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "Terjadi kesalahan. Silakan coba lagi.";
  try { return (JSON.parse(error.message) as { error?: string }).error || error.message; }
  catch { return error.message; }
};

function StatusBadge({ status }: { status: OpeStatus }) {
  return <Badge variant={status === "VOID" ? "destructive" : status === "DRAFT" ? "secondary" : "default"}>{STATUS_LABELS[status]}</Badge>;
}

function OpeDetail({ document }: { document: OpeDocument }) {
  const isTrip = document.type === "BUSINESS_TRIP";
  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-2">
        <div><p className="text-sm text-muted-foreground">Nomor</p><p className="font-medium">{document.documentNumber}</p></div>
        <div><p className="text-sm text-muted-foreground">Tanggal</p><p>{formatDate(document.documentDate)}</p></div>
        <div><p className="text-sm text-muted-foreground">Jenis</p><p>{TYPE_LABELS[document.type]}</p></div>
        <div><p className="text-sm text-muted-foreground">Status</p><StatusBadge status={document.status} /></div>
        <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">Perihal</p><p className="break-words">{document.subject}</p></div>
        {isTrip && <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">Client</p><p className="font-medium">{document.clientSnapshot?.name ?? "-"}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{document.clientSnapshot?.address}</p></div>}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>No</TableHead>{isTrip ? <><TableHead>Karyawan</TableHead><TableHead>Hari</TableHead><TableHead>Tarif</TableHead></> : <><TableHead>Tanggal</TableHead><TableHead>Client</TableHead><TableHead>Deskripsi</TableHead></>}<TableHead className="text-right">Jumlah</TableHead></TableRow></TableHeader>
          <TableBody>{document.items?.map((item, index) => (
            <TableRow key={item.id}><TableCell>{index + 1}</TableCell>{isTrip ? <><TableCell className="min-w-40">{item.employeeName ?? "-"}</TableCell><TableCell>{item.days}</TableCell><TableCell className="whitespace-nowrap">{formatCurrency(item.rate ?? 0)}</TableCell></> : <><TableCell className="whitespace-nowrap">{item.expenseDate ? formatDate(item.expenseDate) : "-"}</TableCell><TableCell className="min-w-40">{item.clientSnapshot?.name ?? "-"}</TableCell><TableCell className="min-w-48 whitespace-normal break-words">{item.description}</TableCell></>}<TableCell className="whitespace-nowrap text-right">{formatCurrency(item.amount)}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </div>
      <OpeTotals {...document} />
      {document.notes && <div><p className="text-sm text-muted-foreground">Catatan</p><p className="whitespace-pre-wrap break-words">{document.notes}</p></div>}
    </div>
  );
}

export default function OpePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<OpeType>("BUSINESS_TRIP");
  const [status, setStatus] = useState<OpeStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<OpeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"create" | "edit" | "detail" | "preview" | null>(null);
  const [selected, setSelected] = useState<OpeDocument | null>(null);
  const [clients, setClients] = useState<OpeClientOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<{ document: OpeDocument; status: OpeStatus } | null>(null);
  const [signerName, setSignerName] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const previewHtml = useMemo(() => dialog === "preview" && selected
    ? buildOpeDocumentHtml(selected, { headerUrl: "/invoice-header.png", signerName })
    : "", [dialog, selected, signerName]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;
    setLoading(true);
    setLoadError("");
    setRows([]);
    const load = async () => {
      try {
        const result = await fetchOpeDocuments({ type, status: status === "ALL" ? undefined : status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
        if (!active) return;
        setRows(result.items);
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (page > lastPage) setPage(lastPage);
      } catch (error) {
        if (active) { setLoadError(errorMessage(error)); setTotal(0); }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [user?.role, type, status, page, reload]);

  const loadOptions = async (documentType: OpeType) => {
    const loadEmployees = async () => {
      if (documentType !== "BUSINESS_TRIP") return [];
      const all: Employee[] = [];
      let offset = 0;
      while (true) {
        const result = await fetchEmployees({ limit: 500, offset });
        all.push(...result.items);
        offset += result.items.length;
        if (!result.items.length || offset >= result.total) break;
      }
      return all;
    };
    const [clientRows, employeeRows] = await Promise.all([fetchOpeClientOptions(), loadEmployees()]);
    setClients(clientRows);
    setEmployees(employeeRows);
  };

  const openCreate = async () => {
    if (busyId) return;
    setBusyId("create");
    try {
      await loadOptions(type);
      setSelected(null);
      setDialog("create");
    } catch (error) { toast({ title: "Gagal memuat pilihan form", description: errorMessage(error), variant: "destructive" }); }
    finally { setBusyId(null); }
  };

  const openDocument = async (row: OpeDocument, mode: "edit" | "detail" | "preview") => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const document = await fetchOpeDocument(row.id);
      if (mode === "edit") {
        if (document.status !== "DRAFT") throw new Error("Dokumen sudah bukan Draft. Muat ulang daftar untuk melihat status terbaru.");
        await loadOptions(document.type);
      }
      if (mode === "preview") {
        const settings = await fetchSettings();
        setSignerName(settings?.defaultSignerName || "Anita Rahman, CPA");
        setPreviewReady(false);
        setPreviewError("");
      }
      setSelected(document);
      setDialog(mode);
    } catch (error) { toast({ title: "Gagal membuka dokumen", description: errorMessage(error), variant: "destructive" }); }
    finally { setBusyId(null); }
  };

  const checkPreviewReady = () => {
    const frameDocument = previewFrame.current?.contentDocument;
    if (!frameDocument) return;
    const images = Array.from(frameDocument.images);
    if (!images.length) return;
    if (images.some((image) => !image.complete || image.naturalWidth === 0)) {
      setPreviewError("Kop dokumen gagal dimuat. Tutup dan buka kembali preview sebelum mencetak.");
      setPreviewReady(false);
      return;
    }
    setPreviewReady(true);
  };

  const printDocument = () => {
    const printWindow = previewFrame.current?.contentWindow;
    if (!previewReady || !printWindow) return;
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      toast({ title: "Gagal membuka dialog cetak", description: "Silakan buka kembali preview dan coba lagi.", variant: "destructive" });
    }
  };

  const save = async (payload: OpeInput) => {
    if (saving) return;
    setSaving(true);
    try {
      const document = selected ? await updateOpeDocument(selected.id, payload) : await createOpeDocument(payload);
      setDialog(null);
      setSelected(null);
      setReload((value) => value + 1);
      toast({ title: "Draft berhasil disimpan", description: document.documentNumber });
    } catch (error) { toast({ title: "Gagal menyimpan OPE", description: errorMessage(error), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const changeStatus = async () => {
    if (!confirmation || saving) return;
    setSaving(true);
    try {
      await updateOpeDocument(confirmation.document.id, { status: confirmation.status });
      setConfirmation(null);
      setReload((value) => value + 1);
      toast({ title: "Status OPE berhasil diperbarui" });
    } catch (error) { toast({ title: "Gagal mengubah status", description: errorMessage(error), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const actions = (row: OpeDocument) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={!!busyId || saving} aria-label={`Aksi ${row.documentNumber}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void openDocument(row, "detail")}><Eye className="mr-2 h-4 w-4" />Lihat detail</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openDocument(row, "preview")}><FileText className="mr-2 h-4 w-4" />Preview / Print</DropdownMenuItem>
        {row.status === "DRAFT" && <><DropdownMenuItem onClick={() => void openDocument(row, "edit")}><Pencil className="mr-2 h-4 w-4" />Edit Draft</DropdownMenuItem><DropdownMenuItem onClick={() => setConfirmation({ document: row, status: "ISSUED" })}>Terbitkan</DropdownMenuItem></>}
        {row.status === "ISSUED" && <DropdownMenuItem onClick={() => setConfirmation({ document: row, status: "PAID" })}>Tandai Paid</DropdownMenuItem>}
        {(row.status === "DRAFT" || row.status === "ISSUED") && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmation({ document: row, status: "VOID" })}>Void</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AdminLayout title="OPE">
      {user?.role === "ADMIN" && <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-2xl font-bold">OPE</h1><p className="text-sm text-muted-foreground">Kelola dokumen biaya Business Trip dan Meals.</p></div>
          <Button disabled={!!busyId || saving} onClick={() => void openCreate()}><Plus className="mr-2 h-4 w-4" />{busyId === "create" ? "Memuat..." : `Buat ${TYPE_LABELS[type]}`}</Button>
        </div>
        <Tabs value={type} onValueChange={(value) => { setType(value as OpeType); setPage(1); }}>
          <TabsList><TabsTrigger value="BUSINESS_TRIP" disabled={!!busyId}>Business Trip</TabsTrigger><TabsTrigger value="MEALS" disabled={!!busyId}>Meals</TabsTrigger></TabsList>
        </Tabs>
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{TYPE_LABELS[type]}</CardTitle>
            <div className="flex gap-2"><Select value={status} onValueChange={(value) => { setStatus(value as OpeStatus | "ALL"); setPage(1); }}><SelectTrigger aria-label="Filter status" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Semua status</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" aria-label="Muat ulang daftar" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
          </CardHeader>
          <CardContent>
            {loadError ? <div role="alert" className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">{loadError}<Button variant="outline" className="ml-3" onClick={() => setReload((value) => value + 1)}>Coba lagi</Button></div> : loading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div> : rows.length === 0 ? <p className="py-12 text-center text-muted-foreground">Belum ada dokumen {TYPE_LABELS[type]}{status !== "ALL" ? ` berstatus ${STATUS_LABELS[status]}` : ""}.</p> : <>
              <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Nomor / Tanggal</TableHead><TableHead>Perihal</TableHead>{type === "BUSINESS_TRIP" && <TableHead>Client</TableHead>}<TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap"><p className="font-medium">{row.documentNumber}</p><p className="text-xs text-muted-foreground">{formatDate(row.documentDate)}</p></TableCell><TableCell className="min-w-48 max-w-sm whitespace-normal break-words">{row.subject}</TableCell>{type === "BUSINESS_TRIP" && <TableCell>{row.clientSnapshot?.name ?? "-"}</TableCell>}<TableCell className="whitespace-nowrap text-right font-medium">{formatCurrency(row.total)}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell className="text-right">{actions(row)}</TableCell></TableRow>)}</TableBody></Table></div>
              <div className="space-y-3 md:hidden">{rows.map((row) => <div key={row.id} className="space-y-2 rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><div><p className="break-all font-medium">{row.documentNumber}</p><p className="text-xs text-muted-foreground">{formatDate(row.documentDate)}</p></div>{actions(row)}</div><p className="break-words">{row.subject}</p>{type === "BUSINESS_TRIP" && <p className="text-sm text-muted-foreground">{row.clientSnapshot?.name ?? "-"}</p>}<div className="flex items-center justify-between gap-3"><StatusBadge status={row.status} /><span className="font-semibold">{formatCurrency(row.total)}</span></div></div>)}</div>
            </>}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Total {total} dokumen</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><span>{page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><Button size="sm" variant="outline" disabled={loading || page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>
          </CardContent>
        </Card>
      </div>}

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !saving) { setDialog(null); setSelected(null); } }}>
        <DialogContent className={dialog === "preview" ? "max-w-6xl" : "max-w-5xl"} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onPointerDownOutside={(event) => { if (dialog === "create" || dialog === "edit") event.preventDefault(); }}>
          <DialogHeader><DialogTitle>{dialog === "preview" ? "Preview" : dialog === "detail" ? "Detail" : dialog === "edit" ? "Edit" : "Buat"} OPE {TYPE_LABELS[selected?.type ?? type]}</DialogTitle><DialogDescription>{dialog === "preview" ? "Periksa dokumen sebelum mencetak atau menyimpan sebagai PDF." : dialog === "detail" ? "Rincian dokumen yang tersimpan." : "Lengkapi data header dan detail item. Dokumen disimpan sebagai Draft."}</DialogDescription></DialogHeader>
          {dialog === "preview" && selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{selected.documentNumber} · {STATUS_LABELS[selected.status]}</span>
              <Button disabled={!previewReady} onClick={printDocument}><Printer className="mr-2 h-4 w-4" />{previewError ? "Print tidak tersedia" : previewReady ? "Print / Simpan PDF" : "Memuat dokumen..."}</Button>
            </div>
            {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
            <iframe ref={previewFrame} title={`Preview ${selected.documentNumber}`} srcDoc={previewHtml}
              sandbox="allow-same-origin allow-modals" onLoad={checkPreviewReady}
              className="h-[65dvh] min-h-80 w-full rounded-md border bg-white" />
          </> : dialog === "detail" && selected ? <OpeDetail document={selected} /> : dialog && <OpeForm key={selected?.id ?? `new-${type}`} type={selected?.type ?? type} document={selected} clients={clients} employees={employees} saving={saving} onSave={save} onCancel={() => { setDialog(null); setSelected(null); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmation} onOpenChange={(open) => { if (!open && !saving) setConfirmation(null); }}>
        <DialogContent onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>{confirmation?.status === "ISSUED" ? "Terbitkan dokumen?" : confirmation?.status === "PAID" ? "Tandai sudah dibayar?" : "Void dokumen?"}</DialogTitle><DialogDescription>{confirmation?.document.documentNumber}. {confirmation?.status === "ISSUED" ? "Setelah diterbitkan, isi dokumen tidak dapat diedit." : confirmation?.status === "PAID" ? "Dokumen akan ditandai Paid dan tidak dapat dikembalikan ke status sebelumnya." : "Dokumen akan dibatalkan. Tindakan ini tidak dapat dikembalikan."}</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Batal</Button><Button variant={confirmation?.status === "VOID" ? "destructive" : "default"} disabled={saving} onClick={() => void changeStatus()}>{saving ? "Memproses..." : "Konfirmasi"}</Button></div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
