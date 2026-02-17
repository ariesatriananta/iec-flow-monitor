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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  editReimbursement,
  deleteReimbursement,
  fetchReimbursements,
  type ReimbursementAttachmentInput,
  type ReimbursementItemInput,
  updateReimbursement,
} from "@/lib/api/reimbursement";
import { fetchApprovalFlowSettings, type ApprovalFlowPayload } from "@/lib/api/settings";
import {
  uploadReimbursementFile,
  type UploadReimbursementResponse,
} from "@/lib/api/uploads";
import { formatCurrency, formatDate } from "@/lib/numbering";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { Reimbursement, ReimbursementAttachment, WorkflowEvent } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import {
  CalendarIcon,
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  XCircle,
  X,
} from "lucide-react";

const categoryOptions = ["TRANSPORT", "MEAL", "OTHER"];
const statusOptions = ["ALL", "SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "REJECTED", "PAID", "CANCELLED"];
const MAX_REIMBURSEMENT_FILES = 5;
const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKeyToDate = (value?: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const formatFileSize = (bytes: number) => {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const hasImageFileExtension = (value?: string | null) => {
  if (!value) return false;
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(value);
};

const isImageAttachmentPayload = (attachment?: ReimbursementAttachmentInput | null) => {
  if (!attachment) return false;
  if (attachment.contentType?.toLowerCase().startsWith("image/")) return true;
  if (hasImageFileExtension(attachment.fileName)) return true;
  return hasImageFileExtension(attachment.url);
};

type ReimbursementDraftItem = {
  id: string;
  expenseDate: string;
  category: string;
  clientName: string;
  description: string;
  amount: string;
  attachmentFile: File;
};

type EditableReimbursementItem = {
  id: string;
  expenseDate: string;
  category: string;
  clientName: string;
  description: string;
  amount: string;
  attachment: ReimbursementAttachmentInput | null;
  attachmentFile: File | null;
};

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

type ApproverProfile = NonNullable<
  ApprovalFlowPayload["reimbursementApproverLevel1Employee"]
>;

const mapUploadToPayload = (item: UploadReimbursementResponse) => ({
  url: item.url,
  key: item.key,
  fileName: item.fileName,
  contentType: item.contentType,
  size: item.size,
});

const appendFiles = (current: File[], incoming: File[], remaining: number) => {
  if (remaining <= 0) return current;
  return [...current, ...incoming.slice(0, remaining)];
};

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
    case "EDITED":
      return "Pengajuan Diedit";
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

const getCategoryLabel = (category: string) => {
  if (category === "TRANSPORT") return "Transport";
  if (category === "MEAL") return "Meal";
  if (category === "OTHER") return "Other";
  return category;
};

const getReimbursementSummaryLabel = (
  category: string,
  itemCount?: number,
  itemsLength?: number
) => {
  const count = itemCount ?? itemsLength ?? 0;
  if (count > 1 || category === "MULTI_ITEM") return `${count} item`;
  return getCategoryLabel(category);
};

export default function ReimbursementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();
  const searchParams = useSearchParams();

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
  const [autoOpenedEntityId, setAutoOpenedEntityId] = useState<string | null>(null);
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [approvalLevels, setApprovalLevels] = useState<1 | 2>(2);
  const [approverLevel1EmployeeId, setApproverLevel1EmployeeId] = useState<string | null>(null);
  const [approverLevel2EmployeeId, setApproverLevel2EmployeeId] = useState<string | null>(null);
  const [approverLevel1Profile, setApproverLevel1Profile] = useState<ApproverProfile | null>(null);
  const [approverLevel2Profile, setApproverLevel2Profile] = useState<ApproverProfile | null>(null);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const [submissionDate, setSubmissionDate] = useState(toDateInputValue());
  const [draftItems, setDraftItems] = useState<ReimbursementDraftItem[]>([]);
  const [description, setDescription] = useState("");
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [itemExpenseDate, setItemExpenseDate] = useState(toDateInputValue());
  const [itemCategory, setItemCategory] = useState("TRANSPORT");
  const [itemClientName, setItemClientName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemAttachmentFile, setItemAttachmentFile] = useState<File | null>(null);
  const [itemAttachmentPreviewUrl, setItemAttachmentPreviewUrl] = useState<string | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const [editSubmissionDate, setEditSubmissionDate] = useState(toDateInputValue());
  const [editDescription, setEditDescription] = useState("");
  const [editItems, setEditItems] = useState<EditableReimbursementItem[]>([]);
  const [isEditItemDialogOpen, setIsEditItemDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemExpenseDate, setEditItemExpenseDate] = useState(toDateInputValue());
  const [editItemCategory, setEditItemCategory] = useState("TRANSPORT");
  const [editItemClientName, setEditItemClientName] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");
  const [editItemAmount, setEditItemAmount] = useState("");
  const [editItemAttachment, setEditItemAttachment] =
    useState<ReimbursementAttachmentInput | null>(null);
  const [editItemAttachmentFile, setEditItemAttachmentFile] = useState<File | null>(null);
  const [editItemAttachmentPreviewUrl, setEditItemAttachmentPreviewUrl] =
    useState<string | null>(null);

  const [paidProofFiles, setPaidProofFiles] = useState<Record<string, File[]>>({});
  const [paidProofDrafts, setPaidProofDrafts] = useState<
    Record<string, UploadReimbursementResponse[]>
  >({});
  const [isPaidProofUploadingById, setIsPaidProofUploadingById] = useState<
    Record<string, boolean>
  >({});

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
        setApproverLevel1Profile(settings.reimbursementApproverLevel1Employee ?? null);
        setApproverLevel2Profile(settings.reimbursementApproverLevel2Employee ?? null);
      } catch {
        setApprovalLevels(2);
        setApproverLevel1EmployeeId(null);
        setApproverLevel2EmployeeId(null);
        setApproverLevel1Profile(null);
        setApproverLevel2Profile(null);
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const notifEntityId = searchParams.get("entityId");
  useEffect(() => {
    if (!notifEntityId) {
      setAutoOpenedEntityId(null);
      setHighlightedEntityId(null);
      return;
    }
    if (isLoading || autoOpenedEntityId === notifEntityId) return;
    const target = rows.find((row) => row.id === notifEntityId);
    if (!target) return;
    setDetailRow(target);
    setAutoOpenedEntityId(notifEntityId);
    setHighlightedEntityId(notifEntityId);
    const timer = window.setTimeout(() => {
      setHighlightedEntityId((prev) => (prev === notifEntityId ? null : prev));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notifEntityId, isLoading, autoOpenedEntityId, rows]);

  useEffect(() => {
    if (!itemAttachmentFile) {
      setItemAttachmentPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(itemAttachmentFile);
    setItemAttachmentPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [itemAttachmentFile]);

  useEffect(() => {
    if (!editItemAttachmentFile) {
      setEditItemAttachmentPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(editItemAttachmentFile);
    setEditItemAttachmentPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [editItemAttachmentFile]);

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
  const canEditReimbursement = (row: Reimbursement) => {
    const editableStatus = row.status === "SUBMITTED" || row.status === "REJECTED";
    if (!editableStatus) return false;
    if (isAdmin) return true;
    return Boolean(user?.employeeId) && row.employeeId === user?.employeeId;
  };

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
    if (!submissionDate) {
      toast({
        title: "Error",
        description: "Tanggal pengajuan wajib diisi",
        variant: "destructive",
      });
      return;
    }
    if (draftItems.length === 0) {
      toast({
        title: "Error",
        description: "Minimal satu item reimbursement wajib ditambahkan",
        variant: "destructive",
      });
      return;
    }
    for (const item of draftItems) {
      const numericAmount = Number(item.amount);
      if (
        !item.expenseDate ||
        !item.category ||
        Number.isNaN(numericAmount) ||
        numericAmount <= 0
      ) {
        toast({
          title: "Error",
          description: "Tanggal, kategori, dan nominal setiap item wajib valid",
          variant: "destructive",
        });
        return;
      }
      if (!(item.attachmentFile instanceof File) || item.attachmentFile.size <= 0) {
        toast({
          title: "Error",
          description: "Setiap item wajib memiliki 1 attachment",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const itemsWithAttachment: ReimbursementItemInput[] = [];
      for (const item of draftItems) {
        const uploaded = await uploadReimbursementFile(item.attachmentFile, "receipt");
        itemsWithAttachment.push({
          expenseDate: item.expenseDate,
          category: item.category,
          clientName: item.clientName || undefined,
          description: item.description || undefined,
          amount: Number(item.amount),
          attachment: mapUploadToPayload(uploaded),
        });
      }

      await createReimbursement({
        submissionDate,
        items: itemsWithAttachment,
        description: description || undefined,
      });

      setIsCreateDialogOpen(false);
      resetCreateForm();
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
    const row = rows.find((item) => item.id === rowId);
    const persistedCount = row ? getPaidProofAttachments(row).length : 0;
    const draftCount = paidProofDrafts[rowId]?.length ?? 0;
    if (persistedCount + draftCount + files.length > MAX_REIMBURSEMENT_FILES) {
      toast({
        title: "Error",
        description: `Maksimal ${MAX_REIMBURSEMENT_FILES} file bukti transfer per pengajuan`,
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

  const renderAttachmentLinks = (
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

  const resetCreateForm = () => {
    setSubmissionDate(toDateInputValue());
    setDraftItems([]);
    setDescription("");
    setItemExpenseDate(toDateInputValue());
    setItemCategory("TRANSPORT");
    setItemClientName("");
    setItemDescription("");
    setItemAmount("");
    setItemAttachmentFile(null);
    setIsItemDialogOpen(false);
  };

  const resetEditForm = () => {
    setEditingRowId(null);
    setEditSubmissionDate(toDateInputValue());
    setEditDescription("");
    setEditItems([]);
    setEditingItemId(null);
    setEditItemExpenseDate(toDateInputValue());
    setEditItemCategory("TRANSPORT");
    setEditItemClientName("");
    setEditItemDescription("");
    setEditItemAmount("");
    setEditItemAttachment(null);
    setEditItemAttachmentFile(null);
    setIsEditItemDialogOpen(false);
    setEditConfirmOpen(false);
    setIsEditDialogOpen(false);
  };

  const resetEditItemForm = () => {
    setEditingItemId(null);
    setEditItemExpenseDate(editSubmissionDate || toDateInputValue());
    setEditItemCategory("TRANSPORT");
    setEditItemClientName("");
    setEditItemDescription("");
    setEditItemAmount("");
    setEditItemAttachment(null);
    setEditItemAttachmentFile(null);
    setIsEditItemDialogOpen(false);
  };

  const openEditDialog = (row: Reimbursement) => {
    const fallbackDate = toDateInputValue(new Date(row.submissionDate));
    const mappedItems = (row.items ?? []).map((item, index) => ({
      id: item.id || `edit-item-${index}`,
      expenseDate: toDateInputValue(new Date(item.expenseDate)),
      category: item.category || "TRANSPORT",
      clientName: item.clientName ?? "",
      description: item.description ?? "",
      amount: String(Number(item.amount ?? 0)),
      attachment: item.attachment
        ? {
            url: item.attachment.fileUrl,
            key: item.attachment.fileKey ?? undefined,
            fileName: item.attachment.fileName ?? undefined,
            contentType: item.attachment.contentType ?? undefined,
            size: item.attachment.fileSize ?? undefined,
          }
        : null,
      attachmentFile: null,
    }));
    const initialItems =
      mappedItems.length > 0
        ? mappedItems
        : [
            {
              id: crypto.randomUUID(),
              expenseDate: fallbackDate,
              category: row.category === "MULTI_ITEM" ? "TRANSPORT" : row.category,
              clientName: "",
              description: row.description ?? "",
              amount: String(Number(row.amount ?? 0)),
              attachment: row.receiptUrl
                ? {
                    url: row.receiptUrl,
                    fileName: "receipt",
                  }
                : null,
              attachmentFile: null,
            },
          ];

    setEditingRowId(row.id);
    setEditSubmissionDate(fallbackDate);
    setEditDescription(row.description ?? "");
    setEditItems(initialItems);
    resetEditItemForm();
    setIsEditDialogOpen(true);
  };

  const openEditItemDialog = (item?: EditableReimbursementItem) => {
    if (!item) {
      setEditingItemId(null);
      setEditItemExpenseDate(editSubmissionDate || toDateInputValue());
      setEditItemCategory("TRANSPORT");
      setEditItemClientName("");
      setEditItemDescription("");
      setEditItemAmount("");
      setEditItemAttachment(null);
      setEditItemAttachmentFile(null);
      setIsEditItemDialogOpen(true);
      return;
    }

    setEditingItemId(item.id);
    setEditItemExpenseDate(item.expenseDate || editSubmissionDate || toDateInputValue());
    setEditItemCategory(item.category || "TRANSPORT");
    setEditItemClientName(item.clientName || "");
    setEditItemDescription(item.description || "");
    setEditItemAmount(item.amount || "");
    setEditItemAttachment(item.attachment ?? null);
    setEditItemAttachmentFile(null);
    setIsEditItemDialogOpen(true);
  };

  const saveEditItem = () => {
    const numericAmount = Number(editItemAmount);
    if (
      !editItemExpenseDate ||
      !editItemCategory ||
      Number.isNaN(numericAmount) ||
      numericAmount <= 0
    ) {
      toast({
        title: "Error",
        description: "Tanggal, kategori, dan nominal item wajib valid",
        variant: "destructive",
      });
      return;
    }
    if (!editItemAttachment && !editItemAttachmentFile) {
      toast({
        title: "Error",
        description: "Attachment item wajib diisi",
        variant: "destructive",
      });
      return;
    }

    if (editingItemId) {
      setEditItems((prev) =>
        prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                expenseDate: editItemExpenseDate,
                category: editItemCategory,
                clientName: editItemClientName,
                description: editItemDescription,
                amount: editItemAmount,
                attachment: editItemAttachment,
                attachmentFile: editItemAttachmentFile,
              }
            : item
        )
      );
    } else {
      setEditItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          expenseDate: editItemExpenseDate,
          category: editItemCategory,
          clientName: editItemClientName,
          description: editItemDescription,
          amount: editItemAmount,
          attachment: editItemAttachment,
          attachmentFile: editItemAttachmentFile,
        },
      ]);
    }

    resetEditItemForm();
  };

  const removeEditItem = (id: string) => {
    setEditItems((prev) => prev.filter((item) => item.id !== id));
  };

  const validateEditForm = () => {
    if (!editingRowId) return "Data reimbursement tidak ditemukan";
    if (!editSubmissionDate) return "Tanggal pengajuan wajib diisi";
    if (editItems.length === 0) return "Minimal satu item reimbursement wajib ditambahkan";
    if (editItems.length > MAX_REIMBURSEMENT_FILES) {
      return `Maksimal ${MAX_REIMBURSEMENT_FILES} item per pengajuan`;
    }
    return null;
  };

  const handleEditSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = validateEditForm();
    if (validationMessage) {
      toast({
        title: "Error",
        description: validationMessage,
        variant: "destructive",
      });
      return;
    }
    setEditConfirmOpen(true);
  };

  const performEditSubmit = async () => {
    if (!editingRowId) return;

    setIsSaving(true);
    try {
      const normalizedItems: ReimbursementItemInput[] = [];
      for (const item of editItems) {
        const numericAmount = Number(item.amount);
        if (
          !item.expenseDate ||
          !item.category ||
          Number.isNaN(numericAmount) ||
          numericAmount <= 0
        ) {
          throw new Error("Tanggal, kategori, dan nominal setiap item wajib valid");
        }

        let attachmentPayload = item.attachment;
        if (item.attachmentFile) {
          const uploaded = await uploadReimbursementFile(item.attachmentFile, "receipt");
          attachmentPayload = mapUploadToPayload(uploaded);
        }
        if (!attachmentPayload) {
          throw new Error("Setiap item wajib memiliki attachment");
        }

        normalizedItems.push({
          expenseDate: item.expenseDate,
          category: item.category,
          clientName: item.clientName || undefined,
          description: item.description || undefined,
          amount: numericAmount,
          attachment: attachmentPayload,
        });
      }

      const updated = await editReimbursement(editingRowId, {
        submissionDate: editSubmissionDate,
        description: editDescription || undefined,
        items: normalizedItems,
      });

      setRows((prev) =>
        prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
      );
      if (detailRow?.id === updated.id) {
        setDetailRow((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      resetEditForm();
      toast({
        title: "Berhasil",
        description: "Pengajuan reimbursement berhasil diperbarui",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal memperbarui reimbursement";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const addDraftItem = () => {
    if (!itemExpenseDate || !itemCategory || !itemAmount) {
      toast({
        title: "Error",
        description: "Tanggal, kategori, dan nominal item wajib diisi",
        variant: "destructive",
      });
      return;
    }
    if (!itemAttachmentFile) {
      toast({
        title: "Error",
        description: "Attachment item wajib diisi",
        variant: "destructive",
      });
      return;
    }

    setDraftItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        expenseDate: itemExpenseDate,
        category: itemCategory,
        clientName: itemClientName,
        description: itemDescription,
        amount: itemAmount,
        attachmentFile: itemAttachmentFile,
      },
    ]);
    setItemExpenseDate(submissionDate || toDateInputValue());
    setItemCategory("TRANSPORT");
    setItemClientName("");
    setItemDescription("");
    setItemAmount("");
    setItemAttachmentFile(null);
    setIsItemDialogOpen(false);
  };

  const removeDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePaidProofFilePick = (row: Reimbursement, files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;
    const persistedCount = getPaidProofAttachments(row).length;
    const draftCount = paidProofDrafts[row.id]?.length ?? 0;
    const pendingCount = paidProofFiles[row.id]?.length ?? 0;
    const remaining =
      MAX_REIMBURSEMENT_FILES - persistedCount - draftCount - pendingCount;
    if (remaining <= 0) {
      toast({
        title: "Info",
        description: `Maksimal ${MAX_REIMBURSEMENT_FILES} file bukti transfer`,
      });
      return;
    }
    if (selected.length > remaining) {
      toast({
        title: "Info",
        description: `Hanya ${remaining} file yang ditambahkan agar tidak melebihi batas`,
      });
    }
    setPaidProofFiles((prev) => ({
      ...prev,
      [row.id]: appendFiles(prev[row.id] ?? [], selected, remaining),
    }));
  };

  const removePaidProofFile = (rowId: string, index: number) => {
    setPaidProofFiles((prev) => ({
      ...prev,
      [rowId]: (prev[rowId] ?? []).filter((_, idx) => idx !== index),
    }));
  };

  const renderLocalFilePreview = (
    rowId: string,
    files: File[]
  ) => {
    if (files.length === 0) return null;

    return (
      <div className="w-full rounded-md border border-border/70 bg-muted/20 p-2">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">
          File siap upload: {files.length}
        </p>
        <div className="grid gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                {file.type.startsWith("image/") ? (
                  <FileImage className="h-4 w-4 text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <p className="truncate text-xs">{file.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removePaidProofFile(rowId, index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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

  const formatApproverTarget = (approver?: ApproverProfile | null) => {
    if (!approver) return "Belum diset";
    const name = approver.fullName?.trim() || "-";
    const title = approver.title?.trim();
    return title ? `${name} (${title})` : name;
  };

  return (
    <AdminLayout title="Reimbursement">
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Reimbursement</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Button
                type="button"
                onClick={() => setIsCreateDialogOpen(true)}
                className="md:order-2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajukan Reimbursement
              </Button>
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
                        <TableHead>Ringkasan</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead>Bukti</TableHead>
                        <TableHead>Bukti Bayar</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tgl Pengajuan</TableHead>
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
                            <TableRow
                              key={row.id}
                              className={cn(
                                highlightedEntityId === row.id &&
                                  "bg-amber-100/70 dark:bg-amber-900/25 transition-colors duration-300"
                              )}
                            >
                              {isAdmin && (
                                <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>
                              )}
                              <TableCell>
                                {getReimbursementSummaryLabel(
                                  row.category,
                                  row.itemCount,
                                  row.items?.length
                                )}
                              </TableCell>
                              <TableCell>{formatCurrency(Number(row.amount))}</TableCell>
                              <TableCell className="max-w-[240px] truncate">{row.description ?? "-"}</TableCell>
                              <TableCell>{renderAttachmentLinks(receiptAttachments, "-")}</TableCell>
                              <TableCell>{renderAttachmentLinks(paidProofAttachments, "-")}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusClass(row.status)}>
                                  {getStatusLabel(row.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDate(new Date(row.submissionDate))}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end gap-2">
                                  {canMarkPaid(row.status) && (
                                    <div className="flex flex-col items-end gap-2">
                                      <div className="flex w-[280px] items-center gap-2">
                                        <input
                                          id={`paid-proof-file-${row.id}`}
                                          type="file"
                                          multiple
                                          className="hidden"
                                          accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                                          onChange={(event) =>
                                            handlePaidProofFilePick(row, event.target.files)
                                          }
                                        />
                                        <input
                                          id={`paid-proof-camera-${row.id}`}
                                          type="file"
                                          className="hidden"
                                          accept="image/*"
                                          capture="environment"
                                          onChange={(event) =>
                                            handlePaidProofFilePick(row, event.target.files)
                                          }
                                        />
                                        <Button variant="outline" size="sm" type="button" asChild>
                                          <label
                                            htmlFor={`paid-proof-file-${row.id}`}
                                            className="cursor-pointer"
                                          >
                                            <Upload className="mr-2 h-4 w-4" />
                                            Pilih
                                          </label>
                                        </Button>
                                        <Button variant="outline" size="sm" type="button" asChild>
                                          <label
                                            htmlFor={`paid-proof-camera-${row.id}`}
                                            className="cursor-pointer"
                                          >
                                            <Camera className="mr-2 h-4 w-4" />
                                            Kamera
                                          </label>
                                        </Button>
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
                                      <div className="flex w-[280px] items-center gap-2">
                                        <p className="text-[11px] text-muted-foreground">
                                          Upload bukti transfer
                                        </p>
                                        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                                      </div>
                                      {renderLocalFilePreview(row.id, paidProofFiles[row.id] ?? [])}
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
                                      {canEditReimbursement(row) && (
                                        <DropdownMenuItem onClick={() => openEditDialog(row)}>
                                          <Pencil className="mr-2 h-4 w-4" />
                                          Edit Pengajuan
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        Lihat Detail
                                      </DropdownMenuItem>
                                      {isApprover && canApprovalAction(row.status) && (
                                        <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                          {getApproveLabel(row.status)}
                                        </DropdownMenuItem>
                                      )}
                                      {isApprover && canApprovalAction(row.status) && (
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                        >
                                          <XCircle className="mr-2 h-4 w-4 text-destructive" />
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
                        <div
                          key={row.id}
                          className={cn(
                            "rounded-md border p-4 transition-colors duration-300",
                            highlightedEntityId === row.id &&
                              "border-amber-300 bg-amber-100/70 dark:border-amber-700 dark:bg-amber-900/25"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">
                                {getReimbursementSummaryLabel(
                                  row.category,
                                  row.itemCount,
                                  row.items?.length
                                )}
                              </p>
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
                              {renderAttachmentLinks(receiptAttachments, "-")}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Bukti Bayar: </span>
                              {renderAttachmentLinks(paidProofAttachments, "-")}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-col items-end gap-2">
                            {canMarkPaid(row.status) && (
                              <div className="flex w-full flex-col items-end gap-2">
                                <div className="flex w-full items-center gap-2">
                                  <input
                                    id={`paid-proof-file-mobile-${row.id}`}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                                    onChange={(event) =>
                                      handlePaidProofFilePick(row, event.target.files)
                                    }
                                  />
                                  <input
                                    id={`paid-proof-camera-mobile-${row.id}`}
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(event) =>
                                      handlePaidProofFilePick(row, event.target.files)
                                    }
                                  />
                                  <Button variant="outline" size="sm" type="button" asChild>
                                    <label
                                      htmlFor={`paid-proof-file-mobile-${row.id}`}
                                      className="cursor-pointer"
                                    >
                                      <Upload className="mr-2 h-4 w-4" />
                                      Pilih
                                    </label>
                                  </Button>
                                  <Button variant="outline" size="sm" type="button" asChild>
                                    <label
                                      htmlFor={`paid-proof-camera-mobile-${row.id}`}
                                      className="cursor-pointer"
                                    >
                                      <Camera className="mr-2 h-4 w-4" />
                                      Kamera
                                    </label>
                                  </Button>
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
                                <div className="flex w-full items-center gap-2">
                                  <p className="text-[11px] text-muted-foreground">
                                    Upload bukti transfer
                                  </p>
                                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                {renderLocalFilePreview(row.id, paidProofFiles[row.id] ?? [])}
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
                                {canEditReimbursement(row) && (
                                  <DropdownMenuItem onClick={() => openEditDialog(row)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Pengajuan
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setDetailRow(row)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Lihat Detail
                                </DropdownMenuItem>
                                {isApprover && canApprovalAction(row.status) && (
                                  <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                    {getApproveLabel(row.status)}
                                  </DropdownMenuItem>
                                )}
                                {isApprover && canApprovalAction(row.status) && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                  >
                                    <XCircle className="mr-2 h-4 w-4 text-destructive" />
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

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] p-0 flex flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle>Pengajuan Reimbursement</DialogTitle>
            <DialogDescription>
              Isi data reimbursement lalu upload bukti sebelum submit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tanggal Pengajuan</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !submissionDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {submissionDate
                        ? format(parseDateKeyToDate(submissionDate) ?? new Date(), "dd MMM yyyy")
                        : "Pilih tanggal pengajuan"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(submissionDate)}
                      onSelect={(date) => {
                        if (!date) return;
                        setSubmissionDate(format(date, "yyyy-MM-dd"));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Catatan Pengajuan</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Opsional"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Item Reimbursement</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsItemDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Item
                  </Button>
                </div>
                <div className="hidden rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Tanggal</TableHead>
                        <TableHead className="w-[160px]">Kategori</TableHead>
                        <TableHead className="w-[180px]">Client</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="w-[160px]">Nominal</TableHead>
                        <TableHead>Attachment</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                            Belum ada item. Klik &quot;Tambah Item&quot;.
                          </TableCell>
                        </TableRow>
                      ) : (
                        draftItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{format(parseDateKeyToDate(item.expenseDate) ?? new Date(), "dd MMM yyyy")}</TableCell>
                            <TableCell>{getCategoryLabel(item.category)}</TableCell>
                            <TableCell>{item.clientName || "-"}</TableCell>
                            <TableCell>{item.description || "-"}</TableCell>
                            <TableCell>{formatCurrency(Number(item.amount || 0))}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs">
                              {item.attachmentFile?.name ?? "-"}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDraftItem(item.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {draftItems.length === 0 ? (
                    <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                      Belum ada item. Klik &quot;Tambah Item&quot;.
                    </div>
                  ) : (
                    draftItems.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{getCategoryLabel(item.category)}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseDateKeyToDate(item.expenseDate) ?? new Date(), "dd MMM yyyy")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDraftItem(item.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="text-muted-foreground">Client: </span>
                            {item.clientName || "-"}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Deskripsi: </span>
                            {item.description || "-"}
                          </p>
                          <p className="font-medium">{formatCurrency(Number(item.amount || 0))}</p>
                          <p className="text-xs text-muted-foreground">
                            Attachment: {item.attachmentFile?.name ?? "-"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Total item: {draftItems.length} | Total nominal:{" "}
                  {formatCurrency(
                    draftItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
                  )}
                </p>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    resetCreateForm();
                  }}
                  disabled={isSaving}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Ajukan Reimbursement"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) resetEditForm();
        }}
      >
        <DialogContent className="sm:max-w-[900px] max-h-[85vh] p-0 flex flex-col">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <DialogTitle>Edit Pengajuan Reimbursement</DialogTitle>
            <DialogDescription>
              Ubah data pengajuan, item, dan attachment per item.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form onSubmit={handleEditSubmit} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Tanggal Pengajuan</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editSubmissionDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editSubmissionDate
                        ? format(
                            parseDateKeyToDate(editSubmissionDate) ?? new Date(),
                            "dd MMM yyyy"
                          )
                        : "Pilih tanggal pengajuan"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parseDateKeyToDate(editSubmissionDate)}
                      onSelect={(date) => {
                        if (!date) return;
                        setEditSubmissionDate(format(date, "yyyy-MM-dd"));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Catatan Pengajuan</Label>
                <Input
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Opsional"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Item Reimbursement</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditItemDialog()}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Item
                  </Button>
                </div>
                <div className="hidden rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Tanggal</TableHead>
                        <TableHead className="w-[150px]">Kategori</TableHead>
                        <TableHead className="w-[180px]">Client</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="w-[140px]">Nominal</TableHead>
                        <TableHead className="w-[220px]">Attachment</TableHead>
                        <TableHead className="w-[120px] text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                            Belum ada item.
                          </TableCell>
                        </TableRow>
                      ) : (
                        editItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {format(
                                parseDateKeyToDate(item.expenseDate) ?? new Date(),
                                "dd MMM yyyy"
                              )}
                            </TableCell>
                            <TableCell>{getCategoryLabel(item.category)}</TableCell>
                            <TableCell>{item.clientName || "-"}</TableCell>
                            <TableCell className="max-w-[240px] truncate">
                              {item.description || "-"}
                            </TableCell>
                            <TableCell>{formatCurrency(Number(item.amount || 0))}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.attachmentFile?.name ??
                                item.attachment?.fileName ??
                                "Belum ada attachment"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditItemDialog(item)}
                                >
                                  <Pencil className="mr-1 h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeEditItem(item.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {editItems.length === 0 ? (
                    <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                      Belum ada item.
                    </div>
                  ) : (
                    editItems.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{getCategoryLabel(item.category)}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(
                                parseDateKeyToDate(item.expenseDate) ?? new Date(),
                                "dd MMM yyyy"
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditItemDialog(item)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeEditItem(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="text-muted-foreground">Client: </span>
                            {item.clientName || "-"}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Deskripsi: </span>
                            {item.description || "-"}
                          </p>
                          <p className="font-medium">{formatCurrency(Number(item.amount || 0))}</p>
                          <p className="text-xs text-muted-foreground">
                            Attachment:{" "}
                            {item.attachmentFile?.name ??
                              item.attachment?.fileName ??
                              "Belum ada attachment"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Total item: {editItems.length} | Total nominal:{" "}
                  {formatCurrency(
                    editItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
                  )}
                </p>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetEditForm}
                  disabled={isSaving}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditItemDialogOpen}
        onOpenChange={(open) => {
          setIsEditItemDialogOpen(open);
          if (!open) resetEditItemForm();
        }}
      >
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItemId ? "Edit Item Reimbursement" : "Tambah Item Reimbursement"}
            </DialogTitle>
            <DialogDescription>
              Lengkapi detail item dan attachment agar pengajuan rapi dan valid.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tanggal Item</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editItemExpenseDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editItemExpenseDate
                      ? format(
                          parseDateKeyToDate(editItemExpenseDate) ?? new Date(),
                          "dd MMM yyyy"
                        )
                      : "Pilih tanggal item"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDateKeyToDate(editItemExpenseDate)}
                    onSelect={(date) => {
                      if (!date) return;
                      setEditItemExpenseDate(format(date, "yyyy-MM-dd"));
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={editItemCategory} onValueChange={setEditItemCategory}>
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
              <Label>Client (Opsional)</Label>
              <Input
                value={editItemClientName}
                onChange={(event) => setEditItemClientName(event.target.value)}
                placeholder="Nama client"
              />
            </div>
            <div className="space-y-2">
              <Label>Nominal</Label>
              <Input
                value={editItemAmount}
                onChange={(event) =>
                  setEditItemAmount(event.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="100000"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Deskripsi</Label>
              <Textarea
                rows={3}
                value={editItemDescription}
                onChange={(event) => setEditItemDescription(event.target.value)}
                placeholder="Keterangan item"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Attachment</Label>
              <input
                id="edit-reimbursement-item-file-input"
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setEditItemAttachmentFile(file);
                }}
              />
              <input
                id="edit-reimbursement-item-camera-input"
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setEditItemAttachmentFile(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" type="button" asChild>
                  <label
                    htmlFor="edit-reimbursement-item-file-input"
                    className="cursor-pointer"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Pilih File
                  </label>
                </Button>
                <Button variant="outline" size="sm" type="button" asChild>
                  <label
                    htmlFor="edit-reimbursement-item-camera-input"
                    className="cursor-pointer"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Buka Kamera
                  </label>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {editItemAttachmentFile?.name ??
                  editItemAttachment?.fileName ??
                  "Belum ada attachment dipilih"}
              </p>
              {editItemAttachment && !editItemAttachmentFile ? (
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {isImageAttachmentPayload(editItemAttachment) ? (
                        <FileImage className="h-4 w-4 text-primary" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                      <p className="truncate text-xs font-medium">
                        {editItemAttachment.fileName ?? "attachment-saat-ini"}
                      </p>
                    </div>
                  </div>
                  {isImageAttachmentPayload(editItemAttachment) ? (
                    <a
                      href={editItemAttachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border"
                    >
                      <div
                        className="h-36 w-full bg-cover bg-center"
                        style={{ backgroundImage: `url("${editItemAttachment.url}")` }}
                      />
                    </a>
                  ) : (
                    <a
                      href={editItemAttachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Lihat attachment saat ini
                    </a>
                  )}
                </div>
              ) : null}
              {editItemAttachmentPreviewUrl && editItemAttachmentFile ? (
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {editItemAttachmentFile.type.startsWith("image/") ? (
                        <FileImage className="h-4 w-4 text-primary" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                      <p className="truncate text-xs font-medium">{editItemAttachmentFile.name}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatFileSize(editItemAttachmentFile.size)}
                    </span>
                  </div>
                  {editItemAttachmentFile.type.startsWith("image/") ? (
                    <div className="overflow-hidden rounded-md border">
                      <div
                        className="h-36 w-full bg-cover bg-center"
                        style={{ backgroundImage: `url("${editItemAttachmentPreviewUrl}")` }}
                      />
                    </div>
                  ) : (
                    <a
                      href={editItemAttachmentPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka Preview File
                    </a>
                  )}
                </div>
              ) : null}
              {(editItemAttachment || editItemAttachmentFile) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    setEditItemAttachment(null);
                    setEditItemAttachmentFile(null);
                  }}
                >
                  Hapus Attachment
                </Button>
              ) : null}
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetEditItemForm}>
                Batal
              </Button>
              <Button type="button" onClick={saveEditItem}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Simpan Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Tambah Item Reimbursement</DialogTitle>
            <DialogDescription>
              Isi data item dan lampiran (1 attachment per item).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tanggal Item</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !itemExpenseDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {itemExpenseDate
                      ? format(parseDateKeyToDate(itemExpenseDate) ?? new Date(), "dd MMM yyyy")
                      : "Pilih tanggal item"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDateKeyToDate(itemExpenseDate)}
                    onSelect={(date) => {
                      if (!date) return;
                      setItemExpenseDate(format(date, "yyyy-MM-dd"));
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={itemCategory} onValueChange={setItemCategory}>
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
              <Label>Client (Opsional)</Label>
              <Input
                value={itemClientName}
                onChange={(event) => setItemClientName(event.target.value)}
                placeholder="Nama client"
              />
            </div>
            <div className="space-y-2">
              <Label>Nominal</Label>
              <Input
                value={itemAmount}
                onChange={(event) => setItemAmount(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="100000"
              />
            </div>
            <div className="space-y-2">
              <Label>Attachment</Label>
              <input
                id="item-attachment-file-input"
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setItemAttachmentFile(file);
                }}
              />
              <input
                id="item-attachment-camera-input"
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setItemAttachmentFile(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" type="button" asChild>
                  <label htmlFor="item-attachment-file-input" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Pilih File
                  </label>
                </Button>
                <Button variant="outline" size="sm" type="button" asChild>
                  <label htmlFor="item-attachment-camera-input" className="cursor-pointer">
                    <Camera className="mr-2 h-4 w-4" />
                    Buka Kamera
                  </label>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {itemAttachmentFile?.name ?? "Belum ada attachment dipilih"}
              </p>
              {itemAttachmentPreviewUrl && itemAttachmentFile ? (
                <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {itemAttachmentFile.type.startsWith("image/") ? (
                        <FileImage className="h-4 w-4 text-primary" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                      <p className="truncate text-xs font-medium">{itemAttachmentFile.name}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatFileSize(itemAttachmentFile.size)}
                    </span>
                  </div>
                  {itemAttachmentFile.type.startsWith("image/") ? (
                    <div className="overflow-hidden rounded-md border">
                      <div
                        className="h-36 w-full bg-cover bg-center"
                        style={{ backgroundImage: `url("${itemAttachmentPreviewUrl}")` }}
                      />
                    </div>
                  ) : (
                    <a
                      href={itemAttachmentPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka Preview File
                    </a>
                  )}
                </div>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Deskripsi</Label>
              <Textarea
                rows={3}
                value={itemDescription}
                onChange={(event) => setItemDescription(event.target.value)}
                placeholder="Keterangan item"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)}>
                Batal
              </Button>
              <Button type="button" onClick={addDraftItem}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Tambah ke List
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  <p className="text-muted-foreground">Ringkasan</p>
                  <p className="font-medium">
                    {detailRow.itemCount ?? detailRow.items?.length ?? 0} item
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nominal</p>
                  <p className="font-medium">{formatCurrency(Number(detailRow.amount))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tanggal Pengajuan</p>
                  <p className="font-medium">{formatDate(new Date(detailRow.submissionDate))}</p>
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
                  <p className="mb-2 text-muted-foreground">Daftar Item</p>
                  {(detailRow.items?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">Tidak ada item.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Deskripsi</TableHead>
                            <TableHead className="text-right">Nominal</TableHead>
                            <TableHead>Attachment</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detailRow.items ?? []).map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{formatDate(new Date(item.expenseDate))}</TableCell>
                              <TableCell>{item.category}</TableCell>
                              <TableCell>{item.clientName ?? "-"}</TableCell>
                              <TableCell>{item.description ?? "-"}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(Number(item.amount))}
                              </TableCell>
                              <TableCell>
                                {item.attachment?.fileUrl ? (
                                  <a
                                    href={item.attachment.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary underline-offset-2 hover:underline"
                                  >
                                    {item.attachment.fileName || "Attachment"}
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Bukti Reimbursement</p>
                  <div className="mt-1">
                    {renderAttachmentLinks(getReceiptAttachments(detailRow), "-")}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Bukti Bayar</p>
                  <div className="mt-1">
                    {renderAttachmentLinks(getPaidProofAttachments(detailRow), "-")}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-semibold">Tracking Progress Approval</p>
                <div className="mb-3 grid gap-2 rounded-md border border-border/60 bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Approval Level 1</span>
                    <span className="text-right font-medium">
                      {formatApproverTarget(approverLevel1Profile)}
                    </span>
                  </div>
                  {approvalLevels === 2 ? (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">Approval Level 2</span>
                      <span className="text-right font-medium">
                        {formatApproverTarget(approverLevel2Profile)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Flow reimbursement diset 1 level approval.
                    </div>
                  )}
                </div>
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
        open={editConfirmOpen}
        onOpenChange={setEditConfirmOpen}
        title="Konfirmasi Simpan Edit"
        description="Yakin ingin menyimpan perubahan pengajuan reimbursement ini?"
        confirmLabel="SIMPAN PERUBAHAN"
        onConfirm={() => {
          setEditConfirmOpen(false);
          void performEditSubmit();
        }}
      />

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
            ? `Yakin ingin menghapus permanen reimbursement ${getReimbursementSummaryLabel(deleteTarget.category, deleteTarget.itemCount, deleteTarget.items?.length)} (${formatCurrency(Number(deleteTarget.amount))})? Aksi ini tidak bisa dibatalkan.`
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

