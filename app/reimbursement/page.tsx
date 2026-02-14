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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createReimbursement,
  deleteReimbursement,
  deleteReimbursementAttachment,
  fetchReimbursements,
  updateReimbursement,
} from "@/lib/api/reimbursement";
import { fetchApprovalFlowSettings } from "@/lib/api/settings";
import {
  uploadReimbursementFile,
  type UploadReimbursementResponse,
} from "@/lib/api/uploads";
import { formatCurrency, formatDate } from "@/lib/numbering";
import { useAuth } from "@/contexts/AuthContext";
import type { Reimbursement, ReimbursementAttachment, WorkflowEvent } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { Eye, Loader2, MoreHorizontal, Search, Trash2, Upload, Wallet, X } from "lucide-react";

const categoryOptions = ["TRANSPORT", "MEAL", "OTHER"];
const statusOptions = ["ALL", "SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "REJECTED", "PAID", "CANCELLED"];

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

const formatActorLabel = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  const name = event.actorEmployee?.fullName ?? event.actorUser?.name ?? "-";
  const title = event.actorEmployee?.title ?? null;
  return [name, title].filter(Boolean).join(" - ");
};

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const findLatestEvent = (
  events: WorkflowEvent[],
  predicate: (event: WorkflowEvent) => boolean
) => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (predicate(events[i])) return events[i];
  }
  return null;
};

const getEventDotClass = (event: WorkflowEvent) => {
  if (event.toStatus === "PAID") return "border-chart-1 bg-chart-1";
  if (event.toStatus === "APPROVED") return "border-success bg-success";
  if (event.toStatus === "REJECTED") return "border-destructive bg-destructive";
  if (event.toStatus === "CANCELLED") return "border-muted-foreground bg-muted-foreground";
  return "border-warning bg-warning";
};

const getEventActionLabel = (event: WorkflowEvent) => {
  switch (event.action) {
    case "SUBMITTED":
      return "Pengajuan dibuat";
    case "APPROVED_L1":
      return "Disetujui Level 1";
    case "APPROVED_L2":
      return "Disetujui Level 2";
    case "APPROVED":
      return "Disetujui";
    case "REJECTED_L1":
      return "Ditolak Level 1";
    case "REJECTED_L2":
      return "Ditolak Level 2";
    case "CANCELLED":
      return "Dibatalkan";
    case "MARKED_PAID":
      return "Ditandai Sudah Dibayar";
    case "HARD_DELETED":
      return "Dihapus Permanen";
    case "STATUS_CHANGED":
      return "Perubahan Status";
    default:
      return event.action;
  }
};

