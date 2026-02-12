"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchApprovalFlowSettings,
  updateApprovalFlowSettings,
  type ApprovalFlowPayload,
} from "@/lib/api/settings";

const initialState: ApprovalFlowPayload = {
  leaveApprovalLevels: 2,
  leaveApproverLevel1Role: "ADMIN_1",
  leaveApproverLevel2Role: "ADMIN_2",
  reimbursementApprovalLevels: 2,
  reimbursementApproverLevel1Role: "ADMIN_1",
  reimbursementApproverLevel2Role: "ADMIN_2",
  businessTripApprovalLevels: 2,
  businessTripApproverLevel1Role: "ADMIN_1",
  businessTripApproverLevel2Role: "ADMIN_2",
};

export default function ApprovalFlowPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<ApprovalFlowPayload>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const data = await fetchApprovalFlowSettings();
        if (active) setForm(data);
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
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateApprovalFlowSettings(form);
      setForm(updated);
      toast({
        title: "Berhasil",
        description: "Approval flow berhasil disimpan.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menyimpan approval flow.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSection = (
    title: string,
    description: string,
    levelKey: keyof Pick<
      ApprovalFlowPayload,
      "leaveApprovalLevels" | "reimbursementApprovalLevels" | "businessTripApprovalLevels"
    >,
    approver1Key: keyof Pick<
      ApprovalFlowPayload,
      "leaveApproverLevel1Role" | "reimbursementApproverLevel1Role" | "businessTripApproverLevel1Role"
    >,
    approver2Key: keyof Pick<
      ApprovalFlowPayload,
      "leaveApproverLevel2Role" | "reimbursementApproverLevel2Role" | "businessTripApproverLevel2Role"
    >
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
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                [levelKey]: Number(value) as 1 | 2,
              }))
            }
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
        <div className="space-y-2">
          <Label>Approver Level 1</Label>
          <Input
            value={form[approver1Key]}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                [approver1Key]: event.target.value,
              }))
            }
            placeholder="ADMIN_1"
          />
        </div>
        <div className="space-y-2">
          <Label>Approver Level 2</Label>
          <Input
            disabled={form[levelKey] === 1}
            value={form[approver2Key]}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                [approver2Key]: event.target.value,
              }))
            }
            placeholder="ADMIN_2"
          />
        </div>
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
          "leaveApproverLevel1Role",
          "leaveApproverLevel2Role"
        )}
        {renderSection(
          "Reimbursement",
          "Atur alur approval untuk reimbursement.",
          "reimbursementApprovalLevels",
          "reimbursementApproverLevel1Role",
          "reimbursementApproverLevel2Role"
        )}
        {renderSection(
          "Business Trip",
          "Atur alur approval untuk perjalanan dinas.",
          "businessTripApprovalLevels",
          "businessTripApproverLevel1Role",
          "businessTripApproverLevel2Role"
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
