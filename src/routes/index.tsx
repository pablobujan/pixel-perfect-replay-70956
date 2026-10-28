import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, User, ChevronRight, Mail, Phone, IdCard } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modo Anxo Carro · CD Lugo" },
      { name: "description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:title", content: "Modo Anxo Carro · CD Lugo" },
      { property: "og:description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Crest({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" aria-label="Escudo CD Lugo">
      <path d="M50 3 L95 15 V55 C95 85 72 103 50 112 C28 103 5 85 5 55 V15 Z" fill="var(--silver)" />
      <path d="M50 9 L89 19 V55 C89 81 69 97 50 105 C31 97 11 81 11 55 V19 Z" fill="var(--primary)" />
      <path d="M50 9 V105 C31 97 11 81 11 55 V19 Z" fill="var(--foreground)" opacity=".95" />
      <text x="50" y="66" textAnchor="middle" fontFamily="Bebas Neue" fontSize="30" fill="var(--background)" stroke="var(--silver)" strokeWidth=".5">CDL</text>
    </svg>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="w-full rounded-2xl bg-primary py-4 font-display text-2xl tracking-wider text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-40" />;
}

function Index() {
  const [step, setStep] = useState<"splash" | "register" | "app">("splash");
  return (
    <div className="flex min-h-screen justify-center bg-muted">
      <div className="relative flex min-h-screen w-full max-w-[430px] flex-col bg-background">
        {step === "splash" && <Splash onNext={() => setStep("register")} />}
        {step === "register" && <Register onNext={() => setStep("app")} />}
        {step === "app" && <AppShell />}
      </div>
    </div>
  );
}

function Splash({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-between px-8 py-16 text-center">
      <div />
      <div className="flex flex-col items-center gap-8">
        <Crest size={130} />
        <div>
          <h1 className="font-display text-6xl leading-none tracking-wide">Vive o partido</h1>
          <p className="mt-2 font-display text-3xl tracking-wide text-primary">no Anxo Carro</p>
          <p className="mt-6 text-muted-foreground">Guarda el móvil. Cada minuto en la grada cuenta. Aquí se anima con el corazón, no con la pantalla.</p>
        </div>
      </div>
      <Btn onClick={onNext}>Comenzar</Btn>
    </div>
  );
}

function Field({ icon: Icon, ...p }: { icon: typeof Mail } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-input px-4 py-3.5 focus-within:border-primary">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <input {...p} required className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
    </label>
  );
}

function Register({ onNext }: { onNext: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center gap-3"><Crest size={40} /><span className="font-display text-2xl tracking-wide">CD Lugo</span></div>
      <h2 className="mt-10 font-display text-5xl tracking-wide">Identifícate</h2>
      <p className="mb-8 text-muted-foreground">Acceso rápido para socios.</p>
      <div className="flex flex-col gap-4">
        <Field icon={Mail} type="email" placeholder="Correo electrónico" />
        <Field icon={Phone} type="tel" placeholder="Teléfono móvil" />
        <Field icon={IdCard} inputMode="numeric" placeholder="Número de socio" />
      </div>
      <div className="mt-auto pt-8"><Btn type="submit">Entrar al Anxo Carro</Btn></div>
    </form>
  );
}