const getWorkflowStatusLabel = (status?: string | null) => {
  switch (status) {
    case "SUBMITTED":
      return "Diajukan";
    case "WAITING_LEVEL_2":
      return "Menunggu Level 2";
    case "APPROVED":
      return "Disetujui";
    case "REJECTED":
      return "Ditolak";
    case "CANCELLED":
      return "Dibatalkan";
    case "PAID":
      return "Dibayar";
    default:
      return status ?? "-";
  }
};

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
  const [deleteTarget, setDeleteTarget] = useState<Reimbursement | null>(null);
  const [detailRow, setDetailRow] = useState<Reimbursement | null>(null);
  const [approvalLevels, setApprovalLevels] = useState<1 | 2>(2);
  const [approverLevel1EmployeeId, setApproverLevel1EmployeeId] = useState<string | null>(null);
  const [approverLevel2EmployeeId, setApproverLevel2EmployeeId] = useState<string | null>(null);
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
    void (async () => {
      try {
        const settings = await fetchApprovalFlowSettings();
        setApprovalLevels(settings.reimbursementApprovalLevels);
        setApproverLevel1EmployeeId(settings.reimbursementApproverLevel1EmployeeId);
        setApproverLevel2EmployeeId(settings.reimbursementApproverLevel2EmployeeId);
      } catch {
        setApprovalLevels(2);
        setApproverLevel1EmployeeId(null);
        setApproverLevel2EmployeeId(null);
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const isApproverLevel1 = Boolean(user?.employeeId) && user?.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    approvalLevels === 2 &&
    Boolean(user?.employeeId) &&
    user?.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;
  const canApprovalAction = (status: string) => status === "SUBMITTED" || status === "WAITING_LEVEL_2";
  const canMarkPaid = (status: string) =>
    status === "APPROVED" && (approvalLevels === 2 ? isApproverLevel2 : isApproverLevel1);
  const getApproveLabel = (status: string) => {
    if (status === "SUBMITTED" && approvalLevels === 2) return "Approve L1";
    if (status === "WAITING_LEVEL_2") return "Approve L2";
    return "Approve";
  };
  const getStatusLabel = (status: string) => (status === "WAITING_LEVEL_2" ? "WAITING L2" : status);

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
      if (isApprover && status === "REJECTED") {
        payload.adminNote = "Nominal / bukti belum sesuai";
      }
      if (isApprover && status === "PAID") {
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
      toast({ title: "Berhasil", description: `Status reimbursement diubah ke ${updated.status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleHardDelete = async (row: Reimbursement) => {
    try {
      await deleteReimbursement(row.id);
      if (rows.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadData();
      }
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ title: "Berhasil", description: "Reimbursement dihapus permanen" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus reimbursement";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
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

  const getTrackingMessage = (row: Reimbursement) => {
    const events = row.workflowEvents ?? [];
    const paidEvent = findLatestEvent(events, (event) => event.action === "MARKED_PAID");
    const cancelEvent = findLatestEvent(events, (event) => event.action === "CANCELLED");
    const rejectEvent = findLatestEvent(events, (event) => event.toStatus === "REJECTED");

    if (paidEvent) {
      return `Reimbursement dibayarkan oleh ${formatActorLabel(paidEvent)} pada ${formatDateTime(
        paidEvent.createdAt
      )}`;
    }
    if (cancelEvent) {
      return `Pengajuan dibatalkan oleh ${formatActorLabel(cancelEvent)} pada ${formatDateTime(
        cancelEvent.createdAt
      )}`;
    }
    if (rejectEvent) {
      return `Pengajuan ditolak oleh ${formatActorLabel(rejectEvent)} pada ${formatDateTime(
        rejectEvent.createdAt
      )}`;
    }
    if (row.status === "WAITING_LEVEL_2") return "Approval level 1 selesai, menunggu level 2";
    if (row.status === "APPROVED") return "Pengajuan approved, menunggu pencairan";
    if (row.status === "SUBMITTED") return "Menunggu approval level 1";
    return "Status reimbursement sedang diproses";
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
                        {isAdmin && <TableHead>Pemohon</TableHead>}
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
                                  {getStatusLabel(row.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDate(new Date(row.createdAt))}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end gap-2">
                                  {canMarkPaid(row.status) && (
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
                                    </div>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        Lihat Detail
                                      </DropdownMenuItem>
                                      {isApprover && canApprovalAction(row.status) && (
                                        <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                          {getApproveLabel(row.status)}
                                        </DropdownMenuItem>
                                      )}
                                      {isApprover && canApprovalAction(row.status) && (
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                        >
                                          Reject
                                        </DropdownMenuItem>
                                      )}
                                      {canMarkPaid(row.status) && (
                                        <DropdownMenuItem
                                          onClick={() => setPendingAction({ row, nextStatus: "PAID" })}
                                          disabled={paidProofAttachments.length === 0 && paidProofDraftCount === 0}
                                        >
                                          Mark Paid
                                        </DropdownMenuItem>
                                      )}
                                      {!isAdmin && row.status === "SUBMITTED" && (
                                        <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                          Cancel
                                        </DropdownMenuItem>
                                      )}
                                      {isAdmin && row.status === "CANCELLED" && (
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setDeleteTarget(row)}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                          Delete Permanen
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
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
                              {getStatusLabel(row.status)}
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
                          <div className="mt-3 flex flex-col items-end gap-2">
                            {canMarkPaid(row.status) && (
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
                              </div>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Lihat Detail
                                </DropdownMenuItem>
                                {isApprover && canApprovalAction(row.status) && (
                                  <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                    {getApproveLabel(row.status)}
                                  </DropdownMenuItem>
                                )}
                                {isApprover && canApprovalAction(row.status) && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                  >
                                    Reject
                                  </DropdownMenuItem>
                                )}
                                {canMarkPaid(row.status) && (
                                  <DropdownMenuItem
                                    onClick={() => setPendingAction({ row, nextStatus: "PAID" })}
                                    disabled={paidProofAttachments.length === 0 && paidProofDraftCount === 0}
                                  >
                                    Mark Paid
                                  </DropdownMenuItem>
                                )}
                                {!isAdmin && row.status === "SUBMITTED" && (
                                  <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                    Cancel
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && row.status === "CANCELLED" && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(row)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                    Delete Permanen
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="sm:max-w-[820px] p-6">
          <DialogHeader>
            <DialogTitle>Detail Reimbursement</DialogTitle>
            <DialogDescription>Informasi pengajuan, bukti, dan riwayat aksi workflow.</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Pemohon</p>
                  <p className="font-medium">{detailRow.employee?.fullName ?? detailRow.user?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusClass(detailRow.status)}>
                    {getStatusLabel(detailRow.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Kategori</p>
                  <p className="font-medium">{detailRow.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nominal</p>
                  <p className="font-medium">{formatCurrency(Number(detailRow.amount))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Diajukan</p>
                  <p className="font-medium">{formatDateTime(detailRow.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dibayar</p>
                  <p className="font-medium">{detailRow.paidAt ? formatDateTime(detailRow.paidAt) : "-"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Deskripsi</p>
                  <p className="font-medium">{detailRow.description ?? "-"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Bukti Reimbursement</p>
                  <div className="mt-1">
                    {renderAttachmentLinks(detailRow, getReceiptAttachments(detailRow), "-")}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Bukti Bayar</p>
                  <div className="mt-1">
                    {renderAttachmentLinks(detailRow, getPaidProofAttachments(detailRow), "-")}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-semibold">Tracking Progress Approval</p>
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  {getTrackingMessage(detailRow)}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-semibold">Riwayat Aksi</p>
                {(detailRow.workflowEvents?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada riwayat aksi.</p>
                ) : (
                  <div className="relative pl-6 text-sm">
                    <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                    {[...(detailRow.workflowEvents ?? [])].reverse().map((event) => (
                      <div key={event.id} className="relative pb-4 last:pb-0">
                        <span
                          className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 ${getEventDotClass(event)}`}
                        />
                        <div className="rounded-md border bg-card p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">
                              {getEventActionLabel(event)}
                            </p>
                            <Badge variant="outline" className={statusClass(event.toStatus ?? "SUBMITTED")}>
                              {getWorkflowStatusLabel(event.toStatus)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatActorLabel(event)} - {formatDateTime(event.createdAt)}
                          </p>
                          {event.note ? (
                            <p className="mt-1 text-xs text-muted-foreground">Catatan: {event.note}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      <ActionConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Konfirmasi Delete Permanen"
        description={
          deleteTarget
            ? `Yakin ingin menghapus permanen reimbursement ${deleteTarget.category} (${formatCurrency(Number(deleteTarget.amount))})? Aksi ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="DELETE PERMANEN"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          void handleHardDelete(deleteTarget);
        }}
      />
    </AdminLayout>
  );
}

