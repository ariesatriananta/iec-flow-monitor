 "use client";

 import { useMemo, useState } from "react";
 import { AdminLayout } from "@/components/layout/AdminLayout";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { useToast } from "@/hooks/use-toast";
 import { useAuth } from "@/contexts/AuthContext";
 import { Eye, EyeOff, ShieldCheck } from "lucide-react";

 export default function ProfilePage() {
   const { user } = useAuth();
   const { toast } = useToast();
   const [currentPassword, setCurrentPassword] = useState("");
   const [newPassword, setNewPassword] = useState("");
   const [confirmPassword, setConfirmPassword] = useState("");
   const [showCurrent, setShowCurrent] = useState(false);
   const [showNew, setShowNew] = useState(false);
   const [showConfirm, setShowConfirm] = useState(false);
   const [isSubmitting, setIsSubmitting] = useState(false);

   const initials = useMemo(() => {
     if (!user?.name) return "U";
     return user.name
       .split(" ")
       .filter(Boolean)
       .map((part) => part[0])
       .slice(0, 2)
       .join("")
       .toUpperCase();
   }, [user?.name]);

   const handleSubmit = async (event: React.FormEvent) => {
     event.preventDefault();
 
     if (!currentPassword || !newPassword || !confirmPassword) {
       toast({
         title: "Error",
         description: "Semua field password wajib diisi.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword.length < 8) {
       toast({
         title: "Error",
         description: "Password baru minimal 8 karakter.",
         variant: "destructive",
       });
       return;
     }
 
     if (newPassword !== confirmPassword) {
       toast({
         title: "Error",
         description: "Konfirmasi password tidak cocok.",
         variant: "destructive",
       });
       return;
     }
 
     if (!user?.username) {
       toast({
         title: "Error",
         description: "User tidak ditemukan.",
         variant: "destructive",
       });
       return;
     }
 
     setIsSubmitting(true);
     try {
       const response = await fetch("/api/auth/change-password", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           username: user.username,
           currentPassword,
           newPassword,
         }),
       });
 
       if (!response.ok) {
         const payload = await response.json().catch(() => ({}));
         throw new Error(payload?.error || "Gagal mengubah password.");
       }
 
       setCurrentPassword("");
       setNewPassword("");
       setConfirmPassword("");
       toast({
         title: "Berhasil",
         description: "Password berhasil diperbarui.",
       });
     } catch (error) {
       toast({
         title: "Error",
         description:
           error instanceof Error ? error.message : "Gagal mengubah password.",
         variant: "destructive",
       });
     } finally {
       setIsSubmitting(false);
     }
   };

   return (
     <AdminLayout title="My Profile">
       <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
         <Card className="relative overflow-hidden">
           <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
           <CardHeader className="relative">
             <CardTitle>Profil Akun</CardTitle>
           </CardHeader>
           <CardContent className="relative space-y-4">
             <div className="flex items-center gap-4">
               <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                 {initials}
               </div>
               <div>
                 <p className="text-lg font-semibold">{user?.name ?? "-"}</p>
                 <p className="text-sm text-muted-foreground">
                   Username: {user?.username ?? "-"}
                 </p>
               </div>
             </div>
             <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
               <div className="flex items-center justify-between">
                 <span className="text-muted-foreground">Role</span>
                 <span className="font-medium">{user?.role ?? "-"}</span>
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-muted-foreground">Update Terakhir</span>
                 <span className="font-medium">
                   {user?.updatedAt
                     ? new Date(user.updatedAt).toLocaleDateString("id-ID")
                     : "-"}
                 </span>
               </div>
             </div>
           </CardContent>
         </Card>

         <Card className="border border-border/70">
           <CardHeader className="flex flex-row items-center gap-3">
             <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
               <ShieldCheck className="h-5 w-5" />
             </div>
             <div>
               <CardTitle>Ubah Password</CardTitle>
               <p className="text-sm text-muted-foreground">
                 Pastikan password kuat dan berbeda dari sebelumnya.
               </p>
             </div>
           </CardHeader>
           <CardContent>
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-2">
                 <Label htmlFor="currentPassword">Password Saat Ini</Label>
                 <div className="relative">
                   <Input
                     id="currentPassword"
                     type={showCurrent ? "text" : "password"}
                     value={currentPassword}
                     onChange={(event) => setCurrentPassword(event.target.value)}
                     placeholder="Masukkan password saat ini"
                   />
                   <button
                     type="button"
                     onClick={() => setShowCurrent((prev) => !prev)}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                   >
                     {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
                 </div>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="newPassword">Password Baru</Label>
                 <div className="relative">
                   <Input
                     id="newPassword"
                     type={showNew ? "text" : "password"}
                     value={newPassword}
                     onChange={(event) => setNewPassword(event.target.value)}
                     placeholder="Minimal 8 karakter"
                   />
                   <button
                     type="button"
                     onClick={() => setShowNew((prev) => !prev)}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                   >
                     {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
                 </div>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="confirmPassword">Konfirmasi Password Baru</Label>
                 <div className="relative">
                   <Input
                     id="confirmPassword"
                     type={showConfirm ? "text" : "password"}
                     value={confirmPassword}
                     onChange={(event) => setConfirmPassword(event.target.value)}
                     placeholder="Ulangi password baru"
                   />
                   <button
                     type="button"
                     onClick={() => setShowConfirm((prev) => !prev)}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                   >
                     {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
                 </div>
               </div>
               <div className="flex justify-end">
                 <Button type="submit" disabled={isSubmitting}>
                   {isSubmitting ? (
                     <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                   ) : (
                     "Simpan Password"
                   )}
                 </Button>
               </div>
             </form>
           </CardContent>
         </Card>
       </div>
     </AdminLayout>
   );
 }
