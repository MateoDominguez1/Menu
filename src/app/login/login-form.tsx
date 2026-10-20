"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btnPrimary, input } from "@/components/ui";
import { loginAction } from "@/server/actions";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await loginAction(password);
          if (res.ok) router.replace("/");
          else setError(true);
        });
      }}
    >
      <input
        type="password"
        autoFocus
        className={input}
        placeholder="Clave"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(false);
        }}
      />
      {error && <p className="text-sm text-red-600">Clave incorrecta.</p>}
      <button className={btnPrimary} disabled={pending || password === ""}>
        Entrar
      </button>
    </form>
  );
}
