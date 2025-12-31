"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchSettings, updateSettings, type SettingsPayload } from "@/lib/api/settings";
import { Building2, FileCog, ShieldCheck } from "lucide-react";

const defaultState: SettingsPayload = {
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyLogoUrl: "/logo-1.png",
  numberingPrefix: "AP.2137",
  numberingReset: "YEARLY",
  defaultPpnRate: 11,
  defaultSignerName: "",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<SettingsPayload>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const data = await fetchSettings();
        if (active && data) {
          setFormData({
            ...data,
            defaultPpnRate: Number(data.defaultPpnRate ?? 0),
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const payload: SettingsPayload = {
        ...formData,
        defaultPpnRate: Number(formData.defaultPpnRate),
      };
      await updateSettings(payload);
      toast({
        title: "Berhasil",
        description: "Pengaturan berhasil disimpan.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menyimpan pengaturan.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Settings">
        <SettingsSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Settings">
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-border/70">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Profil Perusahaan</CardTitle>
                <CardDescription>Informasi yang tampil di dokumen dan surat.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nama Perusahaan</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(event) =>
                  setFormData({ ...formData, companyName: event.target.value })
                }
                placeholder="Nama perusahaan"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyAddress">Alamat</Label>
              <Textarea
                id="companyAddress"
                value={formData.companyAddress ?? ""}
                onChange={(event) =>
                  setFormData({ ...formData, companyAddress: event.target.value })
                }
                placeholder="Alamat lengkap"
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyPhone">Telepon</Label>
                <Input
                  id="companyPhone"
                  value={formData.companyPhone ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, companyPhone: event.target.value })
                  }
                  placeholder="+62..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyEmail">Email</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  value={formData.companyEmail ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, companyEmail: event.target.value })
                  }
                  placeholder="email@company.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyLogoUrl">URL Logo</Label>
              <Input
                id="companyLogoUrl"
                value={formData.companyLogoUrl ?? ""}
                onChange={(event) =>
                  setFormData({ ...formData, companyLogoUrl: event.target.value })
                }
                placeholder="/logo-1.png"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="border border-border/70">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileCog className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Penomoran</CardTitle>
                  <CardDescription>Atur prefix dan reset period.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="numberingPrefix">Prefix Penomoran</Label>
                <Input
                  id="numberingPrefix"
                  value={formData.numberingPrefix}
                  onChange={(event) =>
                    setFormData({ ...formData, numberingPrefix: event.target.value })
                  }
                  placeholder="AP.2137"
                />
              </div>
              <div className="space-y-2">
                <Label>Reset Nomor</Label>
                <Select
                  value={formData.numberingReset}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      numberingReset: value as SettingsPayload["numberingReset"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih periode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YEARLY">Tahunan</SelectItem>
                    <SelectItem value="MONTHLY">Bulanan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/70">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Keuangan</CardTitle>
                  <CardDescription>Pengaturan default tagihan.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultPpnRate">PPN Default (%)</Label>
                <Input
                  id="defaultPpnRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.defaultPpnRate}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      defaultPpnRate: Number(event.target.value),
                    })
                  }
                  placeholder="11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultSignerName">Nama Penandatangan</Label>
                <Input
                  id="defaultSignerName"
                  value={formData.defaultSignerName}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      defaultSignerName: event.target.value,
                    })
                  }
                  placeholder="Nama penandatangan"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end lg:col-span-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              "Simpan Perubahan"
            )}
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
