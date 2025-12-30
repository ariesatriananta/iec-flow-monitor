"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    document.title = 'IECNET - Login';
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        toast({
          title: 'Login berhasil',
          description: 'Selamat datang di IECNET Admin System',
        });
        router.push('/dashboard');
      } else {
        toast({
          title: 'Login gagal',
          description: 'Email atau password salah',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Terjadi kesalahan saat login',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted/40 p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(900px circle at 15% 0%, hsl(var(--primary) / 0.12), transparent 55%)," +
            "radial-gradient(700px circle at 85% 10%, hsl(var(--chart-2) / 0.1), transparent 50%)," +
            "repeating-linear-gradient(135deg, hsl(var(--foreground) / 0.05) 0, hsl(var(--foreground) / 0.05) 1px, transparent 1px, transparent 6px)",
        }}
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="pointer-events-none absolute -inset-10 rounded-[32px] bg-[radial-gradient(120px_120px_at_20%_15%,rgba(56,189,248,0.35),transparent_60%),radial-gradient(160px_160px_at_80%_20%,rgba(34,197,94,0.25),transparent_65%),radial-gradient(220px_220px_at_50%_85%,rgba(59,130,246,0.2),transparent_70%)] opacity-70 blur-2xl" />
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <img
            src="/logo-1.png"
            alt="IECNET Logo"
            className="mx-auto mb-4 h-auto w-auto max-w-full rounded-lg"
          />
          <h1 className="text-2xl font-bold text-foreground">IECNET Admin System</h1>
        </div>

        <Card className="border-0 bg-transparent shadow-none">
            <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-white/15 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.55)] ring-1 ring-white/20 backdrop-blur-2xl backdrop-saturate-[180%] dark:border-white/10 dark:bg-slate-900/30 dark:ring-white/10">
                
                {/* Top glow / reflection */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/60 via-white/10 to-transparent dark:from-white/15 dark:via-transparent" />

                {/* Light spots (biar keliatan “kaca kena cahaya”) */}
                <div
                className="pointer-events-none absolute inset-0 opacity-90"
                style={{
                    backgroundImage:
                    "radial-gradient(280px 180px at 20% 10%, rgba(255,255,255,0.55), transparent 65%)," +
                    "radial-gradient(240px 180px at 85% 20%, rgba(255,255,255,0.35), transparent 70%)," +
                    "radial-gradient(300px 220px at 50% 110%, rgba(59,130,246,0.18), transparent 70%)",
                }}
                />

                {/* Inner highlight line (bikin depth) */}
                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" />

                {/* Noise texture (super penting biar nggak keliatan flat) */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E%3Cfilter id=%22n%22 x=%220%22 y=%220%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22160%22 height=%22160%22 filter=%22url(%23n)%22 opacity=%220.35%22/%3E%3C/svg%3E')]" />

                <CardHeader className="relative z-10 space-y-1">
                <CardTitle className="text-xl">Login</CardTitle>
                <CardDescription>
                    Masukkan credentials untuk mengakses dashboard
                </CardDescription>
                </CardHeader>

                <CardContent className="relative z-10">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                        id="email"
                        type="email"
                        placeholder="admin@iecnet.co.id"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isLoading}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                            ) : (
                            <Eye className="w-4 h-4" />
                            )}
                        </button>
                        </div>
                    </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Login
                  </span>
                )}
              </Button>
                    </form>

            {/* Demo credentials hint */}
            <div className="mt-6 rounded-md border border-border/60 bg-muted/70 p-3 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground text-center">
                <strong>Demo:</strong> admin@iecnet.co.id / admin123
              </p>
            </div>
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  );
}
