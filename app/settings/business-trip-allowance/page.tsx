"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/numbering";
import {
  fetchBusinessTripAllowanceSettings,
  updateBusinessTripAllowanceSettings,
  type BusinessTripAllowancePayload,
} from "@/lib/api/settings";
import {
  BUSINESS_TRIP_TITLES,
  DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
} from "@/lib/business-trip-allowance";

const initialState: BusinessTripAllowancePayload = {
  ...DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
};

export default function BusinessTripAllowancePage() {
  const { toast } = useToast();
  const [form, setForm] = useState<BusinessTripAllowancePayload>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const data = await fetchBusinessTripAllowanceSettings();
        if (active) setForm(data);
      } catch (error) {
        console.error(error);
        if (active) {
          toast({
            title: "Error",
            description: "Gagal memuat business trip compensation settings.",
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
      const updated = await updateBusinessTripAllowanceSettings(form);
      setForm(updated);
      toast({
        title: "Berhasil",
        description: "Business trip compensation settings berhasil disimpan.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menyimpan business trip settings.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addOpeRule = () => {
    setForm((prev) => ({
      ...prev,
      opeRules: [
        ...prev.opeRules,
        {
          id: crypto.randomUUID(),
          label: "",
          titles: [],
          dailyAllowance: 0,
        },
      ],
    }));
  };

  const addTransportOption = () => {
    setForm((prev) => ({
      ...prev,
      transportOptions: [
        ...prev.transportOptions,
        {
          id: crypto.randomUUID(),
          label: "",
          amount: 0,
        },
      ],
    }));
  };

  return (
    <AdminLayout title="Business Trip Compensation">
      <div className="grid gap-6">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat pengaturan...</p>}

        <Card className="border border-border/70">
          <CardHeader>
            <CardTitle>Komponen Default</CardTitle>
            <CardDescription>
              Komponen ini dipakai di setiap pengajuan perjalanan dinas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Makan / Hari</Label>
              <Input
                type="number"
                min={0}
                value={form.mealPerDay}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    mealPerDay: Number(event.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{formatCurrency(form.mealPerDay)}</p>
            </div>
            <div className="space-y-2">
              <Label>Laundry / Minggu</Label>
              <Input
                type="number"
                min={0}
                value={form.laundryPerWeek}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    laundryPerWeek: Number(event.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{formatCurrency(form.laundryPerWeek)}</p>
            </div>
            <div className="space-y-2">
              <Label>Laundry Mulai Dihitung Jika Hari &gt;</Label>
              <Input
                type="number"
                min={0}
                value={form.laundryMinDays}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    laundryMinDays: Number(event.target.value),
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>OPE / Hari (Berdasarkan Jabatan)</CardTitle>
              <CardDescription>
                OPE hanya dipakai jika pengajuan ditandai luar kota/menginap.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addOpeRule}>
              Tambah Rule OPE
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            {form.opeRules.map((rule) => (
              <div key={rule.id} className="rounded-md border p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
                  <div className="space-y-2">
                    <Label>Label Rule</Label>
                    <Input
                      value={rule.label}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          opeRules: prev.opeRules.map((item) =>
                            item.id === rule.id ? { ...item, label: event.target.value } : item
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ID (Auto)</Label>
                    <Input value={rule.id} readOnly className="bg-muted/40" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nominal OPE / Hari</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rule.dailyAllowance}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          opeRules: prev.opeRules.map((item) =>
                            item.id === rule.id
                              ? { ...item, dailyAllowance: Number(event.target.value) }
                              : item
                          ),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(rule.dailyAllowance)}
                    </p>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          opeRules: prev.opeRules.filter((item) => item.id !== rule.id),
                        }))
                      }
                    >
                      Hapus
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Label>Title yang termasuk rule ini</Label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {BUSINESS_TRIP_TITLES.map((title) => {
                      const checked = rule.titles.includes(title);
                      return (
                        <label key={`${rule.id}-${title}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                opeRules: prev.opeRules.map((item) => {
                                  if (item.id !== rule.id) return item;
                                  const nextTitles = value
                                    ? Array.from(new Set([...item.titles, title]))
                                    : item.titles.filter((it) => it !== title);
                                  return { ...item, titles: nextTitles };
                                }),
                              }))
                            }
                          />
                          <span>{title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Transport PP (Dinamis)</CardTitle>
              <CardDescription>
                Opsi ini akan dipilih user saat pengajuan perjalanan dinas.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={addTransportOption}>
              Tambah Transport
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {form.transportOptions.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_220px_auto]">
                <div className="grid gap-2">
                  <Input
                    value={item.label}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        transportOptions: prev.transportOptions.map((row) =>
                          row.id === item.id ? { ...row, label: event.target.value } : row
                        ),
                      }))
                    }
                    placeholder="Contoh: Transport bandara PP (Soetta)"
                  />
                  <Input value={item.id} readOnly className="bg-muted/40 text-xs" />
                </div>
                <Input
                  type="number"
                  value={item.amount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      transportOptions: prev.transportOptions.map((row) =>
                        row.id === item.id ? { ...row, amount: Number(event.target.value) } : row
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
                      transportOptions: prev.transportOptions.filter((row) => row.id !== item.id),
                    }))
                  }
                >
                  Hapus
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Business Trip Compensation"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
