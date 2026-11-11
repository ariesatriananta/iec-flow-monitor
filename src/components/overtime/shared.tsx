"use client";

import { useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OvertimeStatus } from "@/types/overtime";

export const statusLabels: Record<OvertimeStatus, string> = {
  SUBMITTED: "Menunggu Level 1", WAITING_LEVEL_2: "Menunggu Level 2",
  APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
};

export function StatusBadge({ status }: { status: OvertimeStatus }) {
  const colors = status === "APPROVED" ? "bg-success text-success-foreground"
    : status === "REJECTED" ? "bg-destructive text-destructive-foreground"
      : status === "CANCELLED" ? "bg-muted text-muted-foreground"
        : "bg-warning text-warning-foreground";
  return <Badge variant="outline" className={`whitespace-nowrap ${colors}`}>{statusLabels[status]}</Badge>;
}

export function durationLabel(minutes: number) {
  return [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} jam` : "", minutes % 60 ? `${minutes % 60} menit` : ""].filter(Boolean).join(" ") || "0 menit";
}

export function dateLabel(value: string) {
  return format(new Date(`${value}T00:00:00`), "dd MMM yyyy", { locale: id });
}

export function wibDateTime(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(value) + " WIB";
}

export function overtimeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.";
  try {
    const parsed = JSON.parse(message) as { error?: string; message?: string };
    return parsed.error || parsed.message || message;
  } catch { return message; }
}

export function DateField({ value, onChange, label, disabled, clearable }: {
  value: string; onChange: (value: string) => void; label: string; disabled?: boolean; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  return <Popover open={open} onOpenChange={setOpen} modal>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" disabled={disabled} aria-label={label} className="w-full justify-start font-normal">
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />{value ? dateLabel(value) : "Pilih tanggal"}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" locale={id} selected={selected} defaultMonth={selected} initialFocus onSelect={date => {
        if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); }
      }} />
      {clearable && <Button type="button" variant="ghost" className="w-full" onClick={() => { onChange(""); setOpen(false); }}>Hapus tanggal</Button>}
    </PopoverContent>
  </Popover>;
}
