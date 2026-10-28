import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, User, ChevronRight, Mail, Phone, IdCard, Home, Plane, Bell } from "lucide-react";

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

const pent = (cx: number, cy: number, r: number, rot: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((rot + i * 72) * Math.PI) / 180;
    return `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  }).join(" ");

function Ball({ className = "", color = "var(--primary)" }: { className?: string; color?: string }) {
  const outer = [0, 1, 2, 3, 4].map((i) => {
    const a = ((36 + i * 72) * Math.PI) / 180;
    return { x: 12 + 10.2 * Math.sin(a), y: 12 - 10.2 * Math.cos(a), rot: 36 + i * 72 };
  });
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <mask id={`m-${color}`}>
          <circle cx="12" cy="12" r="11" fill="white" />
          <polygon points={pent(12, 12, 4.2, 0)} fill="black" />
          {outer.map((o, i) => <polygon key={i} points={pent(o.x, o.y, 3.6, o.rot + 180)} fill="black" />)}
          {[0, 1, 2, 3, 4].map((i) => {
            const a = ((i * 72) * Math.PI) / 180;
            return <line key={i} x1={12 + 4.2 * Math.sin(a)} y1={12 - 4.2 * Math.cos(a)} x2={12 + 7.4 * Math.sin(a)} y2={12 - 7.4 * Math.cos(a)} stroke="black" strokeWidth="1.1" />;
          })}
        </mask>
      </defs>
      <circle cx="12" cy="12" r="11" fill={color} mask={`url(#m-${color})`} />
      <circle cx="12" cy="12" r="10.6" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="w-full rounded-2xl bg-primary py-4 font-display text-2xl tracking-wider text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-40" />;
}

type UserData = { name: string; email: string; phone: string; member: string; notif: boolean };
type UserProps = { user: UserData; setUser: (u: UserData) => void };
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const shortName = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ") || "Socio";

function Index() {
  const [step, setStep] = useState<"splash" | "register" | "app">("splash");
  const [user, setUser] = useState<UserData>({ name: "", email: "", phone: "", member: "", notif: true });
  return (
    <div className="flex min-h-screen justify-center bg-muted">
      <div className="relative flex min-h-screen w-full max-w-[430px] flex-col bg-background">
        <div key={step} className="animate-screen-in flex min-h-0 flex-1 flex-col">
          {step === "splash" && <Splash onNext={() => setStep("register")} />}
          {step === "register" && <Register user={user} setUser={setUser} onNext={() => setStep("app")} />}
          {step === "app" && <AppShell user={user} setUser={setUser} />}
        </div>
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
          <h1 className="font-display text-6xl leading-none tracking-wide">Vive el partido</h1>
          <p className="mt-2 font-display text-3xl tracking-wide text-primary">en el Anxo Carro</p>
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

function Register({ onNext, user, setUser }: { onNext: () => void } & UserProps) {
  const bind = (k: "name" | "email" | "phone" | "member") => ({ value: user[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setUser({ ...user, [k]: e.target.value }) });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center gap-3"><Crest size={40} /><span className="font-display text-2xl tracking-wide">CD Lugo</span></div>
      <h2 className="mt-10 font-display text-5xl tracking-wide">Identifícate</h2>
      <p className="mb-8 text-muted-foreground">Acceso rápido para socios.</p>
      <div className="flex flex-col gap-4">
        <Field icon={User} placeholder="Nombre completo" {...bind("name")} />
        <Field icon={Mail} type="email" placeholder="Correo electrónico" {...bind("email")} />
        <Field icon={Phone} type="tel" placeholder="Teléfono móvil" {...bind("phone")} />
        <Field icon={IdCard} inputMode="numeric" placeholder="Número de socio" {...bind("member")} />
      </div>
      <div className="mt-auto pt-8"><Btn type="submit">Entrar al Anxo Carro</Btn></div>
    </form>
  );
}

type Tab = "cal" | "mode" | "profile";
function AppShell({ user, setUser }: UserProps) {
  const [tab, setTab] = useState<Tab>("mode");
  const items: { id: Tab; label: string }[] = [{ id: "cal", label: "Calendario" }, { id: "mode", label: "Anxo Carro" }, { id: "profile", label: "Perfil" }];
  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Crest size={30} /><span className="font-display text-xl tracking-wide">CD Lugo</span>
      </header>
      <main key={tab} className="animate-screen-in flex-1 overflow-y-auto pb-28">
        {tab === "cal" && <CalendarView />}
        {tab === "mode" && <ModeView />}
        {tab === "profile" && <ProfileView user={user} setUser={setUser} />}
      </main>
      <nav className="fixed bottom-0 w-full max-w-[430px] border-t border-border bg-card px-6 pb-4 pt-2">
        <div className="flex items-end justify-between">
          {items.map((it) => {
            const active = tab === it.id;
            if (it.id === "mode")
              return (
                <button key={it.id} onClick={() => setTab("mode")} className="-mt-8 flex flex-col items-center gap-1">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full ${active ? "bg-primary shadow-glow" : "bg-muted"}`}><Ball className="h-9 w-9" color={active ? "var(--primary-foreground)" : "var(--primary)"} /></span>
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
  { rival: "Ourense CF", gf: 2, ga: 1, date: "19 oct", home: true },
  { rival: "Real Avilés", gf: 0, ga: 0, date: "12 oct", home: false },
  { rival: "Zamora CF", gf: 3, ga: 1, date: "5 oct", home: true },
  { rival: "Arenteiro", gf: 1, ga: 2, date: "28 sep", home: false },
  { rival: "Ponferradina", gf: 1, ga: 1, date: "21 sep", home: true },
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
        {past.map((m, i) => {
          const w = m.gf > m.ga ? "V" : m.gf === m.ga ? "E" : "D";
          const badge = w === "V" ? "bg-win text-primary-foreground" : w === "E" ? "bg-muted text-silver" : "bg-primary text-primary-foreground";
          const [l, v] = m.home ? ["CD Lugo", m.rival] : [m.rival, "CD Lugo"];
          const [gl, gv] = m.home ? [m.gf, m.ga] : [m.ga, m.gf];
          const Where = m.home ? Home : Plane;
          return (
            <li key={m.date} style={{ animationDelay: `${i * 70}ms` }} className="animate-screen-in flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badge}`}>{w}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${m.home ? "font-bold" : ""}`}>{l}</p>
                <p className={`truncate text-sm ${!m.home ? "font-bold" : ""}`}>{v}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Where className="h-3 w-3" />{m.home ? "En casa" : "Visitante"} · {m.date}</p>
              </div>
              <div className="flex flex-col items-end font-display text-2xl leading-tight"><span>{gl}</span><span>{gv}</span></div>
            </li>
          );
        })}
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
            <Ball className={`h-24 w-24 ${on ? "animate-spin [animation-duration:6s]" : ""}`} />
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

function ProfileView({ user, setUser }: UserProps) {
  const [edit, setEdit] = useState<null | "name" | "email" | "phone" | "member">(null);
  const rows: { k: "name" | "email" | "phone" | "member"; l: string; icon: typeof Mail }[] = [
    { k: "name", l: "Nombre completo", icon: User },
    { k: "email", l: "Correo electrónico", icon: Mail },
    { k: "phone", l: "Teléfono móvil", icon: Phone },
    { k: "member", l: "Número de socio", icon: IdCard },
  ];
  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-3xl text-primary-foreground">{initials(user.name)}</div>
        <div><h2 className="font-display text-3xl tracking-wide">{shortName(user.name)}</h2><p className="text-sm text-muted-foreground">Socio nº {user.member || "—"}</p></div>
      </div>
      <div className="mt-6 rounded-3xl border border-primary/60 bg-card p-5">
        <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-muted-foreground">Estado de socio</p><span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">ACTIVO</span></div>
        <p className="mt-2 font-display text-2xl">Temporada 2026/27</p>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-3xl bg-card">
        {rows.map(({ k, l, icon: Icon }) => (
          <li key={k} className="px-5 py-4">
            <button onClick={() => setEdit(edit === k ? null : k)} className="flex w-full items-center gap-3 text-left">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{l}</p><p className="truncate">{user[k] || "—"}</p></div>
              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${edit === k ? "rotate-90" : ""}`} />
            </button>
            <div className={`grid transition-all duration-300 ease-out ${edit === k ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <input value={user[k]} onChange={(e) => setUser({ ...user, [k]: e.target.value })} placeholder={l} className="w-full rounded-xl border border-input bg-transparent px-4 py-3 outline-none focus:border-primary" />
              </div>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 px-5 py-4">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1">Notificaciones</span>
          <button role="switch" aria-checked={user.notif} aria-label="Notificaciones" onClick={() => setUser({ ...user, notif: !user.notif })} className={`relative h-8 w-14 rounded-full transition-colors duration-300 ${user.notif ? "bg-win" : "bg-muted"}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-foreground shadow transition-all duration-300 ${user.notif ? "left-7" : "left-1"}`} />
          </button>
        </li>
      </ul>
    </div>
  );
}
