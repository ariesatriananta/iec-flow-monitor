"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchApprovalFlowSettings,
  updateApprovalFlowSettings,
  type ApprovalFlowPayload,
} from "@/lib/api/settings";
import { fetchEmployees } from "@/lib/api/employees";
import type { Employee } from "@/types";

const initialState: ApprovalFlowPayload = {
  leaveApprovalLevels: 2,
  leaveApproverLevel1EmployeeId: null,
  leaveApproverLevel2EmployeeId: null,
  reimbursementApprovalLevels: 2,
  reimbursementApproverLevel1EmployeeId: null,
  reimbursementApproverLevel2EmployeeId: null,
  businessTripApprovalLevels: 2,
  businessTripApproverLevel1EmployeeId: null,
  businessTripApproverLevel2EmployeeId: null,
};

type LevelKey =
  | "leaveApprovalLevels"
  | "reimbursementApprovalLevels"
  | "businessTripApprovalLevels";
type ApproverKey =
  | "leaveApproverLevel1EmployeeId"
  | "leaveApproverLevel2EmployeeId"
  | "reimbursementApproverLevel1EmployeeId"
  | "reimbursementApproverLevel2EmployeeId"
  | "businessTripApproverLevel1EmployeeId"
  | "businessTripApproverLevel2EmployeeId";

const EMPTY_VALUE = "__none__";

export default function ApprovalFlowPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<ApprovalFlowPayload>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [approvalFlow, employeesData] = await Promise.all([
          fetchApprovalFlowSettings(),
          fetchEmployees({ limit: 500 }),
        ]);
        if (!active) return;

        setForm(approvalFlow);
        setEmployeeOptions(employeesData.items.filter((item) => item.isActive));
      } catch (error) {
        console.error(error);
        if (active) {
          toast({
            title: "Error",
            description: "Gagal memuat approval flow.",
            variant: "destructive",
          });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [toast]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of employeeOptions) {
      const fullName = item.fullName || item.user?.name || item.employeeCode;
      const username = item.user?.username ? `@${item.user.username}` : "";
      const titleDept = [item.title, item.department].filter(Boolean).join(" - ");
      const label = [fullName, titleDept, username].filter(Boolean).join(" | ");
      map.set(item.id, label);
    }
    return map;
  }, [employeeOptions]);

  const employeeDisabledReasonById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of employeeOptions) {
      if (!item.user?.id) {
        map.set(item.id, "Karyawan tidak memiliki user login");
      }
    }
    return map;
  }, [employeeOptions]);

  const updateLevel = (key: LevelKey, value: 1 | 2) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(value === 1
        ? {
            ...(key === "leaveApprovalLevels" && { leaveApproverLevel2EmployeeId: null }),
            ...(key === "reimbursementApprovalLevels" && {
              reimbursementApproverLevel2EmployeeId: null,
            }),
            ...(key === "businessTripApprovalLevels" && {
              businessTripApproverLevel2EmployeeId: null,
            }),
          }
        : {}),
    }));
  };

  const updateApprover = (key: ApproverKey, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value === EMPTY_VALUE ? null : value,
    }));
  };

  const validateBeforeSave = () => {
    const required = [
      form.leaveApproverLevel1EmployeeId,
      form.reimbursementApproverLevel1EmployeeId,
      form.businessTripApproverLevel1EmployeeId,
      form.leaveApprovalLevels === 2 ? form.leaveApproverLevel2EmployeeId : "ok",
      form.reimbursementApprovalLevels === 2
        ? form.reimbursementApproverLevel2EmployeeId
        : "ok",
      form.businessTripApprovalLevels === 2 ? form.businessTripApproverLevel2EmployeeId : "ok",
    ];

    if (required.some((item) => !item)) {
      toast({
        title: "Error",
        description: "Lengkapi semua approver yang wajib.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateBeforeSave()) return;

    setIsSaving(true);
    try {
      const updated = await updateApprovalFlowSettings(form);
      setForm(updated);
      toast({
        title: "Berhasil",
        description: "Approval flow berhasil disimpan.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Gagal menyimpan approval flow.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderEmployeeSelect = (
    label: string,
    value: string | null,
    key: ApproverKey,
    disabled = false,
    placeholder = "Pilih employee approver"
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        disabled={disabled}
        value={value ?? EMPTY_VALUE}
        onValueChange={(nextValue) => updateApprover(key, nextValue)}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>-</SelectItem>
          {employeeOptions.map((employee) => (
            <SelectItem
              key={employee.id}
              value={employee.id}
              disabled={Boolean(employeeDisabledReasonById.get(employee.id))}
            >
              <span title={employeeDisabledReasonById.get(employee.id) ?? undefined}>
                {employeeNameById.get(employee.id) ?? employee.id}
                {employeeDisabledReasonById.get(employee.id)
                  ? " (Belum punya user login)"
                  : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderSection = (
    title: string,
    description: string,
    levelKey: LevelKey,
    approver1Key: ApproverKey,
    approver2Key: ApproverKey
  ) => (
    <Card className="border border-border/70">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Jumlah Approval Level</Label>
          <Select
            value={String(form[levelKey])}
            onValueChange={(value) => updateLevel(levelKey, Number(value) as 1 | 2)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Level</SelectItem>
              <SelectItem value="2">2 Level</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {renderEmployeeSelect("Approver Level 1", form[approver1Key], approver1Key)}
        {renderEmployeeSelect(
          "Approver Level 2",
          form[approver2Key],
          approver2Key,
          form[levelKey] === 1,
          "Pilih employee approver level 2"
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout title="Approval Flow">
      <div className="grid gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat approval flow...</p>}
        {renderSection(
          "Leave Management",
          "Atur alur approval untuk pengajuan cuti.",
          "leaveApprovalLevels",
          "leaveApproverLevel1EmployeeId",
          "leaveApproverLevel2EmployeeId"
        )}
        {renderSection(
          "Reimbursement",
          "Atur alur approval untuk reimbursement.",
          "reimbursementApprovalLevels",
          "reimbursementApproverLevel1EmployeeId",
          "reimbursementApproverLevel2EmployeeId"
        )}
        {renderSection(
          "Business Trip",
          "Atur alur approval untuk perjalanan dinas.",
          "businessTripApprovalLevels",
          "businessTripApproverLevel1EmployeeId",
          "businessTripApproverLevel2EmployeeId"
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Approval Flow"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
