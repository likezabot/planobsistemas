import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const signInSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(8, "Senha mínima de 8 caracteres").max(72),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Nome obrigatório").max(120),
  tenantName: z.string().trim().min(2, "Nome da empresa obrigatório").max(120),
  restaurantName: z.string().trim().min(2, "Nome do restaurante obrigatório").max(120),
});

export default function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Entrar — Plano B SaaS Clean";
  }, []);

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate("/", { replace: true });
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
      fullName: fd.get("fullName"),
      tenantName: fd.get("tenantName"),
      restaurantName: fd.get("restaurantName"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: parsed.data.fullName,
          tenant_name: parsed.data.tenantName,
          restaurant_name: parsed.data.restaurantName,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada. Verifique seu email se necessário.");
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md surface-panel p-8">
        <div className="mb-6">
          <p className="text-mono-tag">Plano B · SaaS Clean</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Acesso ao painel
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Entre com sua conta ou crie uma nova empresa.
          </p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Senha</Label>
                <Input id="signin-password" name="password" type="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Seu nome</Label>
                <Input id="signup-name" name="fullName" required maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="signup-tenant">Empresa</Label>
                  <Input id="signup-tenant" name="tenantName" required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-restaurant">Restaurante</Label>
                  <Input id="signup-restaurant" name="restaurantName" required maxLength={120} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Senha</Label>
                <Input id="signup-password" name="password" type="password" required autoComplete="new-password" minLength={8} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Criando..." : "Criar conta"}
              </Button>
              <p className="text-xs text-gray-400">
                Membros adicionais entram apenas por convite (owner/manager).
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
