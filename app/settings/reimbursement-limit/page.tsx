"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/numbering";
import {
  fetchReimbursementLimitSettings,
  updateReimbursementLimitSettings,
  type PositionLimitPayload,
  type ReimbursementLimitPayload,
} from "@/lib/api/settings";

const initialState: ReimbursementLimitPayload = {
  categoryLimit: {
    transport: 500000,
    meal: 300000,
    other: 500000,
  },
  positionLimit: [
    { id: crypto.randomUUID(), position: "Staff", monthlyLimit: 1000000 },
    { id: crypto.randomUUID(), position: "Senior Staff", monthlyLimit: 1500000 },
  ],
  maxFilesPerRequest: 10,
  maxFileSizeMb: 5,
};

export default function ReimbursementLimitPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<ReimbursementLimitPayload>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const data = await fetchReimbursementLimitSettings();
        if (active) setForm(data);
      } catch (error) {
        console.error(error);
        if (active) {
          toast({
            title: "Error",
            description: "Gagal memuat reimbursement limit.",
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateReimbursementLimitSettings(form);
      setForm(updated);
      toast({
        title: "Berhasil",
        description: "Reimbursement limit berhasil disimpan.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menyimpan reimbursement limit.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addPositionLimit = () => {
    setForm((prev) => ({
      ...prev,
      positionLimit: [
        ...prev.positionLimit,
        { id: crypto.randomUUID(), position: "", monthlyLimit: 0 } satisfies PositionLimitPayload,
      ],
    }));
  };

  return (
    <AdminLayout title="Reimbursement Limit">
      <div className="grid gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat reimbursement limit...</p>}
        <Card className="border border-border/70">
          <CardHeader>
            <CardTitle>Limit Per Kategori</CardTitle>
            <CardDescription>
              Tentukan plafon reimbursement berdasarkan kategori biaya.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Transport</Label>
              <Input
                type="number"
                value={form.categoryLimit.transport}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    categoryLimit: {
                      ...prev.categoryLimit,
                      transport: Number(event.target.value),
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(form.categoryLimit.transport)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <Input
                type="number"
                value={form.categoryLimit.meal}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    categoryLimit: {
                      ...prev.categoryLimit,
                      meal: Number(event.target.value),
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(form.categoryLimit.meal)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Other</Label>
              <Input
                type="number"
                value={form.categoryLimit.other}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    categoryLimit: {
                      ...prev.categoryLimit,
                      other: Number(event.target.value),
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(form.categoryLimit.other)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Limit Per Jabatan</CardTitle>
              <CardDescription>
                Atur plafon reimbursement bulanan per posisi.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addPositionLimit}>
              Tambah Jabatan
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {form.positionLimit.map((row) => (
              <div key={row.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_220px_auto]">
                <Input
                  value={row.position}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      positionLimit: prev.positionLimit.map((item) =>
                        item.id === row.id
                          ? { ...item, position: event.target.value }
                          : item
                      ),
                    }))
                  }
                  placeholder="Nama Jabatan"
                />
                <Input
                  type="number"
                  value={row.monthlyLimit}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      positionLimit: prev.positionLimit.map((item) =>
                        item.id === row.id
                          ? { ...item, monthlyLimit: Number(event.target.value) }
                          : item
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      positionLimit: prev.positionLimit.filter(
                        (item) => item.id !== row.id
                      ),
                    }))
                  }
                >
                  Hapus
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader>
            <CardTitle>Aturan Upload</CardTitle>
            <CardDescription>
              Batasi jumlah dan ukuran file upload per pengajuan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Maksimal File per Request</Label>
              <Input
                type="number"
                min={1}
                value={form.maxFilesPerRequest}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    maxFilesPerRequest: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Maksimal Ukuran per File (MB)</Label>
              <Input
                type="number"
                min={1}
                value={form.maxFileSizeMb}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    maxFileSizeMb: Number(event.target.value),
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Reimbursement Limit"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
