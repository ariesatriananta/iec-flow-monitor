"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  createBusinessTrip,
  deleteBusinessTrip,
  fetchBusinessTrips,
  updateBusinessTrip,
} from "@/lib/api/businessTrip";
import {
  fetchApprovalFlowSettings,
  fetchBusinessTripAllowanceSettings,
  type ApprovalFlowPayload,
  type BusinessTripAllowancePayload,
} from "@/lib/api/settings";
import { formatCurrency, formatDate } from "@/lib/numbering";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { BusinessTrip, WorkflowEvent } from "@/types";
import { ActionConfirmDialog } from "@/components/shared/ActionConfirmDialog";
import {
  calculateBusinessTripCompensation,
  DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
} from "@/lib/business-trip-allowance";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import {
  CalendarIcon,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  PlaneTakeoff,
  Plus,
  Printer,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";

const statusOptions = ["ALL", "SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "PAID", "REJECTED", "CANCELLED"];

const statusClass = (status: string) => {
  if (status === "APPROVED") return "bg-success text-success-foreground";
  if (status === "PAID") return "bg-chart-1 text-white";
  if (status === "REJECTED") return "bg-destructive text-destructive-foreground";
  if (status === "CANCELLED") return "bg-muted text-muted-foreground";
  return "bg-warning text-warning-foreground";
};

type PendingAction = {
  row: BusinessTrip;
  nextStatus: string;
};

type ApproverProfile = NonNullable<
  ApprovalFlowPayload["businessTripApproverLevel1Employee"]
>;

const parseDateKeyToDate = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatActorLabel = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  const name = event.actorEmployee?.fullName ?? event.actorUser?.name ?? "-";
  const title = event.actorEmployee?.title ?? null;
  return [name, title].filter(Boolean).join(" - ");
};

const formatActorNameOnly = (event?: WorkflowEvent | null) => {
  if (!event) return "-";
  return event.actorEmployee?.fullName ?? event.actorUser?.name ?? "-";
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

export default function BusinessTripPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<BusinessTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessTrip | null>(null);
  const [detailRow, setDetailRow] = useState<BusinessTrip | null>(null);
  const [autoOpenedEntityId, setAutoOpenedEntityId] = useState<string | null>(null);
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [printRow, setPrintRow] = useState<BusinessTrip | null>(null);
  const [approvalLevels, setApprovalLevels] = useState<1 | 2>(2);
  const [approverLevel1EmployeeId, setApproverLevel1EmployeeId] = useState<string | null>(null);
  const [approverLevel2EmployeeId, setApproverLevel2EmployeeId] = useState<string | null>(null);
  const [approverLevel1Profile, setApproverLevel1Profile] = useState<ApproverProfile | null>(null);
  const [approverLevel2Profile, setApproverLevel2Profile] = useState<ApproverProfile | null>(null);
  const [onlyMyQueue, setOnlyMyQueue] = useState(false);
  const PAGE_SIZE = 20;
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  const [destinationCity, setDestinationCity] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isOutOfTownOvernight, setIsOutOfTownOvernight] = useState<"YES" | "NO">("YES");
  const [transportOptionId, setTransportOptionId] = useState("");
  const [compensationSetting, setCompensationSetting] = useState<BusinessTripAllowancePayload>(
    DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS
  );
  const [headerDataUrl, setHeaderDataUrl] = useState<string>("");
  const isQueueFilterActive =
    onlyMyQueue &&
    Boolean(user?.employeeId) &&
    (user?.employeeId === approverLevel1EmployeeId ||
      (approvalLevels === 2 && user?.employeeId === approverLevel2EmployeeId));

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchBusinessTrips({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        q: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
        queue: isQueueFilterActive ? "mine" : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Gagal memuat data perjalanan dinas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, debouncedSearch, isQueueFilterActive, page, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await fetchApprovalFlowSettings();
        setApprovalLevels(settings.businessTripApprovalLevels);
        setApproverLevel1EmployeeId(settings.businessTripApproverLevel1EmployeeId);
        setApproverLevel2EmployeeId(settings.businessTripApproverLevel2EmployeeId);
        setApproverLevel1Profile(settings.businessTripApproverLevel1Employee ?? null);
        setApproverLevel2Profile(settings.businessTripApproverLevel2Employee ?? null);
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
    void (async () => {
      try {
        const settings = await fetchBusinessTripAllowanceSettings();
        setCompensationSetting(settings);
      } catch {
        setCompensationSetting(DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    const loadHeader = async () => {
      try {
        const response = await fetch("/invoice-header.png");
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!active) return;
          setHeaderDataUrl(typeof reader.result === "string" ? reader.result : "");
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error(error);
      }
    };
    void loadHeader();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, isQueueFilterActive]);

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

  const isApproverLevel1 = Boolean(user?.employeeId) && user?.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    approvalLevels === 2 &&
    Boolean(user?.employeeId) &&
    user?.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;
  const showRequesterColumn = isAdmin || isApprover;
  const canAdminProcess = (status: string) => status === "SUBMITTED" || status === "WAITING_LEVEL_2";
  const canMarkPaid = (status: string) =>
    status === "APPROVED" &&
    (isAdmin || (approvalLevels === 2 ? isApproverLevel2 : isApproverLevel1));
  const getApproveButtonLabel = (status: string) => {
    if (status === "SUBMITTED" && approvalLevels === 2) return "Setujui L1";
    if (status === "WAITING_LEVEL_2") return "Setujui L2";
    return "Setujui";
  };
  const getStatusLabel = (status: string) => {
    if (status === "SUBMITTED") return "Diajukan";
    if (status === "WAITING_LEVEL_2") return "Menunggu Level 2";
    if (status === "APPROVED") return "Disetujui";
    if (status === "PAID") return "Dibayar";
    if (status === "REJECTED") return "Ditolak";
    if (status === "CANCELLED") return "Dibatalkan";
    return status;
  };
  const hasActiveFilter = statusFilter !== "ALL" || debouncedSearch.length >= 2 || (isApprover && onlyMyQueue);
  const emptyStateMessage = hasActiveFilter
    ? "Data tidak ditemukan untuk filter saat ini"
    : "Belum ada pengajuan perjalanan dinas";

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!destinationCity.trim() || !companyName.trim() || !startDate || !endDate) {
      toast({
        title: "Error",
        description: "Lengkapi data perjalanan dinas",
        variant: "destructive",
      });
      return;
    }
    if (!transportOptionId) {
      toast({
        title: "Error",
        description: "Pilih transport PP untuk pengajuan ini",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await createBusinessTrip({
        destinationCity,
        companyName,
        purpose: purpose || undefined,
        startDate,
        endDate,
        isOutOfTownOvernight: isOutOfTownOvernight === "YES",
        transportOptionId,
      });
      setIsCreateDialogOpen(false);
      setDestinationCity("");
      setCompanyName("");
      setPurpose("");
      setStartDate("");
      setEndDate("");
      setIsOutOfTownOvernight("YES");
      setTransportOptionId("");
      if (page === 1) {
        await loadData();
      } else {
        setPage(1);
      }
      toast({ title: "Berhasil", description: "Pengajuan perjalanan dinas berhasil dibuat" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat pengajuan";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (row: BusinessTrip, status: string) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (isApprover && status === "REJECTED") {
        payload.adminNote = "Perlu revisi data perjalanan";
      }

      const updated = await updateBusinessTrip(row.id, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      toast({ title: "Berhasil", description: `Status diubah ke ${updated.status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memperbarui status";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleHardDelete = async (row: BusinessTrip) => {
    try {
      await deleteBusinessTrip(row.id);
      if (rows.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadData();
      }
      setTotal((prev) => Math.max(0, prev - 1));
      toast({ title: "Berhasil", description: "Pengajuan perjalanan dinas dihapus permanen" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menghapus pengajuan";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const openPrintForm = (row: BusinessTrip) => {
    setPrintRow(row);
    setIsPrintPreviewOpen(true);
    if (row.status !== "APPROVED" && row.status !== "PAID") {
      toast({
        title: "Belum Approved",
        description:
          "Form tetap bisa dicetak untuk arsip draft, namun status pengajuan belum APPROVED.",
        variant: "destructive",
      });
    }
  };

  const handlePrintBusinessTrip = () => {
    if (!printRow) return;
    const printWindow = window.open("", "_blank", "width=1000,height=850");
    if (!printWindow) return;
    const headerUrl = headerDataUrl || `${window.location.origin}/invoice-header.png`;

    const approvedEvent = findLatestEvent(
      printRow.workflowEvents ?? [],
      (event) => event.toStatus === "APPROVED"
    );
    const approvedByLabel = formatActorNameOnly(approvedEvent);
    const approvedAtLabel = approvedEvent
      ? formatDateTime(approvedEvent.createdAt)
      : printRow.approvedAt
      ? formatDateTime(printRow.approvedAt)
      : "-";
    const totalDays =
      printRow.allowanceDays ??
      Math.max(
        1,
        Math.floor(
          (new Date(printRow.endDate).getTime() - new Date(printRow.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1
      );

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>FORM BUSINESS TRIP</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
            .sheet { max-width: 860px; margin: 0 auto; border: 1px solid #111; padding: 20px; }
            .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: .03em; }
            .header { position: relative; height: 170px; margin-bottom: 10px; }
            .header-bg { position: absolute; inset: 0; background-image: url('${headerUrl}'); background-size: cover; background-position: top center; }
            .grid { display: grid; grid-template-columns: 220px 20px 1fr; gap: 6px 0; font-size: 13px; margin-top: 18px; }
            .box { margin-top: 14px; border: 1px solid #111; padding: 10px; font-size: 13px; }
            .box-title { font-weight: 700; margin: 0 0 8px; }
            .comp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .comp-table th, .comp-table td { border: 1px solid #111; padding: 6px 8px; }
            .comp-table th { text-align: left; background: #f3f4f6; }
            .sig { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; text-align: center; font-size: 13px; }
            .sig-space { height: 86px; }
            @media print {
              @page { size: A4; margin: 14mm; }
              body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <section class="sheet">
            <div class="header"><div class="header-bg"></div></div>
            <div class="title">FORM BUSINESS TRIP</div>

            <div class="grid">
              <div>Client</div><div>:</div><div>${escapeHtml(printRow.companyName)}</div>
              <div>Period</div><div>:</div><div>${escapeHtml(formatDate(new Date(printRow.startDate)))} - ${escapeHtml(
      formatDate(new Date(printRow.endDate))
    )}</div>
              <div>Location</div><div>:</div><div>${escapeHtml(printRow.destinationCity)}</div>
              <div>Date of Assignment</div><div>:</div><div>${escapeHtml(
                formatDate(new Date(printRow.createdAt))
              )} (Approved: ${escapeHtml(approvedAtLabel)})</div>
            </div>

            <hr style="margin:14px 0;border:none;border-top:1px solid #111" />

            <div class="grid">
              <div>Name</div><div>:</div><div>${escapeHtml(
                printRow.employee?.fullName ?? printRow.user?.name ?? "-"
              )}</div>
              <div>Title - Department</div><div>:</div><div>${escapeHtml(
                printRow.employee?.title ?? "-"
              )} - ${escapeHtml(printRow.employee?.department ?? "-")}</div>
              <div>Number of Days</div><div>:</div><div>${totalDays} days</div>
              <div>Purpose</div><div>:</div><div>${escapeHtml(printRow.purpose ?? "-")}</div>
            </div>

            <div class="box">
              <p class="box-title">Compensation</p>
              <table class="comp-table">
                <thead>
                  <tr>
                    <th>Komponen</th>
                    <th>Keterangan</th>
                    <th>Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>OPE</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.ope.daily ?? 0))} x ${
      printRow.compensationBreakdown?.ope.days ?? 0
    } hari</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.ope.total ?? 0))}</td>
                  </tr>
                  <tr>
                    <td>Makan</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.meal.daily ?? 0))} x ${
      printRow.compensationBreakdown?.meal.days ?? 0
    } hari</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.meal.total ?? 0))}</td>
                  </tr>
                  <tr>
                    <td>Laundry</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.laundry.amount ?? 0))} X ${Number(
      printRow.compensationBreakdown?.laundry.weeks ?? 0
    )}</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.laundry.total ?? 0))}</td>
                  </tr>
                  <tr>
                    <td>Transport PP</td>
                    <td>${escapeHtml(printRow.compensationBreakdown?.transport.label ?? "-")}</td>
                    <td>${formatCurrency(Number(printRow.compensationBreakdown?.transport.amount ?? 0))}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="text-align:right;font-weight:700">Total</td>
                    <td style="font-weight:700">${formatCurrency(
                      Number(printRow.compensationBreakdown?.total ?? printRow.compensationTotal ?? 0)
                    )}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="box">
              <p class="box-title">Please transfer your payment to account:</p>
              <div class="grid" style="margin-top:0">
                <div>Name</div><div>:</div><div>${escapeHtml(printRow.employee?.fullName ?? "-")}</div>
                <div>Bank</div><div>:</div><div>${escapeHtml(printRow.employee?.bankAccountName ?? "-")}</div>
                <div>A/C</div><div>:</div><div>${escapeHtml(printRow.employee?.bankAccountNumber ?? "-")}</div>
              </div>
            </div>

            <div class="sig">
              <div>
                <p><strong>Submitted by,</strong></p>
                <div class="sig-space"></div>
                <p>(${escapeHtml(printRow.employee?.fullName ?? printRow.user?.name ?? "-")})</p>
              </div>
              <div>
                <p><strong>Approved by,</strong></p>
                <div class="sig-space"></div>
                <p>(${escapeHtml(approvedByLabel)})</p>
              </div>
            </div>
          </section>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const actionText = (status: string) => {
    if (status === "APPROVED") return "menyetujui";
    if (status === "PAID") return "menandai sudah dibayar";
    if (status === "REJECTED") return "menolak";
    if (status === "CANCELLED") return "membatalkan";
    return "memperbarui";
  };

  const getTrackingMessage = (row: BusinessTrip) => {
    const events = row.workflowEvents ?? [];
    const cancelEvent = findLatestEvent(events, (event) => event.action === "CANCELLED");
    const rejectEvent = findLatestEvent(events, (event) => event.toStatus === "REJECTED");

    if (cancelEvent) {
      return `Pengajuan dibatalkan oleh ${formatActorLabel(cancelEvent)} pada ${formatDateTime(cancelEvent.createdAt)}`;
    }
    if (rejectEvent) {
      return `Pengajuan ditolak oleh ${formatActorLabel(rejectEvent)} pada ${formatDateTime(rejectEvent.createdAt)}`;
    }
    if (row.status === "WAITING_LEVEL_2") return "Approval level 1 selesai, menunggu level 2";
    if (row.status === "APPROVED") return "Pengajuan sudah disetujui final";
    if (row.status === "PAID") return "Pengajuan sudah dibayarkan";
    if (row.status === "SUBMITTED") return "Menunggu approval level 1";
    return "Status pengajuan sedang diproses";
  };

  const formatApproverTarget = (approver?: ApproverProfile | null) => {
    if (!approver) return "Belum diset";
    const name = approver.fullName?.trim() || "-";
    const title = approver.title?.trim();
    return title ? `${name} (${title})` : name;
  };

  const compensationPreview =
    startDate && endDate
      ? calculateBusinessTripCompensation({
          employeeTitle: user?.employee?.title ?? null,
          startDate: parseDateKeyToDate(startDate) ?? new Date(startDate),
          endDate: parseDateKeyToDate(endDate) ?? new Date(endDate),
          isOutOfTownOvernight: isOutOfTownOvernight === "YES",
          transportOptionId: transportOptionId || null,
          settings: compensationSetting,
        })
      : null;
  const hasMissingOpeRule =
    isOutOfTownOvernight === "YES" &&
    Boolean(compensationPreview && !compensationPreview.ope.ruleId);
  const canSubmitCreate =
    destinationCity.trim().length > 0 &&
    companyName.trim().length > 0 &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    Boolean(transportOptionId) &&
    !hasMissingOpeRule;

  return (
    <AdminLayout title="Business Trip">
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Pengajuan</CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Button
                type="button"
                onClick={() => setIsCreateDialogOpen(true)}
                className="md:order-2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajukan Perjalanan
              </Button>
              <div className="relative md:w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari pengajuan..."
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
                      {option === "ALL" ? "Semua Status" : getStatusLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isApprover && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox
                    id="trip-only-my-queue"
                    checked={onlyMyQueue}
                    onCheckedChange={(checked) => {
                      setOnlyMyQueue(Boolean(checked));
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="trip-only-my-queue" className="cursor-pointer text-sm">
                    Assigned to me
                  </Label>
                </div>
              )}
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
                        {showRequesterColumn && <TableHead>Pemohon</TableHead>}
                        <TableHead>Tujuan</TableHead>
                        <TableHead>Perusahaan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Uang Saku</TableHead>
                        <TableHead>Rincian</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={showRequesterColumn ? 8 : 7} className="py-8 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <PlaneTakeoff className="h-8 w-8" />
                              <p>{emptyStateMessage}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              highlightedEntityId === row.id &&
                                "bg-amber-100/70 dark:bg-amber-900/25 transition-colors duration-300"
                            )}
                          >
                            {showRequesterColumn && <TableCell>{row.employee?.fullName ?? row.user?.name ?? "-"}</TableCell>}
                            <TableCell>{row.destinationCity}</TableCell>
                            <TableCell>{row.companyName}</TableCell>
                            <TableCell>
                              {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                            </TableCell>
                            <TableCell>
                              {row.compensationTotal !== null && row.compensationTotal !== undefined ? (
                                <div>
                                  <p className="font-medium">{formatCurrency(Number(row.compensationTotal))}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {row.compensationBreakdown
                                      ? `${formatCurrency(row.compensationBreakdown.ope.total)} OPE + ${formatCurrency(
                                          row.compensationBreakdown.meal.total
                                        )} Makan + ${formatCurrency(
                                          row.compensationBreakdown.laundry.total
                                        )} Laundry + ${formatCurrency(
                                          row.compensationBreakdown.transport.amount
                                        )} Transport`
                                      : "-"}
                                  </p>
                                </div>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate">{row.purpose ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass(row.status)}>
                                {getStatusLabel(row.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
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
                                  <DropdownMenuItem onClick={() => openPrintForm(row)}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Cetak Form
                                  </DropdownMenuItem>
                                  {isApprover && canAdminProcess(row.status) && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                      {getApproveButtonLabel(row.status)}
                                    </DropdownMenuItem>
                                  )}
                                  {isApprover && canAdminProcess(row.status) && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                    >
                                      <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                      Tolak
                                    </DropdownMenuItem>
                                  )}
                                  {canMarkPaid(row.status) && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "PAID" })}>
                                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                      Tandai Sudah Dibayar
                                    </DropdownMenuItem>
                                  )}
                                  {!isAdmin && row.status === "SUBMITTED" && (
                                    <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                      Batalkan
                                    </DropdownMenuItem>
                                  )}
                                  {isAdmin && (
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
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border py-8 text-muted-foreground">
                      <PlaneTakeoff className="h-8 w-8" />
                      <p>{emptyStateMessage}</p>
                    </div>
                  ) : (
                    rows.map((row) => (
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
                            <p className="font-medium">{row.destinationCity}</p>
                            <p className="text-xs text-muted-foreground">
                              {showRequesterColumn
                                ? row.employee?.fullName ?? row.user?.name ?? row.companyName
                                : row.companyName}
                            </p>
                            {showRequesterColumn && (
                              <p className="text-xs text-muted-foreground">{row.companyName}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={statusClass(row.status)}>
                            {getStatusLabel(row.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {row.compensationTotal !== null && row.compensationTotal !== undefined
                            ? formatCurrency(Number(row.compensationTotal))
                            : "-"}
                        </p>
                        <p className="mt-2 text-sm">{row.purpose ?? "-"}</p>
                        <div className="mt-3 flex justify-end">
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
                              <DropdownMenuItem onClick={() => openPrintForm(row)}>
                                <Printer className="mr-2 h-4 w-4" />
                                Cetak Form
                              </DropdownMenuItem>
                              {isApprover && canAdminProcess(row.status) && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "APPROVED" })}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                                  {getApproveButtonLabel(row.status)}
                                </DropdownMenuItem>
                              )}
                              {isApprover && canAdminProcess(row.status) && (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setPendingAction({ row, nextStatus: "REJECTED" })}
                                >
                                  <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                  Tolak
                                </DropdownMenuItem>
                              )}
                              {canMarkPaid(row.status) && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "PAID" })}>
                                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                  Tandai Sudah Dibayar
                                </DropdownMenuItem>
                              )}
                              {!isAdmin && row.status === "SUBMITTED" && (
                                <DropdownMenuItem onClick={() => setPendingAction({ row, nextStatus: "CANCELLED" })}>
                                  Batalkan
                                </DropdownMenuItem>
                              )}
                              {isAdmin && (
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
                    ))
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {onlyMyQueue && isApprover
                      ? total === 0
                        ? "Menampilkan 0 dari 0 data (mode Assigned to me)"
                        : `Menampilkan ${(page - 1) * PAGE_SIZE + (rows.length > 0 ? 1 : 0)}-${(page - 1) * PAGE_SIZE + rows.length} dari ${total} data (mode Assigned to me)`
                      : total === 0
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

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[640px] p-6">
          <DialogHeader>
            <DialogTitle>Pengajuan Perjalanan Dinas</DialogTitle>
            <DialogDescription>
              Isi data perjalanan dinas untuk dikirim ke approver.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Kota / Daerah Tujuan</Label>
              <Input
                value={destinationCity}
                onChange={(event) => setDestinationCity(event.target.value)}
                placeholder="Bandung"
              />
            </div>
            <div className="space-y-2">
              <Label>Nama Perusahaan</Label>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="PT Contoh"
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Berangkat</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate
                      ? format(parseDateKeyToDate(startDate) ?? new Date(startDate), "dd MMM yyyy")
                      : "Pilih tanggal berangkat"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDateKeyToDate(startDate)}
                    onSelect={(date) => {
                      if (!date) {
                        setStartDate("");
                        return;
                      }
                      setStartDate(format(date, "yyyy-MM-dd"));
                      if (endDate && new Date(format(date, "yyyy-MM-dd")) > new Date(endDate)) {
                        setEndDate("");
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Tanggal Pulang</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate
                      ? format(parseDateKeyToDate(endDate) ?? new Date(endDate), "dd MMM yyyy")
                      : "Pilih tanggal pulang"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDateKeyToDate(endDate)}
                    onSelect={(date) => {
                      if (!date) {
                        setEndDate("");
                        return;
                      }
                      setEndDate(format(date, "yyyy-MM-dd"));
                    }}
                    disabled={(date) => {
                      if (!startDate) return false;
                      const start = parseDateKeyToDate(startDate);
                      if (!start) return false;
                      return date < start;
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Tujuan / Rincian</Label>
              <Textarea
                rows={3}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Jelaskan tujuan perjalanan"
              />
            </div>
            <div className="space-y-2">
              <Label>Luar Kota / Menginap</Label>
              <Select value={isOutOfTownOvernight} onValueChange={(value: "YES" | "NO") => setIsOutOfTownOvernight(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Ya</SelectItem>
                  <SelectItem value="NO">Tidak</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transport PP</Label>
              <Select value={transportOptionId || undefined} onValueChange={setTransportOptionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih transport PP" />
                </SelectTrigger>
                <SelectContent>
                  {compensationSetting.transportOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label} - {formatCurrency(item.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Estimasi Kompensasi</p>
              {compensationPreview ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    OPE: {formatCurrency(compensationPreview.ope.daily)} x {compensationPreview.ope.days} hari ={" "}
                    {formatCurrency(compensationPreview.ope.total)}
                  </p>
                  <p>
                    Makan: {formatCurrency(compensationPreview.meal.daily)} x {compensationPreview.meal.days} hari ={" "}
                    {formatCurrency(compensationPreview.meal.total)}
                  </p>
                  <p>
                    Laundry: {formatCurrency(compensationPreview.laundry.amount)} X {compensationPreview.laundry.weeks} ={" "}
                    {formatCurrency(compensationPreview.laundry.total)}
                  </p>
                  <p>
                    Transport PP: {formatCurrency(compensationPreview.transport.amount)}
                  </p>
                  <p className="pt-1 font-semibold">
                    Total: {formatCurrency(compensationPreview.total)}
                  </p>
                  {hasMissingOpeRule ? (
                    <p className="pt-1 text-sm font-medium text-destructive">
                      Rule OPE untuk title kamu belum diatur admin. Silakan hubungi admin atau ubah
                      opsi &quot;Luar Kota / Menginap&quot; ke &quot;Tidak&quot;.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Pilih tanggal perjalanan untuk melihat estimasi.</p>
              )}
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={isSaving}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSaving || !canSubmitCreate}>
                {isSaving ? "Menyimpan..." : "Ajukan Perjalanan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => !open && setDetailRow(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[760px] max-h-[85vh] p-0 flex flex-col">
          <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
            <DialogTitle>Detail Business Trip</DialogTitle>
            <DialogDescription>Informasi pengajuan dan riwayat aksi approval.</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-4">
              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => openPrintForm(detailRow)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak Form
                </Button>
              </div>
              <div className="grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-2 md:p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Pemohon</p>
                  <p className="text-sm font-medium">{detailRow.employee?.fullName ?? detailRow.user?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusClass(detailRow.status)}>
                    {getStatusLabel(detailRow.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tujuan</p>
                  <p className="text-sm font-medium">{detailRow.destinationCity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Perusahaan</p>
                  <p className="text-sm font-medium break-words">{detailRow.companyName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Periode</p>
                  <p className="text-sm font-medium">
                    {formatDate(new Date(detailRow.startDate))} - {formatDate(new Date(detailRow.endDate))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Diajukan</p>
                  <p className="text-sm font-medium">{formatDateTime(detailRow.createdAt)}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Rincian</p>
                  <p className="text-sm font-medium break-words">{detailRow.purpose ?? "-"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Detail Kompensasi</p>
                  {detailRow.compensationBreakdown ? (
                    <>
                    <div className="mt-2 hidden overflow-auto rounded-md border md:block">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="p-2 text-left font-medium">Komponen</th>
                            <th className="p-2 text-left font-medium">Keterangan</th>
                            <th className="p-2 text-right font-medium">Nominal</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t">
                            <td className="p-2">OPE</td>
                            <td className="p-2">
                              {formatCurrency(detailRow.compensationBreakdown.ope.daily)} x{" "}
                              {detailRow.compensationBreakdown.ope.days} hari
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(detailRow.compensationBreakdown.ope.total)}
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="p-2">Makan</td>
                            <td className="p-2">
                              {formatCurrency(detailRow.compensationBreakdown.meal.daily)} x{" "}
                              {detailRow.compensationBreakdown.meal.days} hari
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(detailRow.compensationBreakdown.meal.total)}
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="p-2">Laundry</td>
                            <td className="p-2">
                              {formatCurrency(detailRow.compensationBreakdown.laundry.amount)} X{" "}
                              {detailRow.compensationBreakdown.laundry.weeks}
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(detailRow.compensationBreakdown.laundry.total)}
                            </td>
                          </tr>
                          <tr className="border-t">
                            <td className="p-2">Transport PP</td>
                            <td className="p-2">{detailRow.compensationBreakdown.transport.label ?? "-"}</td>
                            <td className="p-2 text-right">
                              {formatCurrency(detailRow.compensationBreakdown.transport.amount)}
                            </td>
                          </tr>
                          <tr className="border-t bg-muted/40">
                            <td className="p-2 text-right font-semibold" colSpan={2}>
                              Total
                            </td>
                            <td className="p-2 text-right font-semibold">
                              {formatCurrency(detailRow.compensationBreakdown.total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 space-y-2 md:hidden">
                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">OPE</p>
                        <p className="text-muted-foreground">
                          {formatCurrency(detailRow.compensationBreakdown.ope.daily)} x{" "}
                          {detailRow.compensationBreakdown.ope.days} hari
                        </p>
                        <p className="font-semibold">
                          {formatCurrency(detailRow.compensationBreakdown.ope.total)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">Makan</p>
                        <p className="text-muted-foreground">
                          {formatCurrency(detailRow.compensationBreakdown.meal.daily)} x{" "}
                          {detailRow.compensationBreakdown.meal.days} hari
                        </p>
                        <p className="font-semibold">
                          {formatCurrency(detailRow.compensationBreakdown.meal.total)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">Laundry</p>
                        <p className="text-muted-foreground">
                          {formatCurrency(detailRow.compensationBreakdown.laundry.amount)} X{" "}
                          {detailRow.compensationBreakdown.laundry.weeks}
                        </p>
                        <p className="font-semibold">
                          {formatCurrency(detailRow.compensationBreakdown.laundry.total)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">Transport PP</p>
                        <p className="text-muted-foreground">
                          {detailRow.compensationBreakdown.transport.label ?? "-"}
                        </p>
                        <p className="font-semibold">
                          {formatCurrency(detailRow.compensationBreakdown.transport.amount)}
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="font-medium">Total</p>
                        <p className="font-semibold">
                          {formatCurrency(detailRow.compensationBreakdown.total)}
                        </p>
                      </div>
                    </div>
                    </>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3 md:p-4">
                <p className="mb-2 text-sm font-semibold md:text-base">Tracking Progress Approval</p>
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
                      Flow business trip diset 1 level approval.
                    </div>
                  )}
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  {getTrackingMessage(detailRow)}
                </div>
              </div>

              <div className="rounded-lg border p-3 md:p-4">
                <p className="mb-3 text-sm font-semibold md:text-base">Riwayat Aksi</p>
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

              {isAdmin && (
                <div className="rounded-lg border p-3 md:p-4">
                  <p className="mb-3 text-sm font-semibold md:text-base">Informasi Bank Pemohon</p>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Bank Name</p>
                      <p className="font-medium">{detailRow.employee?.bankAccountName ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Bank Number</p>
                      <p className="font-medium">{detailRow.employee?.bankAccountNumber ?? "-"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPrintPreviewOpen}
        onOpenChange={(open) => {
          setIsPrintPreviewOpen(open);
          if (!open) setPrintRow(null);
        }}
      >
        <DialogContent className="sm:max-w-[900px] h-[85vh] bg-muted p-0 grid grid-rows-[auto,1fr,auto]">
          <DialogHeader className="bg-muted/95 px-6 py-4 backdrop-blur">
            <DialogTitle>Preview Business Trip</DialogTitle>
            <DialogDescription>
              Pastikan data sudah sesuai sebelum print.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-6 pb-6">
            {!printRow && (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {printRow && (
              <BusinessTripPrintPreview row={printRow} headerSrc={headerDataUrl || "/invoice-header.png"} />
            )}
          </div>
          <DialogFooter className="gap-2 bg-muted/95 px-6 py-4 backdrop-blur border-t">
            <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>
              Tutup
            </Button>
            <Button onClick={handlePrintBusinessTrip} disabled={!printRow}>
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title="Konfirmasi Aksi"
        description={pendingAction ? `Yakin ingin ${actionText(pendingAction.nextStatus)} pengajuan ini?` : ""}
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
            ? `Yakin ingin menghapus permanen pengajuan perjalanan dinas ke ${deleteTarget.destinationCity}? Aksi ini tidak bisa dibatalkan. Perhatian: pengajuan dengan status APPROVED maupun PAID juga akan terhapus permanen.`
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

function BusinessTripPrintPreview({
  row,
  headerSrc,
}: {
  row: BusinessTrip;
  headerSrc: string;
}) {
  const approvedEvent = findLatestEvent(
    row.workflowEvents ?? [],
    (event) => event.toStatus === "APPROVED"
  );
  const approvedByLabel = formatActorNameOnly(approvedEvent);
  const approvedAtLabel = approvedEvent
    ? formatDateTime(approvedEvent.createdAt)
    : row.approvedAt
    ? formatDateTime(row.approvedAt)
    : "-";
  const totalDays =
    row.allowanceDays ??
    Math.max(
      1,
      Math.floor(
        (new Date(row.endDate).getTime() - new Date(row.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1
    );

  return (
    <div className="mx-auto mt-4 max-w-[840px] space-y-4 rounded-md bg-white p-6 text-black font-[Arial] shadow-sm">
      <div className="relative h-44 overflow-hidden rounded-md border border-border/50">
        <div
          className="absolute inset-0 bg-cover bg-top"
          style={{ backgroundImage: `url(${headerSrc})` }}
        />
      </div>
      <h3 className="text-center text-xl font-bold tracking-wide text-primary">FORM BUSINESS TRIP</h3>
      {row.status !== "APPROVED" && row.status !== "PAID" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Status pengajuan belum APPROVED. Dokumen ini tercetak sebagai draft arsip.
        </div>
      ) : null}
      <div className="grid grid-cols-[220px_20px_1fr] gap-y-1 text-sm">
        <p>Client</p><p>:</p><p>{row.companyName}</p>
        <p>Period</p><p>:</p><p>{formatDate(new Date(row.startDate))} - {formatDate(new Date(row.endDate))}</p>
        <p>Location</p><p>:</p><p>{row.destinationCity}</p>
        <p>Date of Assignment</p><p>:</p>
        <p>
          {formatDate(new Date(row.createdAt))} (Approved: {approvedAtLabel})
        </p>
      </div>

      <div className="border-t border-black" />

      <div className="grid grid-cols-[220px_20px_1fr] gap-y-1 text-sm">
        <p>Name</p><p>:</p><p>{row.employee?.fullName ?? row.user?.name ?? "-"}</p>
        <p>Title - Department</p><p>:</p><p>{row.employee?.title ?? "-"} - {row.employee?.department ?? "-"}</p>
        <p>Number of Days</p><p>:</p><p>{totalDays} days</p>
        <p>Purpose</p><p>:</p><p>{row.purpose ?? "-"}</p>
      </div>

      <div className="rounded border border-black p-3 text-sm">
        <p className="mb-2 font-semibold">Compensation</p>
        <div className="overflow-auto rounded border border-black/80">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/60">
              <tr>
                <th className="border border-black/80 p-2 text-left">Komponen</th>
                <th className="border border-black/80 p-2 text-left">Keterangan</th>
                <th className="border border-black/80 p-2 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black/80 p-2">OPE</td>
                <td className="border border-black/80 p-2">
                  {formatCurrency(Number(row.compensationBreakdown?.ope.daily ?? 0))} x{" "}
                  {row.compensationBreakdown?.ope.days ?? 0} hari
                </td>
                <td className="border border-black/80 p-2 text-right">
                  {formatCurrency(Number(row.compensationBreakdown?.ope.total ?? 0))}
                </td>
              </tr>
              <tr>
                <td className="border border-black/80 p-2">Makan</td>
                <td className="border border-black/80 p-2">
                  {formatCurrency(Number(row.compensationBreakdown?.meal.daily ?? 0))} x{" "}
                  {row.compensationBreakdown?.meal.days ?? 0} hari
                </td>
                <td className="border border-black/80 p-2 text-right">
                  {formatCurrency(Number(row.compensationBreakdown?.meal.total ?? 0))}
                </td>
              </tr>
              <tr>
                <td className="border border-black/80 p-2">Laundry</td>
                <td className="border border-black/80 p-2">
                  {formatCurrency(Number(row.compensationBreakdown?.laundry.amount ?? 0))} X{" "}
                  {Number(row.compensationBreakdown?.laundry.weeks ?? 0)}
                </td>
                <td className="border border-black/80 p-2 text-right">
                  {formatCurrency(Number(row.compensationBreakdown?.laundry.total ?? 0))}
                </td>
              </tr>
              <tr>
                <td className="border border-black/80 p-2">Transport PP</td>
                <td className="border border-black/80 p-2">
                  {row.compensationBreakdown?.transport.label ?? "-"}
                </td>
                <td className="border border-black/80 p-2 text-right">
                  {formatCurrency(Number(row.compensationBreakdown?.transport.amount ?? 0))}
                </td>
              </tr>
              <tr>
                <td className="border border-black/80 p-2 text-right font-semibold" colSpan={2}>
                  Total
                </td>
                <td className="border border-black/80 p-2 text-right font-semibold">
                  {formatCurrency(Number(row.compensationBreakdown?.total ?? row.compensationTotal ?? 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border border-black p-3 text-sm">
        <p className="mb-2 font-semibold">Please transfer your payment to account:</p>
        <div className="grid grid-cols-[220px_20px_1fr] gap-y-1">
          <p>Name</p><p>:</p><p>{row.employee?.fullName ?? "-"}</p>
          <p>Bank</p><p>:</p><p>{row.employee?.bankAccountName ?? "-"}</p>
          <p>A/C</p><p>:</p><p>{row.employee?.bankAccountNumber ?? "-"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-8 text-center text-sm">
        <div>
          <p className="font-semibold">Submitted by,</p>
          <div className="h-20" />
          <p>({row.employee?.fullName ?? row.user?.name ?? "-"})</p>
        </div>
        <div>
          <p className="font-semibold">Approved by,</p>
          <div className="h-20" />
          <p>({approvedByLabel})</p>
        </div>
      </div>
    </div>
  );
}
