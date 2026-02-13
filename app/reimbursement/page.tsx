"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createReimbursement,
  deleteReimbursementAttachment,
  fetchReimbursements,
  updateReimbursement,
} from "@/lib/api/reimbursement";
import {
  uploadReimbursementFile,
  type UploadReimbursementResponse,
} from "@/lib/api/uploads";
import { formatCurrency, formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { Reimbursement, ReimbursementAttachment } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { Loader2, Search, Upload, Wallet, X } from "lucide-react";

const categoryOptions = ["TRANSPORT", "MEAL", "OTHER"];
const statusOptions = ["ALL", "SUBMITTED", "APPROVED", "REJECTED", "PAID", "CANCELLED"];

const statusClass = (status: string) => {
  if (status === "APPROVED") return "bg-success text-success-foreground";
  if (status === "PAID") return "bg-chart-1 text-white";
  if (status === "REJECTED") return "bg-destructive text-destructive-foreground";
  if (status === "CANCELLED") return "bg-muted text-muted-foreground";
  return "bg-warning text-warning-foreground";
};

type PendingAction = {
  row: Reimbursement;
  nextStatus: string;
};

const mapUploadToPayload = (item: UploadReimbursementResponse) => ({
  url: item.url,
  key: item.key,
  fileName: item.fileName,
  contentType: item.contentType,
  size: item.size,
});

const isPurpose = (
  item: ReimbursementAttachment,
  purpose: "RECEIPT" | "PAID_PROOF"
) => item.purpose.toUpperCase() === purpose;

export default function ReimbursementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();

  const [rows, setRows] = useState<Reimbursement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const [category, setCategory] = useState("TRANSPORT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [uploadedReceipts, setUploadedReceipts] = useState<UploadReimbursementResponse[]>([]);
  const [isReceiptUploading, setIsReceiptUploading] = useState(false);

  const [paidProofFiles, setPaidProofFiles] = useState<Record<string, File[]>>({});
  const [paidProofDrafts, setPaidProofDrafts] = useState<
    Record<string, UploadReimbursementResponse[]>
  >({});
  const [isPaidProofUploadingById, setIsPaidProofUploadingById] = useState<
    Record<string, boolean>
  >({});
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchReimbursements({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        q: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Gagal memuat data reimbursement",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, debouncedSearch, page, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const getReceiptAttachments = (row: Reimbursement) => {
    const attachments = row.attachments?.filter((item) => isPurpose(item, "RECEIPT")) ?? [];
    if (attachments.length > 0) return attachments;
    if (row.receiptUrl) {
      return [
        {
          id: `legacy-receipt-${row.id}`,
          reimbursementId: row.id,
          purpose: "RECEIPT",
          fileUrl: row.receiptUrl,
          fileName: "receipt",
          uploadedBy: row.user?.id ?? "system",
          createdAt: row.createdAt,
        },
      ];
    }
    return [];
  };

  const getPaidProofAttachments = (row: Reimbursement) => {
    const attachments = row.attachments?.filter((item) => isPurpose(item, "PAID_PROOF")) ?? [];
    if (attachments.length > 0) return attachments;
    if (row.paidProofUrl) {
      return [
        {
          id: `legacy-paid-proof-${row.id}`,
          reimbursementId: row.id,
          purpose: "PAID_PROOF",
          fileUrl: row.paidProofUrl,
          fileName: "paid-proof",
          uploadedBy: row.user?.id ?? "system",
          createdAt: row.createdAt,
        },
      ];
    }
    return [];
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!category || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast({
        title: "Error",
        description: "Kategori dan nominal reimbursement wajib valid",
        variant: "destructive",
      });
      return;
    }
    if (uploadedReceipts.length === 0) {
      toast({
        title: "Error",
        description: "Upload minimal satu bukti reimbursement",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await createReimbursement({
        category,
        amount: numericAmount,
        description: description || undefined,
        receiptUrl: uploadedReceipts[0]?.url,
        attachments: uploadedReceipts.map(mapUploadToPayload),
      });

      setAmount("");
      setDescription("");
      setCategory("TRANSPORT");
      setReceiptFiles([]);
      setUploadedReceipts([]);
      if (page === 1) {
        await loadData();
      } else {
        setPage(1);
      }
      toast({ title: "Berhasil", description: "Reimbursement berhasil diajukan" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengajukan reimbursement";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadReceipt = async () => {
    if (receiptFiles.length === 0) {
      toast({
        title: "Error",
        description: "Pilih minimal satu file bukti terlebih dahulu",
        variant: "destructive",
      });
      return;
    }

    setIsReceiptUploading(true);
    try {
      const uploaded: UploadReimbursementResponse[] = [];
      for (const file of receiptFiles) {
        const result = await uploadReimbursementFile(file, "receipt");
        uploaded.push(result);
      }
      setUploadedReceipts((prev) => [...prev, ...uploaded]);
      setReceiptFiles([]);
      toast({
        title: "Berhasil",
        description: `${uploaded.length} file bukti berhasil diupload`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload bukti gagal";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsReceiptUploading(false);
    }
  };

  const handleUploadPaidProof = async (rowId: string) => {
    const files = paidProofFiles[rowId] ?? [];
    if (files.length === 0) {
      toast({
        title: "Error",
        description: "Pilih minimal satu file bukti transfer terlebih dahulu",
        variant: "destructive",
      });
      return;
    }

    setIsPaidProofUploadingById((prev) => ({ ...prev, [rowId]: true }));
    try {
      const uploaded: UploadReimbursementResponse[] = [];
      for (const file of files) {
        const result = await uploadReimbursementFile(file, "paid-proof");
        uploaded.push(result);
      }
      setPaidProofDrafts((prev) => ({
        ...prev,
        [rowId]: [...(prev[rowId] ?? []), ...uploaded],
      }));
      setPaidProofFiles((prev) => ({ ...prev, [rowId]: [] }));
      toast({
        title: "Berhasil",
        description: `${uploaded.length} bukti transfer berhasil diupload`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload bukti transfer gagal";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsPaidProofUploadingById((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const handleUpdateStatus = async (row: Reimbursement, status: string) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (isAdmin && status === "REJECTED") {
        payload.adminNote = "Nominal / bukti belum sesuai";
      }
      if (isAdmin && status === "PAID") {
        const draftPaidProofs = paidProofDrafts[row.id] ?? [];
        const existingPaidProofs = getPaidProofAttachments(row);
        if (draftPaidProofs.length === 0 && existingPaidProofs.length === 0) {
          toast({
            title: "Error",
            description: "Upload bukti transfer sebelum mark paid",
            variant: "destructive",
          });
          return;
        }
        payload.paidProofUrl = draftPaidProofs[0]?.url ?? existingPaidProofs[0]?.fileUrl;
        payload.paidProofAttachments = draftPaidProofs.map(mapUploadToPayload);
      }

      const updated = await updateReimbursement(row.id, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      if (status === "PAID") {
        setPaidProofDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
      toast({ title: "Berhasil", description: `Status reimbursement diubah ke ${status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const canDeleteAttachment = (row: Reimbursement, attachment: ReimbursementAttachment) => {
    if (attachment.id.startsWith("legacy-")) return false;
    if (isAdmin) return true;
    const isOwn = row.employeeId === user?.employeeId;
    const isSubmitted = row.status === "SUBMITTED";
    const isReceipt = attachment.purpose.toUpperCase() === "RECEIPT";
    return isOwn && isSubmitted && isReceipt;
  };

  const handleDeleteAttachment = async (
    row: Reimbursement,
    attachment: ReimbursementAttachment
  ) => {
    if (!canDeleteAttachment(row, attachment)) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await deleteReimbursementAttachment(attachment.id);
      setRows((prev) =>
        prev.map((item) => {
          if (item.id !== row.id) return item;
          const nextAttachments =
            item.attachments?.filter((entry) => entry.id !== attachment.id) ?? [];
          const nextReceipt =
            nextAttachments.find((entry) => isPurpose(entry, "RECEIPT"))?.fileUrl ?? null;
          const nextPaidProof =
            nextAttachments.find((entry) => isPurpose(entry, "PAID_PROOF"))?.fileUrl ??
            null;
          return {
            ...item,
            attachments: nextAttachments,
            receiptUrl: nextReceipt,
            paidProofUrl: nextPaidProof,
          };
        })
      );
      toast({ title: "Berhasil", description: "Attachment berhasil dihapus" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menghapus attachment";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const renderAttachmentLinks = (
    row: Reimbursement,
    items: ReimbursementAttachment[],
    emptyLabel = "-"
  ) => {
    if (items.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div key={`${item.fileUrl}-${index}`} className="flex items-center gap-1">
            <a
              href={item.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              {item.fileName || `File ${index + 1}`}
            </a>
            {canDeleteAttachment(row, item) && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                disabled={deletingAttachmentId === item.id}
                onClick={() => void handleDeleteAttachment(row, item)}
              >
                {deletingAttachmentId === item.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const actionText = (status: string) => {
    if (status === "APPROVED") return "approve";
    if (status === "REJECTED") return "reject";
    if (status === "PAID") return "mark paid";
    if (status === "CANCELLED") return "cancel";
    return "update";
  };

  return (
    <AdminLayout title="Reimbursement">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Reimbursement</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nominal</Label>
                <Input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="100000"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Deskripsi</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Keterangan biaya"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Bukti Reimbursement (multi file, max 5MB/file)</Label>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <Input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                    onChange={(event) => setReceiptFiles(Array.from(event.target.files ?? []))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={receiptFiles.length === 0 || isReceiptUploading}
                    onClick={() => void handleUploadReceipt()}
                  >
                    {isReceiptUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Upload Bukti
                  </Button>
                </div>
                {uploadedReceipts.length > 0 ? (
                  <div className="space-y-1">
                    {uploadedReceipts.map((item, index) => (
                      <div key={`${item.url}-${index}`} className="flex items-center justify-between text-xs">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {item.fileName}
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            setUploadedReceipts((prev) =>
                              prev.filter((entry) => entry.url !== item.url)
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Belum ada bukti terupload.
                  </p>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Ajukan Reimbursement"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Reimbursement</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <div className="relative md:w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari reimbursement..."
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "ALL" ? "Semua Status" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="hidden rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isAdmin && <TableHead>User</TableHead>}
                        <TableHead>Kategori</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead>Bukti</TableHead>
                        <TableHead>Bukti Bayar</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Diajukan</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 9 : 8} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Wallet className="h-8 w-8" />
                              <p>Belum ada data reimbursement</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => {
                          const receiptAttachments = getReceiptAttachments(row);
                          const paidProofAttachments = getPaidProofAttachments(row);
                          const paidProofDraftCount = paidProofDrafts[row.id]?.length ?? 0;

                          return (
                            <TableRow key={row.id}>
                              {isAdmin && (
                                <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>
                              )}
                              <TableCell>{row.category}</TableCell>
                              <TableCell>{formatCurrency(Number(row.amount))}</TableCell>
                              <TableCell className="max-w-[240px] truncate">{row.description ?? "-"}</TableCell>
                              <TableCell>{renderAttachmentLinks(row, receiptAttachments, "-")}</TableCell>
                              <TableCell>{renderAttachmentLinks(row, paidProofAttachments, "-")}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusClass(row.status)}>
                                  {row.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDate(new Date(row.createdAt))}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  {isAdmin && row.status === "SUBMITTED" && (
                                    <>
                                      <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                        Approve
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}>
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                  {isAdmin && row.status === "APPROVED" && (
                                    <div className="flex flex-col items-end gap-2">
                                      <div className="flex w-[260px] items-center gap-2">
                                        <Input
                                          type="file"
                                          multiple
                                          className="h-8 text-xs"
                                          accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                                          onChange={(event) =>
                                            setPaidProofFiles((prev) => ({
                                              ...prev,
                                              [row.id]: Array.from(event.target.files ?? []),
                                            }))
                                          }
                                        />
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={
                                            (paidProofFiles[row.id]?.length ?? 0) === 0 ||
                                            Boolean(isPaidProofUploadingById[row.id])
                                          }
                                          onClick={() => void handleUploadPaidProof(row.id)}
                                        >
                                          {isPaidProofUploadingById[row.id] ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Upload className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </div>
                                      {paidProofDraftCount > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                          Draft bukti bayar terupload: {paidProofDraftCount}
                                        </p>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setPendingAction({ row, nextStatus: "PAID" })}
                                        disabled={paidProofAttachments.length === 0 && paidProofDraftCount === 0}
                                      >
                                        Mark Paid
                                      </Button>
                                    </div>
                                  )}
                                  {!isAdmin && row.status === "SUBMITTED" && (
                                    <Button size="sm" variant="outline" onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                      Cancel
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                      <Wallet className="h-8 w-8" />
                      <p>Belum ada data reimbursement</p>
                    </div>
                  ) : (
                    rows.map((row) => {
                      const receiptAttachments = getReceiptAttachments(row);
                      const paidProofAttachments = getPaidProofAttachments(row);
                      const paidProofDraftCount = paidProofDrafts[row.id]?.length ?? 0;

                      return (
                        <div key={row.id} className="rounded-md border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{row.category}</p>
                              <p className="text-xs text-muted-foreground">
                                {isAdmin
                                  ? row.employee?.fullName ?? row.user?.name ?? "-"
                                  : "Pengajuan Saya"}
                              </p>
                            </div>
                            <Badge variant="outline" className={statusClass(row.status)}>
                              {row.status}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm font-semibold">{formatCurrency(Number(row.amount))}</p>
                          <p className="mt-1 text-sm">{row.description ?? "-"}</p>
                          <div className="mt-2 space-y-1 text-xs">
                            <div>
                              <span className="text-muted-foreground">Bukti: </span>
                              {renderAttachmentLinks(row, receiptAttachments, "-")}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Bukti Bayar: </span>
                              {renderAttachmentLinks(row, paidProofAttachments, "-")}
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            {isAdmin && row.status === "SUBMITTED" && (
                              <>
                                <Button size="sm" onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {isAdmin && row.status === "APPROVED" && (
                              <div className="flex w-full flex-col items-end gap-2">
                                <div className="flex w-full items-center gap-2">
                                  <Input
                                    type="file"
                                    multiple
                                    className="h-8 text-xs"
                                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                                    onChange={(event) =>
                                      setPaidProofFiles((prev) => ({
                                        ...prev,
                                        [row.id]: Array.from(event.target.files ?? []),
                                      }))
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      (paidProofFiles[row.id]?.length ?? 0) === 0 ||
                                      Boolean(isPaidProofUploadingById[row.id])
                                    }
                                    onClick={() => void handleUploadPaidProof(row.id)}
                                  >
                                    {isPaidProofUploadingById[row.id] ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Upload className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                                {paidProofDraftCount > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Draft bukti bayar terupload: {paidProofDraftCount}
                                  </p>
                                )}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPendingAction({ row, nextStatus: "PAID" })}
                                  disabled={paidProofAttachments.length === 0 && paidProofDraftCount === 0}
                                >
                                  Mark Paid
                                </Button>
                              </div>
                            )}
                            {!isAdmin && row.status === "SUBMITTED" && (
                              <Button size="sm" variant="outline" onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {total === 0
                      ? "Menampilkan 0 dari 0 data"
                      : `Menampilkan ${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                          page * PAGE_SIZE,
                          total
                        )} dari ${total} data`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page <= 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={page * PAGE_SIZE >= total}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ActionConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title="Konfirmasi Aksi"
        description={pendingAction ? `Yakin ingin ${actionText(pendingAction.nextStatus)} data ini?` : ""}
        confirmLabel={pendingAction ? actionText(pendingAction.nextStatus).toUpperCase() : "Lanjutkan"}
        destructive={pendingAction?.nextStatus === "REJECTED"}
        onConfirm={() => {
          if (!pendingAction) return;
          void handleUpdateStatus(pendingAction.row, pendingAction.nextStatus);
          setPendingAction(null);
        }}
      />
    </AdminLayout>
  );
}