type Tab = "cal" | "mode" | "profile";
function AppShell() {
  const [tab, setTab] = useState<Tab>("mode");
  const items: { id: Tab; label: string }[] = [{ id: "cal", label: "Calendario" }, { id: "mode", label: "Anxo Carro" }, { id: "profile", label: "Perfil" }];
  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Crest size={30} /><span className="font-display text-xl tracking-wide">CD Lugo</span>
      </header>
      <main className="flex-1 overflow-y-auto pb-28">
        {tab === "cal" && <CalendarView />}
        {tab === "mode" && <ModeView />}
        {tab === "profile" && <ProfileView />}
      </main>
      <nav className="fixed bottom-0 w-full max-w-[430px] border-t border-border bg-card px-6 pb-4 pt-2">
        <div className="flex items-end justify-between">
          {items.map((it) => {
            const active = tab === it.id;
            if (it.id === "mode")
              return (
                <button key={it.id} onClick={() => setTab("mode")} className="-mt-8 flex flex-col items-center gap-1">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${active ? "bg-primary shadow-glow" : "bg-muted"}`}>⚽</span>
                  <span className={`text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>{it.label}</span>
                </button>
              );
            const Icon = it.id === "cal" ? Calendar : User;
            return (
              <button key={it.id} onClick={() => setTab(it.id)} className={`flex w-20 flex-col items-center gap-1 py-2 ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-6 w-6" /><span className="text-xs">{it.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

const past = [
  { rival: "Ourense CF", res: "2 - 1", date: "19 oct", home: true, w: "V" },
  { rival: "Real Avilés", res: "0 - 0", date: "12 oct", home: false, w: "E" },
  { rival: "Zamora CF", res: "3 - 1", date: "5 oct", home: true, w: "V" },
  { rival: "Arenteiro", res: "1 - 2", date: "28 sep", home: false, w: "D" },
  { rival: "Ponferradina", res: "1 - 1", date: "21 sep", home: true, w: "E" },
];

function CalendarView() {
  return (
    <div className="px-5 py-6">
      <h2 className="font-display text-4xl tracking-wide">Calendario</h2>
      <div className="mt-4 rounded-3xl border border-primary/60 bg-card p-5 shadow-glow">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Próximo partido</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex flex-col items-center gap-2"><Crest size={44} /><span className="text-sm font-semibold">CD Lugo</span></div>
          <div className="text-center"><p className="font-display text-4xl">VS</p><p className="text-xs text-muted-foreground">Dom 2 nov · 18:00</p></div>
          <div className="flex flex-col items-center gap-2"><div className="flex h-[50px] w-11 items-center justify-center rounded-lg bg-muted font-display text-xl">CUL</div><span className="text-sm font-semibold">Cultural</span></div>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">Estadio Anxo Carro</p>
      </div>
      <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Últimos resultados</h3>
      <ul className="flex flex-col gap-2">
        {past.map((m) => (
          <li key={m.date} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${m.w === "V" ? "bg-primary text-primary-foreground" : "bg-muted text-silver"}`}>{m.w}</span>
            <div className="flex-1"><p className="font-semibold">{m.home ? "vs" : "@"} {m.rival}</p><p className="text-xs text-muted-foreground">{m.date}</p></div>
            <span className="font-display text-2xl">{m.res}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function ModeView() {
  const [on, setOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const [minute, setMinute] = useState(23);
  useEffect(() => {
    const t = setInterval(() => {
      setMinute((m) => Math.min(m + 1 / 60, 95));
      if (on) setSecs((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [on]);
  const pct = Math.min(minute / 90, 1);
  const R = 120, C = 2 * Math.PI * R;
  const m = Math.floor(minute);
  return (
    <div className="flex flex-col items-center px-5 py-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">● En directo · CD Lugo 1 - 0 Cultural</p>
      <h2 className="mt-1 font-display text-4xl tracking-wide">Modo Anxo Carro</h2>
      <div className="relative mt-6 h-[280px] w-[280px]">
        <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
          <circle cx="140" cy="140" r={R} stroke="var(--muted)" strokeWidth="14" fill="none" />
          <circle cx="140" cy="140" r={R} stroke="var(--primary)" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <button onClick={() => setOn(!on)} aria-label="Activar modo" className="relative flex h-40 w-40 items-center justify-center rounded-full bg-card text-7xl transition active:scale-95">
            {on && <span className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring" />}
            <span className={on ? "animate-spin [animation-duration:6s]" : ""}>⚽</span>
          </button>
          <p className="mt-2 font-display text-3xl">{m > 90 ? `90+${m - 90}` : m}'</p>
        </div>
      </div>
      <div className="mt-6 w-full rounded-3xl bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Tiempo desconectado</p>
        <p className={`font-display text-6xl tracking-wider ${on ? "text-primary" : "text-silver"}`}>{fmt(secs)}</p>
        <p className="text-sm text-muted-foreground">{on ? "¡Así se vive! Guarda el móvil y anima." : "Pulsa el balón para desconectar."}</p>
      </div>
    </div>
  );
}

function ProfileView() {
  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-3xl text-primary-foreground">PB</div>
        <div><h2 className="font-display text-3xl tracking-wide">Pablo Buján</h2><p className="text-sm text-muted-foreground">Socio nº 04821</p></div>
      </div>
      <div className="mt-6 rounded-3xl border border-primary/60 bg-card p-5">
        <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-muted-foreground">Estado de socio</p><span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">ACTIVO</span></div>
        <p className="mt-2 font-display text-2xl">Temporada 2026/27 · Tribuna</p>
        <p className="text-sm text-muted-foreground">Total desconectado esta temporada: 14h 32m</p>
      </div>
      <ul className="mt-6 divide-y divide-border rounded-3xl bg-card">
        {["Correo electrónico", "Teléfono móvil", "Número de socio", "Notificaciones"].map((l) => (
          <li key={l} className="flex items-center justify-between px-5 py-4"><span>{l}</span><ChevronRight className="h-5 w-5 text-muted-foreground" /></li>
        ))}
      </ul>
    </div>
  );
}
