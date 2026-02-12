"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchWorkScheduleSettings,
  updateWorkScheduleSettings,
  type WorkSchedulePayload,
} from "@/lib/api/settings";

const initialState: WorkSchedulePayload = {
  timezone: "Asia/Jakarta",
  checkInDeadline: "10:00",
  workStart: "08:00",
  workEnd: "17:00",
  allowFlexibleCheckout: true,
  workingDays: {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  },
};

const dayLabels: Array<{ key: keyof WorkSchedulePayload["workingDays"]; label: string }> = [
  { key: "monday", label: "Senin" },
  { key: "tuesday", label: "Selasa" },
  { key: "wednesday", label: "Rabu" },
  { key: "thursday", label: "Kamis" },
  { key: "friday", label: "Jumat" },
  { key: "saturday", label: "Sabtu" },
  { key: "sunday", label: "Minggu" },
];

export default function WorkSchedulePage() {
  const { toast } = useToast();
  const [form, setForm] = useState<WorkSchedulePayload>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const data = await fetchWorkScheduleSettings();
        if (active) setForm(data);
      } catch (error) {
        console.error(error);
        if (active) {
          toast({
            title: "Error",
            description: "Gagal memuat work schedule.",
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
      const updated = await updateWorkScheduleSettings(form);
      setForm(updated);
      toast({
        title: "Berhasil",
        description: "Work schedule berhasil disimpan.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menyimpan work schedule.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout title="Work Schedule">
      <div className="grid gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat work schedule...</p>}
        <Card className="border border-border/70">
          <CardHeader>
            <CardTitle>Pengaturan Jam Kerja</CardTitle>
            <CardDescription>
              Konfigurasi jadwal dan batas check-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={form.timezone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, timezone: event.target.value }))
                }
                placeholder="Asia/Jakarta"
              />
            </div>
            <div className="space-y-2">
              <Label>Batas Check-In</Label>
              <Input
                type="time"
                value={form.checkInDeadline}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, checkInDeadline: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Jam Masuk</Label>
              <Input
                type="time"
                value={form.workStart}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, workStart: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Jam Pulang</Label>
              <Input
                type="time"
                value={form.workEnd}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, workEnd: event.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                id="allowFlexibleCheckout"
                checked={form.allowFlexibleCheckout}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    allowFlexibleCheckout: Boolean(checked),
                  }))
                }
              />
              <Label htmlFor="allowFlexibleCheckout" className="cursor-pointer">
                Izinkan check-out fleksibel
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader>
            <CardTitle>Hari Kerja</CardTitle>
            <CardDescription>Pilih hari kerja aktif.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dayLabels.map((day) => (
              <div key={day.key} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  id={day.key}
                  checked={form.workingDays[day.key]}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      workingDays: {
                        ...prev.workingDays,
                        [day.key]: Boolean(checked),
                      },
                    }))
                  }
                />
                <Label htmlFor={day.key} className="cursor-pointer">
                  {day.label}
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Work Schedule"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
