import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h1 className="mb-1 text-xl font-bold">Smart Meal Planner</h1>
        <p className="mb-5 text-sm text-stone-500">Ingresa la clave de acceso.</p>
        <LoginForm />
      </div>
    </main>
  );
}
