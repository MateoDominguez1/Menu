"use client";

import { useRouter } from "next/navigation";
import { btnSecondary } from "@/components/ui";
import { logoutAction } from "@/server/actions";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className={btnSecondary}
      onClick={async () => {
        await logoutAction();
        router.replace("/login");
      }}
    >
      Cerrar sesion
    </button>
  );
}
